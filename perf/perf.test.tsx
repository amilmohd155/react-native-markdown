import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import { act, create } from 'react-test-renderer';
import { editLastParagraph, F1, F2, F3 } from '../bench/fixtures';
import type { MarkdownDocument } from '../src/api/document';
import { Markdown } from '../src/api/Markdown';
import { parse } from '../src/api/parse';
import baseline from './baseline.json';

/**
 * Performance regression test (06-testing.md · Performance regression
 * tests). Run it with `yarn perf` (`node --jitless`, the closest CI proxy for
 * Hermes). It fails when a metric is more than 20% slower than the stored
 * baseline.
 *
 * Absolute times depend on the machine, so every metric is a ratio to
 * markdown-it parsing the same text (as P1-10 does for conversion). The two
 * are sampled alternately in one loop, so a change in machine load while the
 * test runs hits both and cancels. Each side is the best of its runs: noise on
 * a shared machine only ever adds time. A slower runner slows both, so the
 * ratio holds; only a change in our code moves it.
 *
 * `perf/baseline.json` holds the ratios. After an intended change, regenerate
 * it with `yarn perf:update` and commit it.
 *
 * A failing metric is retried twice, so only a regression that repeats fails.
 *
 * Streaming (500 chunks of 10 KB) is phase 2: there is nothing to measure yet.
 *
 * `node --jitless` has no WebAssembly, which Babel's Hermes parser needs to
 * compile React Native's own files. So `yarn perf` first runs this file
 * with PERF_WARM=1 and the JIT on: it measures nothing and only fills Jest's
 * transform cache. The measured run then reads everything from the cache.
 */
const TOLERANCE = 1.2;
const UPDATE = process.env.PERF_UPDATE === '1';
const WARM = process.env.PERF_WARM === '1';

/**
 * Milliseconds, with sub-millisecond resolution. Not `performance.now()`:
 * React Native's Jest setup replaces it with `Date.now`.
 */
const now = () => Number(process.hrtime.bigint()) / 1e6;

/** One timed run: does its own setup and cleanup outside the timing. */
type Sample = () => number;

const timed =
  (fn: () => void): Sample =>
  () => {
    const start = now();
    fn();
    return now() - start;
  };

/** Mounts `<Markdown document>` and times the mount, or an update to `edited`. */
function mounted(
  document: MarkdownDocument,
  edited?: MarkdownDocument
): Sample {
  return () => {
    let root!: ReturnType<typeof create>;
    let start = now();
    act(() => {
      root = create(<Markdown document={document} />);
    });
    if (edited) {
      start = now();
      act(() => root.update(<Markdown document={edited} />));
    }
    const elapsed = now() - start;
    act(() => root.unmount());
    return elapsed;
  };
}

interface Size {
  readonly name: string;
  readonly source: string;
  readonly warmup: number;
  readonly runs: number;
}

const SIZES: readonly Size[] = [
  { name: '1KB', source: F1, warmup: 30, runs: 200 },
  { name: '10KB', source: F2, warmup: 5, runs: 40 },
  { name: '100KB', source: F3, warmup: 3, runs: 20 },
  { name: '1MB', source: F3.repeat(10), warmup: 1, runs: 8 },
];

const md = new MarkdownIt();
const yardstick = (source: string): Sample => timed(() => md.parse(source, {}));

const measured: Record<string, number> = {};
const lines: string[] = [];

/** Best metric time over best markdown-it time, sampled alternately. */
function ratioOf(
  key: string,
  metric: Sample,
  reference: Sample,
  { warmup, runs }: Size
) {
  for (let i = 0; i < warmup; i++) {
    metric();
    reference();
  }
  let bestMetric = Infinity;
  let bestReference = Infinity;
  for (let i = 0; i < runs; i++) {
    bestReference = Math.min(bestReference, reference());
    bestMetric = Math.min(bestMetric, metric());
  }
  const ratio = bestMetric / bestReference;
  measured[key] = ratio;

  const base = (baseline as Record<string, unknown>)[key];
  lines.push(
    `${key.padEnd(26)} ${bestMetric.toFixed(2).padStart(9)} ms   ratio ${ratio.toFixed(3)}` +
      (typeof base === 'number'
        ? `   baseline ${base}   (${((ratio / base - 1) * 100).toFixed(0)}%)`
        : '   no baseline')
  );
  if (UPDATE) return;
  if (typeof base !== 'number') {
    throw new Error(`No baseline for ${key}: run \`yarn perf:update\`.`);
  }
  expect(ratio).toBeLessThanOrEqual(base * TOLERANCE);
}

jest.setTimeout(10 * 60 * 1000);
// A metric must be over the limit on every attempt to fail: a real regression
// repeats, a noisy neighbour on a shared runner doesn't.
jest.retryTimes(2);

(WARM ? it : it.skip)('warms the transform cache (no measurements)', () => {
  // One of each thing the measured run does, so every module it needs is
  // compiled: parse, mount, update, unmount.
  mounted(parse(F1), parse(editLastParagraph(F1)))();
  md.parse(F1, {});
});

(WARM ? describe.skip : describe)(
  'perf (ratio to markdown-it, node --jitless)',
  () => {
    afterAll(() => {
      process.stdout.write(`\n${lines.join('\n')}\n`);
      if (!UPDATE) return;
      const rounded = Object.fromEntries(
        Object.entries(measured).map(([k, v]) => [k, Number(v.toPrecision(3))])
      );
      const next = {
        note: 'Ratios to markdown-it parsing the same text. Regenerate with `yarn perf:update`.',
        node: process.version,
        ...rounded,
      };
      writeFileSync(
        join(__dirname, 'baseline.json'),
        `${JSON.stringify(next, null, 2)}\n`
      );
    });

    describe.each(SIZES)('$name', (size) => {
      it('parse', () => {
        ratioOf(
          `parse:${size.name}`,
          timed(() => parse(size.source)),
          yardstick(size.source),
          size
        );
      });

      it('render', () => {
        ratioOf(
          `render:${size.name}`,
          mounted(parse(size.source)),
          yardstick(size.source),
          size
        );
      });
    });

    it('re-renders one edited block (100KB)', () => {
      const size = SIZES[2]!;
      ratioOf(
        'rerender-one-block:100KB',
        mounted(parse(size.source), parse(editLastParagraph(size.source))),
        yardstick(size.source),
        size
      );
    });
  }
);
