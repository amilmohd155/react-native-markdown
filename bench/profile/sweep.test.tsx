import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot } from 'test-renderer';
import { tableOf } from '../../src/api/document';
import { Markdown } from '../../src/api/Markdown';
import { parse } from '../../src/api/parse';
import { nodeTypeName } from '../../src/model';
import {
  createRenderCtx,
  defaultComponents,
  renderBlock,
  type Components,
} from '../../src/render';
import { lightTheme, resolveTheme } from '../../src/theme';
import { VARIANTS } from './variants';

/**
 * Sweep A (issue #36, task B1): where does v1's firstRender go, in Node.
 *
 * - Node-type tally of F3's table (exact counts per NodeType).
 * - `renderBlock(table, i, ctx)` over every F3 block with stub no-op
 *   components, bucketed by top-level block type. Inclusive time: it covers
 *   the block's whole subtree (inline flattening, props, theme lookups,
 *   `createElement`), never React reconciliation or the real components.
 *   Blocks of one bucket run in one timed loop, so timer overhead is
 *   negligible (one pair of `hrtime` calls per loop, subtracted).
 * - The same for each differential variant of F3 (bench/profile/variants.ts),
 *   plus a full `<Markdown document>` mount with the real default components
 *   (React reconciliation included, no layout, so tables never measure).
 * - Cold `resolveTheme` cost: the first call in the process, then warm.
 *
 * Run with `yarn profile` / `yarn profile:jitless` in bench/ (a Jest run
 * with the React Native preset; PROFILE_REPS sets the repetitions).
 * Numbers are Node on this machine: ratios between buckets carry over,
 * absolute times don't (device Hermes is several times slower).
 */
const WARM = process.env.PROFILE_WARM === '1';
const REPS = Number(process.env.PROFILE_REPS ?? '30');
const MODE = process.env.PROFILE_MODE ?? 'jit';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Milliseconds. Not `performance.now()`: RN's Jest setup replaces it. */
const now = () => Number(process.hrtime.bigint()) / 1e6;

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** Cost of one timer pair, to subtract from loops. */
function timerOverhead(): number {
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t0 = now();
    samples.push(now() - t0);
  }
  return median(samples);
}

const stubComponents = Object.freeze(
  Object.fromEntries(
    Object.keys(defaultComponents).map((name) => [name, () => null])
  )
) as unknown as Components;

const sink: unknown[] = [];

interface Bucket {
  readonly type: string;
  readonly blocks: number[];
}

function bucketsOf(source: string) {
  const document = parse(source);
  const table = tableOf(document);
  const byType = new Map<string, number[]>();
  for (let i = 0; i < table.blockCount; i++) {
    const type = nodeTypeName(table.type[table.blocks[i]!]!);
    byType.set(type, [...(byType.get(type) ?? []), i]);
  }
  const buckets: Bucket[] = [...byType].map(([type, blocks]) => ({
    type,
    blocks,
  }));
  return { document, table, buckets };
}

