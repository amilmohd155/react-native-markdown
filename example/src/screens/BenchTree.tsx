import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { editLastParagraph, F2, F3 } from '../../../bench/fixtures';
import {
  buildObjectTree,
  ObjectTreeMarkdown,
  type ObjectTree,
} from '../../../bench/objectTree';
import { tableOf } from '../../../src/api/document';
import {
  Markdown,
  parse,
  type MarkdownDocument,
} from '@docren/react-native-markdown';
import { UIText } from '../ui';
import {
  deviceInfo,
  forceGc,
  frames,
  heapSample,
  logChunked,
  quantile,
  type HeapSample,
} from './benchUtil';

/**
 * Table vs. object tree A/B (the `objectTreeModel` flag): renders the same
 * parsed document through the flat-table renderer (`<Markdown document>`) and
 * the object-tree renderer (`<ObjectTreeMarkdown tree>`, bench/objectTree).
 * Spec: docs/rewrite/phase-1/benchmark-protocol.md (Table vs. object tree).
 *
 * - `ab`: firstRender and reRenderOneBlock on F2 and F3, interleaved, with
 *   warm-up runs. Both models start from a pre-parsed document; the tree is
 *   converted before timing (`convert` is its own sample), so the numbers
 *   are render cost only. Decision rule input: tree firstRender vs. table.
 * - `heap-table` / `heap-tree`: retained heap of F3 after mounting, one model
 *   per app launch (the table keeps the document, the tree keeps the tree
 *   only), GC forced when the engine allows. F5 heap is in BenchList.
 *
 * Release build only. One mode per app launch for the heap runs.
 */

export type TreeMode = 'ab' | 'heap-table' | 'heap-tree';
type Impl = 'table' | 'tree';
type Metric = 'firstRender' | 'reRenderOneBlock' | 'convert';

type Job =
  | {
      readonly key: number;
      readonly impl: 'table';
      readonly doc: MarkdownDocument;
    }
  | { readonly key: number; readonly impl: 'tree'; readonly tree: ObjectTree };

interface Sample {
  readonly fixture: string;
  readonly impl: Impl;
  readonly metric: Metric;
  readonly ms: number;
}

export interface TreeRow {
  readonly fixture: string;
  readonly impl: Impl;
  readonly metric: Metric;
  readonly n: number;
  readonly median: number;
  readonly p90: number;
}

export interface TreeResult {
  readonly mode: TreeMode;
  readonly rows: readonly TreeRow[];
  /** F2/F3 tree firstRender over table firstRender, per fixture. */
  readonly firstRenderRatio: Readonly<Record<string, number>>;
  readonly heap: {
    readonly impl: Impl;
    readonly gcForced: boolean;
    readonly before: HeapSample;
    readonly after: HeapSample;
    readonly retainedBytes: number | null;
  } | null;
}

const WARMUP = 5;
const RUNS = 20;
const FIXTURES = [
  { id: 'F2', source: F2 },
  { id: 'F3', source: F3 },
] as const;

let waiter: { kind: 'layout' | 'commit'; resolve: (t: number) => void } | null =
  null;
let nextKey = 0;

function settle(kind: 'layout' | 'commit') {
  const w = waiter;
  if (w !== null && w.kind === kind) {
    waiter = null;
    w.resolve(performance.now());
  }
}

function until(kind: 'layout' | 'commit') {
  return new Promise<number>((resolve) => {
    waiter = { kind, resolve };
  });
}

interface IO {
  readonly setJob: (job: Job | null) => void;
  readonly bump: () => void;
  readonly setStatus: (status: string) => void;
}

