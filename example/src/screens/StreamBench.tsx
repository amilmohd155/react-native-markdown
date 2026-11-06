// The Stream tab: an on-device check of the stream scheduling (P2-4) and of
// streaming in general (device runs on other platforms, the S5 re-check).
// It uses only the PUBLIC useMarkdownStream API, so it measures what a user
// of the hook gets. What that means for what it can read:
// - no open-fence fast-path switch (the S2.9b F4d runs have it, on and off);
// - no per-flush parse+splice time (flush cost): it counts COMMITS instead,
//   which can merge two flushes that land in one React batch;
// - which appends a commit contains is inferred from the render time of the
//   new document (appends made before it), not read from the scheduler.
// The S2.9b results, with the flush-cost columns, are in
// bench/results/scheduler-device-s25fe-release-*.json.
//
// "raf" here means the hook default: raf on iOS and Android, a 16 ms timer on
// web. "timeout" passes `flushIntervalMs`.
//
// Streams F2 (~10 KB, the F4 text) or the code-heavy fixture (F4d) through
// useMarkdownStream into <Markdown document>, paced on a timer (F4a: 20 chars
// every 16 ms, F4b: 195 chars every 16 ms, 1 char every 1 ms, F4d: 20 chars
// every 16 ms). Spec: docs/rewrite/phase-2/benchmark-protocol.md (F4).
//
// Per run:
// - commits: count and spacing of document commits;
// - frames: gaps between requestAnimationFrame callbacks on the JS thread
//   while streaming (dropped = gap > 20 ms; meaningless on a 60 Hz display,
//   where a frame is 16.7 ms: check the p50 gap first);
// - latency: from `append` to the layout effect after the commit that
//   contains that text;
// - total: first append to the commit of `done()`;
// - final: the document after `done()` against `parse(full text)`.
//
// Only meaningful in a release build; Expo Go numbers are dev-mode JS.
// Results are listed on screen and logged as `[streamBench i/n] <json>`
// (read them with `adb logcat -d -s ReactNativeJS -v raw | grep '^\[streamBench'`).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Markdown,
  parse,
  useMarkdownStream,
  visit,
  type MarkdownDocument,
} from '@docren/react-native-markdown';
import { F2 } from '../../../bench/fixtures';
import { Button, Card, Field, Segmented, UIText, useChrome } from '../ui';
import { deviceInfo, logChunked } from './benchUtil';
import { CODE_HEAVY } from './streamBenchFixtures';

type SchedulerChoice = 'timeout' | 'raf';
type Smoothing = 'none' | 'hide-incomplete';
type PresetId = 'f4a' | 'f4b' | 'c1' | 'f4d';

/**
 * `label` is the technical label: result cards and the logs keep printing it.
 * `name` and `caption` are what the Options sheet shows.
 */
const PRESETS: Record<
  PresetId,
  {
    label: string;
    name: string;
    caption: string;
    chunk: number;
    periodMs: number;
  }
> = {
  f4a: {
    label: 'F4a 20 @16ms',
    name: 'Steady',
    caption: 'F4a · 20 chars every 16 ms',
    chunk: 20,
    periodMs: 16,
  },
  f4b: {
    label: 'F4b 195 @16ms',
    name: 'Chunky',
    caption: 'F4b · 195 chars every 16 ms',
    chunk: 195,
    periodMs: 16,
  },
  c1: {
    label: '1 char @1ms',
    name: 'Drip',
    caption: '1 char every 1 ms',
    chunk: 1,
    periodMs: 1,
  },
  f4d: {
    label: 'F4d code-heavy 20 @16ms',
    name: 'Code',
    caption: 'F4d · code-heavy, 20 chars every 16 ms',
    chunk: 20,
    periodMs: 16,
  },
};

const SCHEDULER_NAMES: Record<SchedulerChoice, string> = {
  timeout: 'Timer',
  raf: 'Auto',
};
const SMOOTHING_NAMES: Record<Smoothing, string> = {
  'none': 'Off',
  'hide-incomplete': 'Hide partial',
};

