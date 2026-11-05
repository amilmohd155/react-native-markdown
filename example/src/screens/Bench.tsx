import { useLayoutEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Markdown as MarkdownV0 } from 'md-v0';
import {
  editLastParagraph,
  FIXTURES,
  type Fixture,
} from '../../../bench/fixtures';
import {
  Markdown,
  parse,
  type MarkdownDocument,
} from '@docren/react-native-markdown';
import { Button, Card, UIText, useChrome } from '../ui';

/**
 * Device benchmark: v1 vs v0.8.5 in one binary.
 * Spec: docs/rewrite/phase-1/benchmark-protocol.md
 *
 * Metrics (per fixture, median and p90):
 * - parse (v1 only): performance.now() around parse().
 * - firstRender: from the setState that mounts the document to the
 *   container's onLayout.
 * - parse+firstRender: both, in one run (the pass/fail metric).
 * - reRenderOneBlock: document mounted, then its last sentence edited; from
 *   the setState to the commit (a layout effect after the content). v1 parses
 *   the edit before timing (render cost only); v0 can't, it parses in render.
 *
 * v1 runs go through the public `<Markdown document>` (parse() first, so the
 * parse and render costs stay separate), as an app would use it.
 *
 * Runs alternate v0 and v1 (A, B, B, A, …) after warm-up runs, and the
 * document is unmounted with 2 frames' wait between runs. Only meaningful
 * in a release build; Expo Go numbers are dev-mode.
 */

type Impl = 'v0' | 'v1';
type Metric =
  | 'parse'
  | 'firstRender'
  | 'parse+firstRender'
  | 'reRenderOneBlock';

type Job =
  | {
      readonly key: number;
      readonly impl: 'v1';
      readonly document: MarkdownDocument;
    }
  | { readonly key: number; readonly impl: 'v0'; readonly source: string };

interface Sample {
  readonly fixture: Fixture['id'];
  readonly impl: Impl;
  readonly metric: Metric;
  readonly ms: number;
}

interface Row {
  readonly fixture: Fixture['id'];
  readonly impl: Impl;
  readonly metric: Metric;
  readonly n: number;
  readonly median: number;
  readonly p90: number;
}

const MODES = {
  quick: { warmup: 2, runs: 5 },
  full: { warmup: 5, runs: 20 },
} as const;

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
    step(n);
  });

function quantile(sorted: readonly number[], q: number): number {
  const i = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, i)]!;
}

