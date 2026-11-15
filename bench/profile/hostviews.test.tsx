import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, Profiler, useRef, type ComponentProps } from 'react';
import { createRoot, type TestInstance } from 'test-renderer';
import { tableOf } from '../../src/api/document';
import { Markdown } from '../../src/api/Markdown';
import { parse } from '../../src/api/parse';
import { nodeTypeName } from '../../src/model';
import { defaultComponents } from '../../src/render';
import { clearThemeCache, createTheme } from '../../src/theme';
import { VARIANTS } from './variants';

/**
 * Host (native) element census for issue #39, step 1: measurement only.
 *
 * Renders F3, `tables` and `lists` (bench/profile/variants.ts) with the real
 * default components and counts the host nodes the test renderer holds
 * (`View`, `Text`, the `ScrollView` host nodes): at first render, and after
 * the table measuring pass settled (every cell reports a width through its
 * `onLayout`, then the `requestAnimationFrame` flushes under fake timers).
 * Per-element costs come from small synthetic documents, solved exactly
 * (table: tables, rows, cells; list: lists, items), and are checked against
 * the measured totals. Also times the measuring pass with a cold column
 * width cache and counts the commits per Table.
 *
 * Run `yarn profile:hosts` in bench/. Node figures: host counts are exact
 * (they do not depend on the engine), times are indicative only; the S25 FE
 * (Hermes, real layout) needs its own run.
 */
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REPS = Number(process.env.HOSTS_REPS ?? '10');

/** Milliseconds. Not `performance.now()`: RN's Jest setup replaces it. */
const now = () => Number(process.hrtime.bigint()) / 1e6;

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

type Hist = Record<string, number>;

function histogram(nodes: readonly TestInstance[]): Hist {
  const h: Hist = {};
  for (const n of nodes) h[n.type] = (h[n.type] ?? 0) + 1;
  h.total = nodes.length;
  return h;
}

const combine = (a: Hist, b: Hist, sign: number): Hist => {
  const out: Hist = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    out[k] = (a[k] ?? 0) + sign * (b[k] ?? 0);
  return out;
};
const sub = (a: Hist, b: Hist): Hist => combine(a, b, -1);
const add = (a: Hist, b: Hist): Hist => combine(a, b, 1);
const scale = (a: Hist, f: number): Hist =>
  Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v * f]));

/** Counts of the model node types a source holds. */
function tally(source: string): Hist {
  const table = tableOf(parse(source));
  const out: Hist = {};
  for (let id = 0; id < table.count; id++) {
    const name = nodeTypeName(table.type[id]!);
    out[name] = (out[name] ?? 0) + 1;
  }
  return out;
}

interface Census {
  first: Hist;
  settled: Hist;
  /** Commits of the whole tree up to the settled state. */
  rootCommits: number;
  /** Commits per Table (its render count), up to the settled state. */
  tableCommits: number[];
  /** Frames the cells' width reports scheduled: one per measuring pass. */
  passesScheduled: number;
}

/**
 * Mounts `source` with the real defaults, counts hosts, then simulates the
 * layout pass of every cell and flushes the frame.
 */
async function census(source: string): Promise<Census> {
  const document = parse(source);
  // Equal themes resolve to one object, and the column width cache hangs off
  // it: clear it so every census starts with a cold width cache.
  clearThemeCache();
  let rootCommits = 0;
  const tableCommits: number[] = [];
  let nextTable = 0;
  function Table(props: ComponentProps<typeof defaultComponents.Table>) {
    // Tables mount once, in a stable order.
    const ref = useRef<number | null>(null);
    if (ref.current === null) ref.current = nextTable++;
    const id = ref.current;
    return (
      <Profiler
        id={`t${id}`}
        onRender={() => {
          tableCommits[id] = (tableCommits[id] ?? 0) + 1;
        }}
      >
        <defaultComponents.Table {...props} />
      </Profiler>
    );
  }
  const root = createRoot();
  await act(async () =>
    root.render(
      <Profiler
        id="root"
        onRender={() => {
          rootCommits++;
        }}
      >
        <Markdown
          document={document}
          theme={createTheme({})}
          components={{ Table }}
        />
      </Profiler>
    )
  );
  const first = histogram(root.container.queryAll(() => true));
  const passesScheduled = await settle(root.container);
  const settled = histogram(root.container.queryAll(() => true));
  await act(async () => root.unmount());
  return {
    first,
    settled,
    rootCommits,
    tableCommits,
    passesScheduled,
  };
}

/**
 * Every measuring cell reports a width, then the pending frame runs.
 * Returns the number of frames the reports scheduled.
 */
async function settle(container: TestInstance): Promise<number> {
  let scheduled = 0;
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    scheduled++;
    return raf(cb);
  };
  await act(async () => {
    container
      .queryAll((n) => typeof n.props.onLayout === 'function')
      .forEach((cell, i) =>
        cell.props.onLayout({
          nativeEvent: { layout: { width: 40 + (i % 7) * 12 } },
        })
      );
  });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  globalThis.requestAnimationFrame = raf;
  return scheduled;
}

const tableSource = (rows: number, cols: number) => {
  const row = (c: string) =>
    `| ${Array.from({ length: cols }, (_, i) => `${c}${i}`).join(' | ')} |`;
  return [
    row('h'),
    `|${' --- |'.repeat(cols)}`,
    ...Array.from({ length: rows - 1 }, (_, i) => row(`c${i}`)),
  ].join('\n');
};
const listSource = (items: number) =>
  Array.from({ length: items }, (_, i) => `- item ${i}`).join('\n');