const INTERVALS = ['16', '33', '50', '100'] as const;
const DROPPED_FRAME_MS = 20;
/** Text streamed by a preset: F2, or the code-heavy fixture for F4d. */
const sourceFor = (preset: PresetId): string =>
  preset === 'f4d' ? CODE_HEAVY : F2;

interface Config {
  readonly scheduler: SchedulerChoice;
  readonly flushIntervalMs: number;
  readonly smoothing: Smoothing;
  readonly preset: PresetId;
}

interface Dist {
  readonly n: number;
  readonly p50: number;
  readonly p90: number;
  readonly max: number;
}

interface RunResult {
  readonly config: Config;
  readonly device: ReturnType<typeof deviceInfo>;
  readonly chars: number;
  readonly chunks: number;
  readonly totalMs: number;
  /** Commits of a new document before `done()`'s. */
  readonly commitCount: number;
  /** Time between consecutive commit renders. */
  readonly commitSpacingMs: Dist;
  readonly frames: Dist & { readonly dropped: number };
  readonly latencyMs: Dist;
  readonly finalEqual: boolean;
}

interface Meter {
  start: number;
  appends: { t: number; cum: number }[];
  committed: number;
  /** Render time of each commit of a new document (before `done()`'s). */
  commits: number[];
  frameDeltas: number[];
  lastFrame: number;
  frameHandle: number | null;
  latencies: number[];
  chunks: number;
  finished: boolean;
}

const newMeter = (): Meter => ({
  start: performance.now(),
  appends: [],
  committed: 0,
  commits: [],
  frameDeltas: [],
  lastFrame: 0,
  frameHandle: null,
  latencies: [],
  chunks: 0,
  finished: false,
});

function dist(values: readonly number[]): Dist {
  if (values.length === 0) return { n: 0, p50: 0, p90: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[
      Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1))
    ]!;
  return { n: sorted.length, p50: at(0.5), p90: at(0.9), max: sorted.at(-1)! };
}

/** Text of every block and its main elements: equal documents give equal strings. */
function signature(document: MarkdownDocument): string {
  const parts: string[] = [`blocks:${document.blockCount}`];
  const note =
    (name: string) =>
    (_: unknown, info: { text: string; blockIndex: number }) => {
      parts.push(`${info.blockIndex}|${name}|${info.text}`);
    };
  visit(document, {
    Paragraph: note('p'),
    Heading: note('h'),
    CodeBlock: note('c'),
    ListItem: note('li'),
    TableCell: note('td'),
    Link: note('a'),
  });
  return parts.join('\n');
}