function summarize(samples: readonly Sample[]): Row[] {
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

function deviceInfo() {
  const c = Platform.constants as Record<string, unknown>;
  return {
    os: Platform.OS,
    osVersion: Platform.Version,
    model: c.Model ?? c.model ?? null,
    brand: c.Brand ?? null,
    hermes: (globalThis as { HermesInternal?: unknown }).HermesInternal != null,
    dev: __DEV__,
  };
}

/** Calls `onCommit` after every commit of the tree it ends. */
function CommitProbe({
  version,
  onCommit,
}: {
  version: number;
  onCommit: (version: number) => void;
}) {
  useLayoutEffect(() => {
    onCommit(version);
  }, [version, onCommit]);
  return null;
}

/** UI hooks the runner drives; set by the mounted Bench screen. */
interface BenchIO {
  readonly setJob: (job: Job | null) => void;
  readonly bumpVersion: () => void;
  readonly setStatus: (status: string) => void;
  readonly setRows: (rows: Row[]) => void;
}

// The runner lives outside the component: it measures time, which must not
// happen during render (rules of React). One benchmark runs at a time.
let waiter: { kind: 'layout' | 'commit'; resolve: (t: number) => void } | null =
  null;
let nextKey = 0;

/** Called from onLayout (first render) and the commit probe (re-render). */
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

async function mount(io: BenchIO, impl: Impl, source: string) {
  const key = nextKey++;
  const t0 = performance.now();
  let parsed = t0;
  let next: Job;
  if (impl === 'v1') {
    const document = parse(source);
    parsed = performance.now();
    next = { key, impl, document };
  } else {
    next = { key, impl, source };
  }
  const laidOut = until('layout');
  io.setJob(next);
  const t1 = await laidOut;
  return { parse: parsed - t0, firstRender: t1 - parsed, total: t1 - t0, key };
}

async function runBench(io: BenchIO, mode: keyof typeof MODES) {
  const { warmup, runs } = MODES[mode];
  const samples: Sample[] = [];
  const add = (
    fixture: Fixture['id'],
    impl: Impl,
    metric: Metric,
    ms: number
  ) => samples.push({ fixture, impl, metric, ms });
  io.setRows([]);

  for (const fixture of FIXTURES) {
    const edited = editLastParagraph(fixture.source);
    const editedDocument = parse(edited);
    for (let i = 0; i < warmup + runs; i++) {
      const measured = i >= warmup;
      // Alternate which implementation goes first (A B, B A, …).
      const order: Impl[] = i % 2 === 0 ? ['v0', 'v1'] : ['v1', 'v0'];
      for (const impl of order) {
        io.setStatus(
          `${fixture.id} ${impl} ${
            measured ? `run ${i - warmup + 1}/${runs}` : 'warm-up'
          }`
        );

        // First render.
        const first = await mount(io, impl, fixture.source);
        if (measured) {
          if (impl === 'v1') {
            add(fixture.id, impl, 'parse', first.parse);
            add(fixture.id, impl, 'firstRender', first.firstRender);
          }
          add(fixture.id, impl, 'parse+firstRender', first.total);
        }

        // Re-render after editing the last block.
        await frames(2);
        const committed = until('commit');
        const t0 = performance.now();
        io.setJob(
          impl === 'v1'
            ? { key: first.key, impl, document: editedDocument }
            : { key: first.key, impl, source: edited }
        );
        io.bumpVersion();
        const t1 = await committed;
        if (measured) add(fixture.id, impl, 'reRenderOneBlock', t1 - t0);

        // Unmount, then wait 2 frames before the next run.
        io.setJob(null);
        await frames(2);
      }
    }
  }

  const summary = summarize(samples);
  io.setRows(summary);
  io.setStatus('done');
  const result = {
    date: new Date().toISOString(),
    device: deviceInfo(),
    mode,
    warmup,
    runs,
    fixtures: FIXTURES.map((f) => ({ id: f.id, bytes: f.source.length })),
    summary,
  };
  logChunked('bench', result);
  logChunked('bench:samples', samples);
}

/**
 * Logs `value` as JSON in lines under Android's ~4 KB logcat limit:
 * `[tag i/n] <chunk>`. Reassemble by joining the chunks in order:
 *   adb logcat -d -s ReactNativeJS -v raw | grep '^\[bench'
 */
function logChunked(tag: string, value: unknown) {
  const json = JSON.stringify(value);
  const size = 3000;
  const n = Math.max(1, Math.ceil(json.length / size));
  for (let i = 0; i < n; i++) {
    console.log(
      `[${tag} ${i + 1}/${n}] ${json.slice(i * size, (i + 1) * size)}`
    );
  }
}

export function Bench() {
  const { p } = useChrome();
  const [job, setJob] = useState<Job | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState('idle');
  const [rows, setRows] = useState<Row[]>([]);

  const io: BenchIO = {
    setJob,
    bumpVersion: () => setVersion((v) => v + 1),
    setStatus,
    setRows,
  };

  const busy = status !== 'idle' && status !== 'done';
  const dotColor = busy ? '#d29922' : status === 'done' ? '#2da44e' : p.muted;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        <UIText variant="body" muted>
          v1 against v0.8.5 in one binary: parse, first render and a one-block
          edit on the same fixtures.
        </UIText>

        <Card style={styles.runCard}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <UIText variant="label" numberOfLines={1} style={styles.flex}>
              {busy
                ? `Running · ${status}`
                : status === 'done'
                  ? 'Done'
                  : 'Ready'}
            </UIText>
            <UIText variant="caption" muted>
              {__DEV__ ? 'dev build' : 'release build'}
            </UIText>
          </View>
          {__DEV__ ? (
            <UIText variant="caption" muted>
              Dev numbers are not meaningful; measure a release build.
            </UIText>
          ) : null}
          <View style={styles.buttons}>
            {(['quick', 'full'] as const).map((mode) => (
              <Button
                key={mode}
                label={`${mode === 'quick' ? 'Quick' : 'Full'} · ${MODES[mode].warmup}+${MODES[mode].runs}`}
                tone={mode === 'quick' ? 'primary' : 'quiet'}
                disabled={busy}
                onPress={() => runBench(io, mode)}
                style={styles.flex}
              />
            ))}
          </View>
        </Card>

        {rows.length > 0 ? <Results rows={rows} /> : null}

        {/* The document under test, on white for both libraries. */}
        <View
          style={job ? [styles.subject, { borderColor: p.border }] : undefined}
          onLayout={() => settle('layout')}
          key={job?.key ?? 'none'}
        >
          {job?.impl === 'v1' ? (
            <Markdown document={job.document} theme="light" />
          ) : null}
          {job?.impl === 'v0' ? <MarkdownV0 markdown={job.source} /> : null}
          <CommitProbe version={version} onCommit={() => settle('commit')} />
        </View>
      </View>
    </ScrollView>
  );
}