function summarize(samples: readonly Sample[]): TreeRow[] {
  const groups = new Map<string, Sample[]>();
  for (const s of samples) {
    const k = `${s.fixture}|${s.metric}|${s.impl}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()].map((group) => {
    const ms = group.map((s) => s.ms).sort((a, b) => a - b);
    const { fixture, impl, metric } = group[0]!;
    return {
      fixture,
      impl,
      metric,
      n: ms.length,
      median: quantile(ms, 0.5),
      p90: quantile(ms, 0.9),
    };
  });
}

/** Builds the tree and drops the document, so only the tree stays alive. */
function treeOf(source: string): ObjectTree {
  return buildObjectTree(tableOf(parse(source)));
}

async function runAb(io: IO): Promise<TreeResult> {
  const samples: Sample[] = [];
  const add = (fixture: string, impl: Impl, metric: Metric, ms: number) =>
    samples.push({ fixture, impl, metric, ms });

  for (const fixture of FIXTURES) {
    const doc = parse(fixture.source);
    const editedSource = editLastParagraph(fixture.source);
    const editedDoc = parse(editedSource);
    const tree = buildObjectTree(tableOf(doc));
    const editedTree = buildObjectTree(tableOf(editedDoc));

    for (let i = 0; i < WARMUP + RUNS; i++) {
      const measured = i >= WARMUP;
      const order: Impl[] = i % 2 === 0 ? ['table', 'tree'] : ['tree', 'table'];
      if (measured) {
        const t0 = performance.now();
        buildObjectTree(tableOf(doc));
        add(fixture.id, 'tree', 'convert', performance.now() - t0);
      }
      for (const impl of order) {
        io.setStatus(
          `${fixture.id} ${impl} ${
            measured ? `run ${i - WARMUP + 1}/${RUNS}` : 'warm-up'
          }`
        );
        const key = nextKey++;
        const job = (d: MarkdownDocument, t: ObjectTree): Job =>
          impl === 'table' ? { key, impl, doc: d } : { key, impl, tree: t };

        const laidOut = until('layout');
        const t0 = performance.now();
        io.setJob(job(doc, tree));
        const t1 = await laidOut;
        if (measured) add(fixture.id, impl, 'firstRender', t1 - t0);

        await frames(2);
        const committed = until('commit');
        const e0 = performance.now();
        io.setJob(job(editedDoc, editedTree));
        io.bump();
        const e1 = await committed;
        if (measured) add(fixture.id, impl, 'reRenderOneBlock', e1 - e0);

        io.setJob(null);
        await frames(2);
      }
    }
  }

  const rows = summarize(samples);
  const firstRenderRatio: Record<string, number> = {};
  for (const { id } of FIXTURES) {
    const get = (impl: Impl) =>
      rows.find(
        (r) => r.fixture === id && r.impl === impl && r.metric === 'firstRender'
      )?.median;
    const table = get('table');
    const tree = get('tree');
    if (table && tree) firstRenderRatio[id] = tree / table;
  }
  logChunked('bench:tree', { device: deviceInfo(), WARMUP, RUNS, rows });
  logChunked('bench:tree:samples', samples);
  return { mode: 'ab', rows, firstRenderRatio, heap: null };
}

async function runHeap(io: IO, impl: Impl): Promise<TreeResult> {
  await frames(5);
  io.setStatus('baseline heap');
  let gcForced = forceGc();
  const before = heapSample();

  io.setStatus('mounting F3');
  const key = nextKey++;
  const laidOut = until('layout');
  io.setJob(
    impl === 'table'
      ? { key, impl, doc: parse(F3) }
      : { key, impl, tree: treeOf(F3) }
  );
  await laidOut;
  await frames(10);

  io.setStatus('retained heap');
  gcForced = forceGc() && gcForced;
  const after = heapSample();
  const retainedBytes =
    before.allocated !== null && after.allocated !== null
      ? after.allocated - before.allocated
      : null;
  const heap = { impl, gcForced, before, after, retainedBytes };
  logChunked('bench:tree:heap', { device: deviceInfo(), fixture: 'F3', heap });
  return {
    mode: impl === 'table' ? 'heap-table' : 'heap-tree',
    rows: [],
    firstRenderRatio: {},
    heap,
  };
}

/** Calls `onCommit` after every commit of the tree it ends. */
function CommitProbe({
  version,
  onCommit,
}: {
  version: number;
  onCommit: () => void;
}) {
  useLayoutEffect(() => {
    onCommit();
  }, [version, onCommit]);
  return null;
}

const onCommit = () => settle('commit');

export function BenchTree({
  mode,
  onDone,
}: {
  mode: TreeMode;
  onDone: (result: TreeResult) => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState('starting');
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let cancelled = false;
    const io: IO = {
      setJob: (j) => !cancelled && setJob(j),
      bump: () => !cancelled && setVersion((v) => v + 1),
      setStatus: (s) => !cancelled && setStatus(s),
    };
    const run =
      mode === 'ab'
        ? runAb(io)
        : runHeap(io, mode === 'heap-table' ? 'table' : 'tree');
    run.then((result) => {
      if (!cancelled) onDoneRef.current(result);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <UIText variant="label" style={styles.status}>
        {mode} · {status}
      </UIText>
      <View
        style={job ? styles.subject : undefined}
        onLayout={() => settle('layout')}
        key={job?.key ?? 'none'}
      >
        {job?.impl === 'table' ? (
          <Markdown document={job.doc} theme="light" />
        ) : null}
        {job?.impl === 'tree' ? (
          <ObjectTreeMarkdown tree={job.tree} theme="light" />
        ) : null}
        <CommitProbe version={version} onCommit={onCommit} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  status: { paddingVertical: 12 },
  subject: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
  },
});