jest.setTimeout(30 * 60 * 1000);
beforeEach(() =>
  jest.useFakeTimers({ doNotFake: ['hrtime', 'performance', 'nextTick'] })
);
afterEach(() => jest.useRealTimers());

const variant = (id: string) => VARIANTS.find((v) => v.id === id)!;

it('counts host elements and times the table measuring pass', async () => {
  const phases = ['first', 'settled'] as const;

  // An empty document: the Markdown root View, counted once per document.
  const empty = await census('');
  const base = empty.first;
  const minusBase = (h: Hist) => sub(h, base);

  // Synthetic tables: h(rows, cols) = base + T + R*rows + C*rows*cols.
  const t11 = await census(tableSource(1, 1));
  const t12 = await census(tableSource(1, 2));
  const t22 = await census(tableSource(2, 2));
  const perTable: Record<string, { table: Hist; row: Hist; cell: Hist }> = {};
  for (const phase of phases) {
    const cell = sub(t12[phase], t11[phase]);
    const row = sub(sub(t22[phase], t12[phase]), scale(cell, 2));
    const table = minusBase(sub(sub(t11[phase], row), cell));
    perTable[phase] = { table, row, cell };
  }

  // Synthetic lists: h(items) = base + L + I*items (one-line text items).
  const l1 = await census(listSource(1));
  const l2 = await census(listSource(2));
  const perList: Record<string, { list: Hist; item: Hist }> = {};
  for (const phase of phases) {
    const item = sub(l2[phase], l1[phase]);
    perList[phase] = { list: minusBase(sub(l1[phase], item)), item };
  }

  // The real documents, with a model prediction to show how far the
  // per-element figures explain the total.
  const docs: Record<string, unknown> = {};
  for (const id of ['F3', 'tables', 'lists']) {
    const v = variant(id);
    const counts = tally(v.source);
    const c = await census(v.source);
    const predict = (phase: (typeof phases)[number]) => {
      const t = perTable[phase]!;
      const l = perList[phase]!;
      let p: Hist = base;
      p = add(p, scale(t.table, counts.Table ?? 0));
      p = add(p, scale(t.row, counts.TableRow ?? 0));
      p = add(p, scale(t.cell, counts.TableCell ?? 0));
      p = add(p, scale(l.list, counts.List ?? 0));
      p = add(p, scale(l.item, counts.ListItem ?? 0));
      return p;
    };
    docs[id] = {
      bytes: v.source.length,
      modelCounts: {
        Table: counts.Table ?? 0,
        TableRow: counts.TableRow ?? 0,
        TableCell: counts.TableCell ?? 0,
        List: counts.List ?? 0,
        ListItem: counts.ListItem ?? 0,
        Paragraph: counts.Paragraph ?? 0,
        CodeBlock: counts.CodeBlock ?? 0,
      },
      hostsFirstRender: c.first,
      hostsSettled: c.settled,
      predictedFromTableAndListPartsFirst: predict('first'),
      predictedFromTableAndListPartsSettled: predict('settled'),
      rootCommits: c.rootCommits,
      measuringPassesScheduled: c.passesScheduled,
      commitsPerTable: {
        tables: c.tableCommits.length,
        min: c.tableCommits.length ? Math.min(...c.tableCommits) : 0,
        max: c.tableCommits.length ? Math.max(...c.tableCommits) : 0,
      },
    };
  }

  // Measuring pass timing, cold width cache: a fresh theme object per run
  // (the cache is a WeakMap keyed by the resolved theme) and a cleared theme
  // cache. Warm: the same theme mounted a second time.
  const timing: Record<string, unknown> = {};
  for (const id of ['F3', 'tables']) {
    const document = parse(variant(id).source);
    const run = async (theme: ReturnType<typeof createTheme>) => {
      const root = createRoot();
      const t0 = now();
      await act(async () =>
        root.render(<Markdown document={document} theme={theme} />)
      );
      const t1 = now();
      await settle(root.container);
      const t2 = now();
      await act(async () => root.unmount());
      return { mount: t1 - t0, measure: t2 - t1, total: t2 - t0 };
    };
    for (let i = 0; i < 3; i++) {
      clearThemeCache();
      await run(createTheme({}));
    }
    const cold: Awaited<ReturnType<typeof run>>[] = [];
    const warm: Awaited<ReturnType<typeof run>>[] = [];
    for (let i = 0; i < REPS; i++) {
      clearThemeCache();
      const theme = createTheme({});
      cold.push(await run(theme));
      warm.push(await run(theme));
    }
    const med = (xs: typeof cold) => ({
      mountMs: median(xs.map((x) => x.mount)),
      measureMs: median(xs.map((x) => x.measure)),
      totalMs: median(xs.map((x) => x.total)),
    });
    timing[id] = { reps: REPS, coldCache: med(cold), warmCache: med(warm) };
  }

  const result = {
    note: 'Node (jest, React Native preset, test-renderer). Host counts are exact and engine-independent; times are indicative only. Device numbers need the S25 FE.',
    node: process.version,
    issue: 39,
    emptyDocumentHosts: base,
    perElement: { table: perTable, list: perList },
    documents: docs,
    measuringPassTiming: timing,
  };
  const json = JSON.stringify(result, null, 2);
  process.stdout.write(`\n${json}\n`);
  const dir = join(__dirname, '..', 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'hostviews-node-2026-11-06.json'), json);
});