function Results({ rows }: { rows: readonly Row[] }) {
  const { p } = useChrome();
  const get = (fixture: string, metric: Metric, impl: Impl) =>
    rows.find(
      (r) => r.fixture === fixture && r.metric === metric && r.impl === impl
    );
  const metrics: Metric[] = [
    'parse',
    'firstRender',
    'parse+firstRender',
    'reRenderOneBlock',
  ];
  const ms = (row: Row | undefined) => (row ? `${row.median.toFixed(1)}` : '—');
  return (
    <View style={styles.results}>
      {FIXTURES.map(({ id }) => (
        <Card key={id} style={styles.fixture}>
          <View style={styles.gridRow}>
            <UIText variant="heading" style={styles.metricCol}>
              {id}
            </UIText>
            <UIText variant="caption" muted style={styles.numCol}>
              v1 ms
            </UIText>
            <UIText variant="caption" muted style={styles.numCol}>
              v0 ms
            </UIText>
            <UIText variant="caption" muted style={styles.numCol}>
              speed-up
            </UIText>
          </View>
          {metrics.map((metric) => {
            const v1 = get(id, metric, 'v1');
            const v0 = get(id, metric, 'v0');
            const ratio = v0 && v1 ? v0.median / v1.median : null;
            return (
              <View
                key={metric}
                style={[
                  styles.gridRow,
                  { borderTopColor: p.border },
                  styles.ruled,
                ]}
              >
                <UIText variant="mono" style={styles.metricCol}>
                  {metric}
                </UIText>
                <UIText variant="mono" style={styles.numCol}>
                  {ms(v1)}
                </UIText>
                <UIText variant="mono" muted style={styles.numCol}>
                  {ms(v0)}
                </UIText>
                <UIText
                  variant="mono"
                  color={ratio !== null && ratio >= 1 ? '#2da44e' : undefined}
                  muted={ratio === null}
                  style={styles.numCol}
                >
                  {ratio !== null ? `${ratio.toFixed(1)}×` : '—'}
                </UIText>
              </View>
            );
          })}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 14 },
  flex: { flex: 1 },
  runCard: { gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  buttons: { flexDirection: 'row', gap: 10 },
  results: { gap: 10 },
  fixture: { gap: 6 },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  metricCol: { flex: 1.6 },
  numCol: { flex: 1, textAlign: 'right' },
  subject: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
});