/** One streamed run. Remounted (by key) for each run: the hook reads its options once. */
function Run({
  config,
  onDone,
}: {
  config: Config;
  onDone: (result: RunResult) => void;
}) {
  const source = sourceFor(config.preset);
  const meterRef = useRef<Meter | null>(null);
  const finishing = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Public API only. 'timeout' passes the window; 'raf' is the hook default
  // (raf on iOS and Android, a 16 ms timer on web).
  const stream = useMarkdownStream({
    smoothing: config.smoothing,
    ...(config.scheduler === 'timeout'
      ? { flushIntervalMs: config.flushIntervalMs }
      : {}),
  });
  const { append, done, document } = stream;

  // When this document was rendered: every append made before it is in it
  // (the flush that produced it ran before this render).
  // A measurement, so the clock read in render is the point.
  // eslint-disable-next-line react-hooks/purity, react-hooks/exhaustive-deps
  const renderedAt = useMemo(() => performance.now(), [document]);

  // The commit that carries `done()`'s document ends the run; every commit
  // resolves the latency of the appends it contains.
  useLayoutEffect(() => {
    const meter = meterRef.current;
    if (!meter || meter.finished) return;
    const now = performance.now();
    const included = finishing.current ? Infinity : renderedAt;
    if (!finishing.current) meter.commits.push(renderedAt);
    while (
      meter.committed < meter.appends.length &&
      meter.appends[meter.committed]!.t <= included
    ) {
      meter.latencies.push(now - meter.appends[meter.committed]!.t);
      meter.committed++;
    }
    if (!finishing.current) return;

    meter.finished = true;
    if (meter.frameHandle !== null) cancelAnimationFrame(meter.frameHandle);
    const result: RunResult = {
      config,
      device: deviceInfo(),
      chars: source.length,
      chunks: meter.chunks,
      totalMs: now - meter.start,
      commitCount: meter.commits.length,
      commitSpacingMs: dist(
        meter.commits.slice(1).map((t, i) => t - meter.commits[i]!)
      ),
      frames: {
        ...dist(meter.frameDeltas),
        dropped: meter.frameDeltas.filter((d) => d > DROPPED_FRAME_MS).length,
      },
      latencyMs: dist(meter.latencies),
      finalEqual: signature(document) === signature(parse(source)),
    };
    setTimeout(() => onDoneRef.current(result), 0);
  }, [document, renderedAt, config, source]);

  // The driver: one chunk per tick, scheduled against the run's start so the
  // pacing does not drift; frame gaps are sampled the whole time.
  useEffect(() => {
    const { chunk, periodMs } = PRESETS[config.preset];
    const meter = newMeter();
    meterRef.current = meter;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pos = 0;
    let k = 0;

    const onFrame = () => {
      if (cancelled) return;
      const now = performance.now();
      if (meter.lastFrame > 0) meter.frameDeltas.push(now - meter.lastFrame);
      meter.lastFrame = now;
      meter.frameHandle = requestAnimationFrame(onFrame);
    };
    meter.frameHandle = requestAnimationFrame(onFrame);

    const tick = () => {
      if (cancelled) return;
      if (pos >= source.length) {
        finishing.current = true;
        done();
        return;
      }
      const text = source.slice(pos, pos + chunk);
      pos += text.length;
      meter.appends.push({ t: performance.now(), cum: pos });
      meter.chunks++;
      append(text);
      k++;
      timer = setTimeout(
        tick,
        Math.max(0, meter.start + k * periodMs - performance.now())
      );
    };
    tick();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (meter.frameHandle !== null) cancelAnimationFrame(meter.frameHandle);
    };
  }, [config, source, append, done]);

  return (
    <ScrollView style={styles.preview} nestedScrollEnabled>
      <Markdown document={document} />
    </ScrollView>
  );
}

const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));
const distText = (d: Dist) => `${fmt(d.p50)} / ${fmt(d.p90)} / ${fmt(d.max)}`;

function ResultCard({ r, index }: { r: RunResult; index: number }) {
  const c = r.config;
  const lines = [
    `commits ${r.commitCount}  (${r.chunks} chunks)  total ${fmt(r.totalMs)} ms`,
    `commit spacing p50/p90/max ${distText(r.commitSpacingMs)}`,
    `frame gap p50/p90/max      ${distText(r.frames)}  dropped ${r.frames.dropped}/${r.frames.n}`,
    `append→commit p50/p90/max  ${distText(r.latencyMs)}`,
    `final == parse(full): ${r.finalEqual ? 'yes' : 'NO'}`,
  ];
  return (
    <Card style={styles.result}>
      <UIText variant="label">
        {`#${index} ${c.scheduler === 'timeout' ? `timeout@${c.flushIntervalMs}` : 'default'} · ${PRESETS[c.preset].label} · ${c.smoothing}`}
      </UIText>
      <UIText variant="caption" muted>
        {`${PRESETS[c.preset].name} · ${SCHEDULER_NAMES[c.scheduler]}${c.scheduler === 'timeout' ? ` ${c.flushIntervalMs} ms` : ''} · smoothing ${SMOOTHING_NAMES[c.smoothing].toLowerCase()}`}
      </UIText>
      {lines.map((line) => (
        <UIText key={line} variant="mono">
          {line}
        </UIText>
      ))}
    </Card>
  );
}

