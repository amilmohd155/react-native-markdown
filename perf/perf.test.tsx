import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import { act } from 'react';
import { createRoot } from 'test-renderer';
import { editLastParagraph, F1, F2, F3 } from '../bench/fixtures';
import type { MarkdownDocument } from '../src/api/document';
import { Markdown } from '../src/api/Markdown';
import { parse } from '../src/api/parse';
import { createMarkdownStreamCore } from '../src/stream/createMarkdownStream';
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
 * `perf/baseline.json` holds the ratios, one section per platform: render
 * cost relative to parsing differs between machines (a Mac and a Linux CI
 * runner differ by about 35%), so a baseline only gates the platform it was
 * recorded on. A platform with no baseline is skipped locally and fails in CI.
 * After an intended change, regenerate it with `yarn perf:update` and commit
 * it. For `linux-x64`, a failed CI run uploads a `perf-baseline` artifact:
 * commit its `linux-x64` section.
 *
 * A failing metric is retried twice, so only a regression that repeats fails.
 *
 * Streaming (`stream:F4a`): the summed time of the 500 `append` flushes of the
 * stream core for F2 (~10 KB) in 500 equal chunks (benchmark-protocol.md#f4,
 * `streamCost`), one flush per chunk with no scheduler coalescing, over one full
 * `parse()` of the same text. Unlike the other metrics its yardstick is our own
 * `parse`, as in the protocol. `done()` is not included (`finalDone`).
 *
 * `node --jitless` has no WebAssembly, which Babel's Hermes parser needs to
 * compile React Native's own files. So `yarn perf` first runs this file
 * with PERF_WARM=1 and the JIT on: it measures nothing and only fills Jest's
 * transform cache. The measured run then reads everything from the cache.
 */
const TOLERANCE = 1.2;
const UPDATE = process.env.PERF_UPDATE === '1';
const WARM = process.env.PERF_WARM === '1';
const PLATFORM = `${process.platform}-${process.arch}`;

type Baselines = {
  note?: string;
  platforms: Record<string, Record<string, unknown>>;
};
const stored = baseline as unknown as Baselines;
const expected = stored.platforms[PLATFORM];

// React's `act` needs this flag; the renderer is `test-renderer`, as under RNTL.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Milliseconds, with sub-millisecond resolution. Not `performance.now()`:
 * React Native's Jest setup replaces it with `Date.now`.
 */
const now = () => Number(process.hrtime.bigint()) / 1e6;

/** One timed run: does its own setup and cleanup outside the timing. */
type Sample = () => number | Promise<number>;

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
  return async () => {
    const root = createRoot();
    let start = now();
    await act(async () => root.render(<Markdown document={document} />));
    if (edited) {
      start = now();
      await act(async () => root.render(<Markdown document={edited} />));
    }
    const elapsed = now() - start;
    await act(async () => root.unmount());
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

/** Sum of the flush times of a stream of `count` chunks; setup and `done()` are outside the timing. */
function streamed(source: string, count: number): Sample {
  const size = Math.ceil(source.length / count);
  const chunks: string[] = [];
  for (let i = 0; i < source.length; i += size) {
    chunks.push(source.slice(i, i + size));
  }
  return () => {
    const core = createMarkdownStreamCore();
    let total = 0;
    for (const chunk of chunks) {
      const start = now();
      core.append(chunk);
      total += now() - start;
    }
    core.done();
    return total;
  };
}

const md = new MarkdownIt();
const yardstick = (source: string): Sample => timed(() => md.parse(source, {}));

const measured: Record<string, number> = {};
const lines: string[] = [];

/** Best metric time over best markdown-it time, sampled alternately. */
async function ratioOf(
  key: string,
  metric: Sample,
  reference: Sample,
  { warmup, runs }: Size
) {
  for (let i = 0; i < warmup; i++) {
    await metric();
    await reference();
  }
  let bestMetric = Infinity;
  let bestReference = Infinity;
  for (let i = 0; i < runs; i++) {
    bestReference = Math.min(bestReference, await reference());
    bestMetric = Math.min(bestMetric, await metric());
  }
  const ratio = bestMetric / bestReference;
  measured[key] = ratio;

  const base = expected?.[key];
  lines.push(
    `${key.padEnd(26)} ${bestMetric.toFixed(2).padStart(9)} ms   ratio ${ratio.toFixed(3)}` +
      (typeof base === 'number'
        ? `   baseline ${base}   (${((ratio / base - 1) * 100).toFixed(0)}%)`
        : '   no baseline')
  );
  if (UPDATE) return;
  if (expected === undefined) {
    // Nothing to compare with on this platform. CI must not pass silently.
    if (process.env.CI) {
      throw new Error(
        `No perf baseline for ${PLATFORM}. Take the perf-baseline artifact of this run and commit its ${PLATFORM} section.`
      );
    }
    return;
  }
  if (typeof base !== 'number') {
    throw new Error(
      `No baseline for ${key} on ${PLATFORM}: run \`yarn perf:update\`.`
    );
  }
  expect(ratio).toBeLessThanOrEqual(base * TOLERANCE);
}

jest.setTimeout(10 * 60 * 1000);
// A metric must be over the limit on every attempt to fail: a real regression
// repeats, a noisy neighbour on a shared runner doesn't.
jest.retryTimes(2);

(WARM ? it : it.skip)(
  'warms the transform cache (no measurements)',
  async () => {
    // One of each thing the measured run does, so every module it needs is
    // compiled: parse, mount, update, unmount.
    await mounted(parse(F1), parse(editLastParagraph(F1)))();
    streamed(F1, 20)();
    md.parse(F1, {});
  }
);

(WARM ? describe.skip : describe)(
  'perf (ratio to markdown-it, node --jitless)',
  () => {
    afterAll(() => {
      process.stdout.write(`\n${PLATFORM}\n${lines.join('\n')}\n`);
      if (!UPDATE) return;
      const rounded = Object.fromEntries(
        Object.entries(measured).map(([k, v]) => [k, Number(v.toPrecision(3))])
      );
      const next: Baselines = {
        note: stored.note,
        platforms: {
          ...stored.platforms,
          [PLATFORM]: { node: process.version, ...rounded },
        },
      };
      writeFileSync(
        join(__dirname, 'baseline.json'),
        `${JSON.stringify(next, null, 2)}\n`
      );
    });

    describe.each(SIZES)('$name', (size) => {
      it('parse', async () => {
        await ratioOf(
          `parse:${size.name}`,
          timed(() => parse(size.source)),
          yardstick(size.source),
          size
        );
      });

      it('render', async () => {
        await ratioOf(
          `render:${size.name}`,
          mounted(parse(size.source)),
          yardstick(size.source),
          size
        );
      });
    });

    it('re-renders one edited block (100KB)', async () => {
      const size = SIZES[2]!;
      await ratioOf(
        'rerender-one-block:100KB',
        mounted(parse(size.source), parse(editLastParagraph(size.source))),
        yardstick(size.source),
        size
      );
    });

    it('streams F4a (10KB in 500 chunks)', async () => {
      const size = SIZES[1]!;
      await ratioOf(
        'stream:F4a',
        streamed(F2, 500),
        timed(() => parse(F2)),
        size
      );
    });
  }
);
