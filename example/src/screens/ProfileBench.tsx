import {
  createElement,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  defaults,
  Markdown,
  parse,
  type Components,
  type MarkdownDocument,
} from '@docren/react-native-markdown';
import { VARIANTS } from '../../../bench/profile/variants';
import { Button, Card, UIText, useChrome } from '../ui';
import { deviceInfo, frames, logChunked, quantile } from './benchUtil';

/**
 * Per-node-type cost of v1 firstRender (issue #36, task B1; Node counterpart:
 * bench/profile/sweep.test.tsx).
 *
 * Every default component is wrapped to time its own render function (self
 * time: hooks and element creation, not its children, which React renders as
 * separate fibers) and count calls, per ElementName. Block-level work done
 * outside components (renderBlock, the inline flattener, props, theme
 * lookups) is not in any element's self time: it is the gap between the
 * wrapped total and the sum of self times, together with React reconciliation,
 * commit and native layout.
 *
 * Runs, per variant of F3 (bench/profile/variants.ts):
 * - `plain`: the real defaults, no instrumentation. Its firstRender is the
 *   headline number (same method as Bench.tsx: pre-parsed document, from
 *   the setState that mounts it to the container's onLayout).
 * - `wrapped`: instrumented defaults. Inflated by timer overhead (estimated
 *   and subtracted from self times, not from the total).
 * Variants with tables also run with a `cold` table cache (a fresh theme per
 * run, so the column width cache is empty and every table measures) next to
 * `warm` (the shared light theme: after the first mount the cache is warm,
 * which is what Bench.tsx measures).
 *
 * For tables, the wrapper also records whether Table renders land before or
 * after the layout callback that ends the timed window: the measuring
 * re-render happens in a requestAnimationFrame callback, so it is expected
 * after. `tableAfter` > 0 confirms it is outside firstRender.
 *
 * Jobs are shuffled every round; warm-up rounds first. Release build only
 * (the Profiler does not fire there and __DEV__ numbers are meaningless).
 * Results: logChunked('profile', ...) and the tables below.
 */

type Mode = 'plain' | 'wrapped';
type Cache = 'warm' | 'cold';

interface JobSpec {
  readonly variant: string;
  readonly mode: Mode;
  readonly cache: Cache;
}

interface Job extends JobSpec {
  readonly key: number;
  readonly document: MarkdownDocument;
  readonly theme: 'light' | { readonly colors: { readonly text: string } };
}

interface ElementStat {
  ms: number;
  msIn: number;
  calls: number;
  callsIn: number;
}

const MODES = {
  quick: { warmup: 1, runs: 3 },
  full: { warmup: 3, runs: 15 },
} as const;

// -- instrumentation --------------------------------------------------------

const stats = new Map<string, ElementStat>();
let windowOpen = false;

function record(name: string, ms: number) {
  let s = stats.get(name);
  if (s === undefined) {
    s = { ms: 0, msIn: 0, calls: 0, callsIn: 0 };
    stats.set(name, s);
  }
  s.ms += ms;
  s.calls += 1;
  if (windowOpen) {
    s.msIn += ms;
    s.callsIn += 1;
  }
}

type Render = (props: object) => ReactNode;

function wrap(name: string, component: unknown): ComponentType {
  // Defaults are plain function components: calling one inside the wrapper
  // runs its hooks on the wrapper's fiber.
  const render = component as Render;
  const Wrapped = (props: object) => {
    const t0 = performance.now();
    const out = render(props);
    record(name, performance.now() - t0);
    return out;
  };
  Wrapped.displayName = `Profiled(${name})`;
  return Wrapped;
}

const WRAPPED = Object.fromEntries(
  Object.entries(defaults).map(([name, component]) => [
    name,
    wrap(name, component),
  ])
) as unknown as Components;

/** Median cost of one `performance.now()` pair, ms. */
function timerOverhead(): number {
  const samples: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const t0 = performance.now();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return quantile(samples, 0.5);
}

// -- runner -----------------------------------------------------------------

interface RunSample {
  readonly spec: JobSpec;
  readonly firstRender: number;
  readonly elements: Record<string, ElementStat>;
  /** Table renders before / after the layout callback. */
  readonly tableIn: number;
  readonly tableAfter: number;
}

interface Row {
  readonly variant: string;
  readonly mode: Mode;
  readonly cache: Cache;
  readonly n: number;
  readonly median: number;
  readonly p90: number;
  /** Sum of median element self times (timer overhead removed), wrapped only. */
  readonly selfSum: number | null;
  readonly tableIn: number | null;
  readonly tableAfter: number | null;
}

interface ElementRow {
  readonly variant: string;
  readonly cache: Cache;
  readonly name: string;
  readonly calls: number;
  readonly ms: number;
  readonly usPerCall: number;
  readonly pctOfWrapped: number;
}