/** Exact node counts per NodeType over the whole table. */
function tally(source: string): Record<string, number> {
  const { table } = bucketsOf(source);
  const counts: Record<string, number> = {};
  for (let id = 0; id < table.count; id++) {
    const name = nodeTypeName(table.type[id]!);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

interface BucketResult {
  type: string;
  blocks: number;
  ms: number;
  usPerBlock: number;
  pct: number;
}

/** Median over `reps` of the inclusive renderBlock time per bucket. */
function sweep(source: string, reps: number) {
  const { table, buckets } = bucketsOf(source);
  const ctx = createRenderCtx({ components: stubComponents });
  const overhead = timerOverhead();
  const samples = new Map<string, number[]>();
  const totals: number[] = [];
  for (let rep = 0; rep < reps; rep++) {
    let total = 0;
    // Rotate the bucket order so no bucket always follows the same one.
    for (let b = 0; b < buckets.length; b++) {
      const bucket = buckets[(b + rep) % buckets.length]!;
      const t0 = now();
      for (const index of bucket.blocks)
        sink.push(renderBlock(table, index, ctx));
      const ms = now() - t0 - overhead;
      sink.length = 0;
      total += ms;
      const list = samples.get(bucket.type) ?? [];
      list.push(ms);
      samples.set(bucket.type, list);
    }
    totals.push(total);
  }
  const total = median(totals);
  const results: BucketResult[] = buckets.map((bucket) => {
    const ms = median(samples.get(bucket.type)!);
    return {
      type: bucket.type,
      blocks: bucket.blocks.length,
      ms,
      usPerBlock: (ms * 1000) / bucket.blocks.length,
      pct: (ms / total) * 100,
    };
  });
  results.sort((a, b) => b.ms - a.ms);
  return { results, total, blockCount: table.blockCount };
}

/** Median `<Markdown document>` mount time with the real default components. */
async function mountMedian(source: string, reps: number) {
  const document = parse(source);
  const samples: number[] = [];
  for (let i = 0; i < reps + 2; i++) {
    const root = createRoot();
    const t0 = now();
    await act(async () => root.render(<Markdown document={document} />));
    const ms = now() - t0;
    await act(async () => root.unmount());
    if (i >= 2) samples.push(ms);
  }
  return median(samples);
}

const fmt = (n: number, d = 2) => n.toFixed(d);

jest.setTimeout(30 * 60 * 1000);

(WARM ? it : it.skip)(
  'warms the transform cache (no measurements)',
  async () => {
    const doc = parse('# a\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    const table = tableOf(doc);
    const ctx = createRenderCtx({ components: stubComponents });
    renderBlock(table, 0, ctx);
    resolveTheme(lightTheme);
    await act(async () => createRoot().render(<Markdown document={doc} />));
  }
);

(WARM ? it.skip : it)('sweeps F3 and its variants', async () => {
  const out: string[] = [];
  const print = (line = '') => out.push(line);

  // Cold theme first: nothing else may have resolved a theme yet.
  const coldStart = now();
  resolveTheme(lightTheme);
  const coldTheme = now() - coldStart;
  const warmTheme: number[] = [];
  for (let i = 0; i < 200; i++) {
    const t0 = now();
    sink.push(resolveTheme(lightTheme));
    warmTheme.push(now() - t0);
  }
  sink.length = 0;

  const f3 = VARIANTS[0]!;
  const counts = tally(f3.source);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  print(`mode ${MODE}, node ${process.version}, reps ${REPS}`);
  print();
  print('cold resolveTheme(lightTheme), first call in process');
  print(
    `  cold ${fmt(coldTheme, 3)} ms   warm median ${fmt(median(warmTheme), 3)} ms`
  );
  print();
  print('F3 node-type tally (exact)');
  let nodes = 0;
  for (const [name, n] of ranked) {
    nodes += n;
    print(`  ${name.padEnd(20)} ${String(n).padStart(6)}`);
  }
  print(`  ${'total'.padEnd(20)} ${String(nodes).padStart(6)}`);

  const f3Sweep = sweep(f3.source, REPS);
  print();
  print(
    `F3 renderBlock inclusive by top-level block type (stub components), total ${fmt(f3Sweep.total)} ms over ${f3Sweep.blockCount} blocks`
  );
  print('  type            blocks      ms   us/block      %');
  for (const r of f3Sweep.results) {
    print(
      `  ${r.type.padEnd(15)} ${String(r.blocks).padStart(6)} ${fmt(r.ms).padStart(7)} ${fmt(r.usPerBlock, 1).padStart(10)} ${fmt(r.pct, 1).padStart(6)}`
    );
  }
  const tables = f3Sweep.results.find((r) => r.type === 'Table');
  const cells = counts.TableCell ?? 0;
  if (tables !== undefined && cells > 0) {
    print(
      `  tables: ${fmt((tables.ms * 1000) / cells, 2)} us per TableCell (${cells} cells)`
    );
  }

  print();
  print('Variants: renderBlock total (stub) and full mount (real defaults)');
  print(
    '  variant       bytes blocks  renderBlock ms  mount ms  mount-renderBlock ms'
  );
  const variantRows = [];
  for (const variant of VARIANTS) {
    // Twice: the first pass of a fresh source can carry JIT and GC noise.
    const first = sweep(variant.source, REPS);
    const second = sweep(variant.source, REPS);
    const s = second.total < first.total ? second : first;
    print(
      `  (${variant.id} passes: ${fmt(first.total)} / ${fmt(second.total)} ms)`
    );
    const mount = await mountMedian(variant.source, Math.max(5, REPS / 2));
    variantRows.push({
      id: variant.id,
      bytes: variant.source.length,
      blocks: s.blockCount,
      renderBlockMs: s.total,
      mountMs: mount,
    });
    print(
      `  ${variant.id.padEnd(12)} ${String(variant.source.length).padStart(6)} ${String(s.blockCount).padStart(6)} ${fmt(s.total).padStart(14)} ${fmt(mount).padStart(9)} ${fmt(mount - s.total).padStart(20)}`
    );
  }
  const text = out.join('\n');
  process.stdout.write(`\n${text}\n`);

  const dir = join(__dirname, '..', 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `profile-sweep-node-${MODE}.json`),
    JSON.stringify(
      {
        mode: MODE,
        node: process.version,
        reps: REPS,
        coldThemeMs: coldTheme,
        warmThemeMs: median(warmTheme),
        tally: counts,
        f3Buckets: f3Sweep.results,
        f3RenderBlockMs: f3Sweep.total,
        variants: variantRows,
      },
      null,
      2
    )
  );
});