/** Order that cancels drift between the two strategies: A B B A A B. */
const ABBA: readonly SchedulerChoice[] = [
  'timeout',
  'raf',
  'raf',
  'timeout',
  'timeout',
  'raf',
];

interface Options {
  readonly scheduler: SchedulerChoice;
  readonly interval: (typeof INTERVALS)[number];
  readonly smoothing: Smoothing;
  readonly preset: PresetId;
}

const DEFAULTS: Options = {
  scheduler: 'timeout',
  interval: '50',
  smoothing: 'none',
  preset: 'f4a',
};

const schedulerCaption = (o: Options): string =>
  o.scheduler === 'timeout'
    ? `timeout · flushIntervalMs ${o.interval}`
    : 'hook default · frame on iOS/Android, 16 ms timer on web';

export function StreamBench() {
  const { p } = useChrome();
  const [options, setOptions] = useState<Options>(DEFAULTS);
  const [sheet, setSheet] = useState(false);
  const { scheduler, interval, smoothing, preset } = options;
  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));
  const changed = JSON.stringify(options) !== JSON.stringify(DEFAULTS);

  const [active, setActive] = useState<{ id: number; config: Config } | null>(
    null
  );
  const [queue, setQueue] = useState<readonly SchedulerChoice[]>([]);
  const [results, setResults] = useState<readonly RunResult[]>([]);
  const nextId = useRef(0);

  const configFor = (choice: SchedulerChoice): Config => ({
    scheduler: choice,
    flushIntervalMs: Number(interval),
    smoothing,
    preset,
  });

  const start = (choice: SchedulerChoice, rest: readonly SchedulerChoice[]) => {
    setQueue(rest);
    setActive({ id: nextId.current++, config: configFor(choice) });
  };

  const onDone = (result: RunResult) => {
    const all = [result, ...results];
    setResults(all);
    logChunked('streamBench', result);
    const [next, ...rest] = queue;
    if (next) {
      setQueue(rest);
      setActive({ id: nextId.current++, config: configFor(next) });
    } else {
      setActive(null);
    }
  };

  const summary = `${PRESETS[preset].name} · ${SCHEDULER_NAMES[scheduler]}${
    scheduler === 'timeout' ? ` ${interval} ms` : ''
  } · smoothing ${SMOOTHING_NAMES[smoothing].toLowerCase()}`;

  return (
    <View style={styles.root}>
      {active ? (
        // While a run is active the preview takes the whole free area and the
        // previous results are hidden (they stay in state), so the stream can
        // be watched in detail.
        <View style={styles.live}>
          <Run key={active.id} config={active.config} onDone={onDone} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            <UIText variant="body" muted>
              Stream ·{' '}
              {__DEV__
                ? 'dev build (numbers are not representative)'
                : 'release build'}
              . Streams F2 ({F2.length} chars) or the code-heavy fixture (
              {CODE_HEAVY.length} chars) and measures the flush scheduling. Pick
              what to stream in Options, then Run.
            </UIText>

            {results.map((r, i) => (
              <ResultCard
                key={results.length - i}
                r={r}
                index={results.length - i}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <View pointerEvents="box-none" style={styles.dock}>
        <Card style={styles.stats}>
          <UIText variant="caption" muted numberOfLines={1}>
            {active
              ? `Running ${SCHEDULER_NAMES[active.config.scheduler].toLowerCase()}… ${queue.length} more queued`
              : 'Ready'}
          </UIText>
          <UIText variant="caption" numberOfLines={1}>
            {summary}
          </UIText>
        </Card>
        <View style={styles.dockRow}>
          <Button
            label={`Options${changed ? ' •' : ''}`}
            tone="quiet"
            onPress={() => setSheet(true)}
            style={[styles.dockButton, styles.optionsButton]}
          />
          <Button
            label="Run"
            disabled={active !== null}
            onPress={() => start(scheduler, [])}
            style={styles.dockButton}
          />
          <Button
            label="Stop"
            tone="quiet"
            disabled={active === null}
            onPress={() => {
              setQueue([]);
              setActive(null);
            }}
            style={styles.dockButton}
          />
        </View>
      </View>

      <Modal
        visible={sheet}
        transparent
        animationType="slide"
        onRequestClose={() => setSheet(false)}
      >
        <Pressable
          accessibilityLabel="Close options"
          style={[styles.scrim, { backgroundColor: p.scrim }]}
          onPress={() => setSheet(false)}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: p.bg, borderColor: p.border },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: p.border }]} />
          <View style={styles.sheetHeader}>
            <UIText variant="heading">Options</UIText>
            <View style={styles.sheetActions}>
              <Button
                label="Reset"
                tone="quiet"
                disabled={!changed}
                onPress={() => setOptions(DEFAULTS)}
              />
              <Button label="Done" onPress={() => setSheet(false)} />
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            <Field label="Stream">
              <Segmented
                label="Stream preset"
                value={preset}
                onChange={(v) => set('preset', v)}
                options={(Object.keys(PRESETS) as PresetId[]).map((id) => ({
                  value: id,
                  label: PRESETS[id].name,
                }))}
              />
              <UIText variant="caption" muted>
                {PRESETS[preset].caption}
              </UIText>
            </Field>
            <Field label="Updates">
              <Segmented
                label="Scheduler"
                value={scheduler}
                onChange={(v) => set('scheduler', v)}
                options={[
                  { value: 'timeout', label: SCHEDULER_NAMES.timeout },
                  { value: 'raf', label: SCHEDULER_NAMES.raf },
                ]}
              />
              <UIText variant="caption" muted>
                {schedulerCaption(options)}
              </UIText>
            </Field>
            <Field label="Timer window">
              <Segmented
                label="Flush window"
                value={interval}
                onChange={(v) => set('interval', v)}
                options={INTERVALS.map((v) => ({
                  value: v,
                  label: `${v} ms`,
                }))}
              />
              <UIText variant="caption" muted>
                {`flushIntervalMs ${interval}${
                  scheduler === 'raf' ? ' · ignored by Auto' : ''
                }`}
              </UIText>
            </Field>
            <Field label="Smoothing">
              <Segmented
                label="Smoothing"
                value={smoothing}
                onChange={(v) => set('smoothing', v)}
                options={[
                  { value: 'none', label: SMOOTHING_NAMES.none },
                  {
                    value: 'hide-incomplete',
                    label: SMOOTHING_NAMES['hide-incomplete'],
                  },
                ]}
              />
              <UIText variant="caption" muted>
                {`smoothing '${smoothing}'`}
              </UIText>
            </Field>
            <Field label="Runs">
              <View style={styles.buttons}>
                <Button
                  label="A/B ×3"
                  tone="quiet"
                  disabled={active !== null}
                  onPress={() => {
                    setSheet(false);
                    start(ABBA[0]!, ABBA.slice(1));
                  }}
                />
                <Button
                  label="Log all"
                  tone="quiet"
                  disabled={results.length === 0}
                  onPress={() => logChunked('streamBench', results)}
                />
                <Button
                  label="Clear"
                  tone="quiet"
                  disabled={results.length === 0 || active !== null}
                  onPress={() => setResults([])}
                />
              </View>
              <UIText variant="caption" muted>
                A/B ×3 runs Timer and Auto in the order A B B A A B with the
                options above.
              </UIText>
            </Field>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 170 },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 14 },
  buttons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  // The live preview fills the free area above the dock.
  live: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 170,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  preview: { flex: 1 },
  result: { gap: 4 },
  dock: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 10,
  },
  stats: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dockButton: { flex: 1 },
  optionsButton: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  scrim: { flex: 1 },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sheetActions: { flexDirection: 'row', gap: 8 },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 32, gap: 20 },
});