interface BenchIO {
  readonly setJob: (job: Job | null) => void;
  readonly setStatus: (status: string) => void;
}

let waiter: ((t: number) => void) | null = null;
let nextKey = 0;

function settle() {
  const w = waiter;
  if (w !== null) {
    waiter = null;
    w(performance.now());
  }
}

/** Deterministic shuffle, so every app launch runs the same orders. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  // Park-Miller LCG: small, deterministic, no bit operations.
  let s = (seed % 2147483646) + 1;
  const rand = () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return quantile(s, 0.5);
};

function specs(): JobSpec[] {
  const out: JobSpec[] = [];
  for (const v of VARIANTS) {
    const hasTables = v.id === 'F3' || v.id === 'tables';
    for (const mode of ['plain', 'wrapped'] as const) {
      out.push({ variant: v.id, mode, cache: 'warm' });
      if (hasTables) out.push({ variant: v.id, mode, cache: 'cold' });
    }
  }
  return out;
}

async function runOnce(
  io: BenchIO,
  spec: JobSpec,
  document: MarkdownDocument
): Promise<RunSample> {
  const key = nextKey++;
  // A unique text colour makes a new resolved theme, so a new (empty) table
  // width cache; `warm` uses the shared built-in light theme.
  const theme: Job['theme'] =
    spec.cache === 'cold'
      ? { colors: { text: `#0${key % 10}0${key}` } }
      : 'light';
  stats.clear();
  const laidOut = new Promise<number>((resolve) => {
    waiter = resolve;
  });
  windowOpen = true;
  const t0 = performance.now();
  io.setJob({ ...spec, key, document, theme });
  const t1 = await laidOut;
  windowOpen = false;
  // Let the table measuring pass (requestAnimationFrame + re-render) finish.
  await frames(3);
  const elements: Record<string, ElementStat> = {};
  for (const [name, s] of stats) elements[name] = { ...s };
  const table = stats.get('Table');
  io.setJob(null);
  await frames(2);
  return {
    spec,
    firstRender: t1 - t0,
    elements,
    tableIn: table?.callsIn ?? 0,
    tableAfter: table ? table.calls - table.callsIn : 0,
  };
}

async function runProfile(io: BenchIO, mode: keyof typeof MODES) {
  const { warmup, runs } = MODES[mode];
  const all = specs();
  const documents = new Map(
    VARIANTS.map((v) => [v.id, parse(v.source)] as const)
  );
  const overhead = timerOverhead();
  const samples: RunSample[] = [];

  for (let round = 0; round < warmup + runs; round++) {
    const measured = round >= warmup;
    for (const spec of shuffled(all, 1000 + round)) {
      io.setStatus(
        `${measured ? `run ${round - warmup + 1}/${runs}` : 'warm-up'} · ${
          spec.variant
        } ${spec.mode} ${spec.cache}`
      );
      const sample = await runOnce(io, spec, documents.get(spec.variant)!);
      if (measured) samples.push(sample);
    }
  }

  // Aggregate.
  const groups = new Map<string, RunSample[]>();
  for (const s of samples) {
    const k = `${s.spec.variant}|${s.spec.mode}|${s.spec.cache}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const rows: Row[] = [];
  const elementRows: ElementRow[] = [];
  for (const group of groups.values()) {
    const { variant, mode: m, cache } = group[0]!.spec;
    const fr = group.map((s) => s.firstRender).sort((a, b) => a - b);
    let selfSum: number | null = null;
    if (m === 'wrapped') {
      const names = new Set(group.flatMap((s) => Object.keys(s.elements)));
      let sum = 0;
      const rowsHere: ElementRow[] = [];
      for (const name of names) {
        // Only time inside the window counts toward firstRender.
        const callsIn = median(
          group.map((s) => s.elements[name]?.callsIn ?? 0)
        );
        const msIn = median(group.map((s) => s.elements[name]?.msIn ?? 0));
        const ms = Math.max(0, msIn - callsIn * overhead);
        sum += ms;
        rowsHere.push({
          variant,
          cache,
          name,
          calls: callsIn,
          ms,
          usPerCall: callsIn > 0 ? (ms * 1000) / callsIn : 0,
          pctOfWrapped: 0,
        });
      }
      selfSum = sum;
      const total = median(fr);
      for (const r of rowsHere) {
        elementRows.push({ ...r, pctOfWrapped: (r.ms / total) * 100 });
      }
    }
    rows.push({
      variant,
      mode: m,
      cache,
      n: fr.length,
      median: quantile(fr, 0.5),
      p90: quantile(fr, 0.9),
      selfSum,
      tableIn: m === 'wrapped' ? median(group.map((s) => s.tableIn)) : null,
      tableAfter:
        m === 'wrapped' ? median(group.map((s) => s.tableAfter)) : null,
    });
  }
  elementRows.sort((a, b) => b.ms - a.ms);
  return { rows, elementRows, overhead, samples };
}

// -- screen -----------------------------------------------------------------

export function ProfileBench() {
  const { p } = useChrome();
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState('idle');
  const [rows, setRows] = useState<Row[]>([]);
  const [elementRows, setElementRows] = useState<ElementRow[]>([]);
  const busy = status !== 'idle' && status !== 'done';

  const start = async (mode: keyof typeof MODES) => {
    setRows([]);
    setElementRows([]);
    const result = await runProfile({ setJob, setStatus }, mode);
    setRows(result.rows);
    setElementRows(result.elementRows);
    setStatus('done');
    logChunked('profile', {
      date: new Date().toISOString(),
      device: deviceInfo(),
      mode,
      ...MODES[mode],
      timerOverheadMs: result.overhead,
      rows: result.rows,
      elements: result.elementRows,
    });
    logChunked(
      'profile:samples',
      result.samples.map((s) => ({
        ...s.spec,
        firstRender: s.firstRender,
        tableIn: s.tableIn,
        tableAfter: s.tableAfter,
        elements: s.elements,
      }))
    );
  };

  const f3 = elementRows.filter(
    (r) => r.variant === 'F3' && r.cache === 'warm'
  );
  const fmt = (n: number | null, d = 1) => (n === null ? '—' : n.toFixed(d));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        <UIText variant="body" muted>
          Where F3 firstRender goes: self time and calls per element, and F3
          variants (tables, code, lists, prose, without tables).
        </UIText>
        <Card style={styles.card}>
          <UIText variant="label">
            {busy
              ? `Running · ${status}`
              : status === 'done'
                ? 'Done'
                : 'Ready'}{' '}
            · {__DEV__ ? 'dev build' : 'release build'}
          </UIText>
          {__DEV__ ? (
            <UIText variant="caption" muted>
              Dev numbers are not meaningful; measure a release build.
            </UIText>
          ) : null}
          <View style={styles.buttons}>
            {(['quick', 'full'] as const).map((mode) => (
              <Button
                key={mode}
                label={`${mode} · ${MODES[mode].warmup}+${MODES[mode].runs}`}
                tone={mode === 'full' ? 'primary' : 'quiet'}
                disabled={busy}
                onPress={() => {
                  start(mode).catch((e: unknown) => console.warn(e));
                }}
                style={styles.flex}
              />
            ))}
          </View>
        </Card>

        {rows.length > 0 ? (
          <Card style={styles.card}>
            <UIText variant="label">firstRender by variant (ms)</UIText>
            <UIText variant="caption" muted>
              variant · mode · cache · median / p90 · self sum · table renders
              in/after window
            </UIText>
            {rows
              .slice()
              .sort(
                (a, b) =>
                  a.variant.localeCompare(b.variant) ||
                  a.cache.localeCompare(b.cache) ||
                  a.mode.localeCompare(b.mode)
              )
              .map((r) => (
                <UIText key={`${r.variant}${r.mode}${r.cache}`} variant="mono">
                  {r.variant} {r.mode} {r.cache} · {fmt(r.median)} /{' '}
                  {fmt(r.p90)}
                  {r.selfSum !== null ? ` · self ${fmt(r.selfSum)}` : ''}
                  {r.tableIn !== null
                    ? ` · tbl ${fmt(r.tableIn, 0)}/${fmt(r.tableAfter, 0)}`
                    : ''}
                </UIText>
              ))}
          </Card>
        ) : null}

        {f3.length > 0 ? (
          <Card style={styles.card}>
            <UIText variant="label">F3 · self time per element (warm)</UIText>
            <UIText variant="caption" muted>
              in window, timer overhead removed. Not here: renderBlock, inline
              flattening, reconciliation, native layout.
            </UIText>
            {f3.map((r) => (
              <UIText key={r.name} variant="mono">
                {r.name.padEnd(18)} {fmt(r.calls, 0).padStart(5)}x{' '}
                {fmt(r.ms).padStart(6)} ms {fmt(r.usPerCall).padStart(6)} us{' '}
                {fmt(r.pctOfWrapped).padStart(5)}%
              </UIText>
            ))}
          </Card>
        ) : null}

        {/* The document under test. */}
        <View
          style={job ? [styles.subject, { borderColor: p.border }] : undefined}
          onLayout={settle}
          key={job?.key ?? 'none'}
        >
          {job
            ? createElement(Markdown, {
                document: job.document,
                theme: job.theme,
                components: job.mode === 'wrapped' ? WRAPPED : undefined,
              })
            : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 14 },
  flex: { flex: 1 },
  card: { gap: 8 },
  buttons: { flexDirection: 'row', gap: 10 },
  subject: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
});
