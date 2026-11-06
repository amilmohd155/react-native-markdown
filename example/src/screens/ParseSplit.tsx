import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { F2, F3, F3_CM } from '../../../bench/fixtures';
import {
  buildThrowawayMarkdownIt,
  instrumentRules,
  stats,
} from '../../../bench/parseSplit';
import { parse } from '../../../src/api/parse';
import { convertTokens, getMarkdownIt } from '../../../src/parse';
import { UIText } from '../ui';
import { deviceInfo, forceGc, frames, logChunked } from './benchUtil';

/**
 * Where does parse() time go (issue #36 C1, P1-10)? Splits it into
 * markdown-it (`md.parse`) and the node builder (`convertTokens`), next to
 * the public `parse()`, then times each markdown-it core rule on a throwaway
 * instance (instrumented, so its totals are inflated; compare shares).
 *
 * 3 warm-up + 21 measured runs, md/conv/parse interleaved per run. The
 * README x60 fixture of bench/convert.mjs needs the Node filesystem, so
 * here "F2 x10" (F2 repeated to ~100 KB) stands in for it.
 *
 * Release build only. Results are on screen and logged as
 * `[parseSplit i/n] <json>`:
 *   adb logcat -d -s ReactNativeJS -v raw | grep '^\[parseSplit'
 */

const WARMUP = 3;
const RUNS = 21;
const FIXTURES = [
  { id: 'F2x10', source: F2.repeat(10) },
  { id: 'F3', source: F3 },
  { id: 'F3-cm', source: F3_CM },
] as const;

interface SplitRow {
  readonly id: string;
  readonly kb: number;
  readonly tokens: number;
  readonly md50: number;
  readonly md90: number;
  readonly cv50: number;
  readonly cv90: number;
  readonly parse50: number;
  readonly parse90: number;
  /** convertTokens p50 over md.parse p50; the P1-10 budget is 0.15. */
  readonly ratio50: number;
}

interface RuleRow {
  readonly fixture: string;
  readonly rule: string;
  readonly msPerParse: number;
  readonly pct: number;
  readonly callsPerParse: number;
}

export interface ParseSplitResult {
  readonly rows: readonly SplitRow[];
  readonly rules: readonly RuleRow[];
  readonly timerPairNs: number;
}

function timed<T>(fn: () => T): [number, T] {
  const t0 = performance.now();
  const r = fn();
  return [performance.now() - t0, r];
}

async function run(setStatus: (s: string) => void): Promise<ParseSplitResult> {
  const md = getMarkdownIt('gfm');
  const rows: SplitRow[] = [];
  const rules: RuleRow[] = [];
  let timerPairNs = 0;

  for (const { id, source } of FIXTURES) {
    const mdT: number[] = [];
    const cvT: number[] = [];
    const pT: number[] = [];
    let tokenCount = 0;
    for (let i = 0; i < WARMUP + RUNS; i++) {
      setStatus(`${id} split ${i < WARMUP ? 'warm-up' : i - WARMUP + 1}`);
      await frames(1);
      forceGc();
      const [a, tokens] = timed(() => md.parse(source, {}));
      tokenCount = tokens.length;
      const [b] = timed(() =>
        convertTokens(md, tokens, source, { html: 'safe' })
      );
      const [c] = timed(() => parse(source));
      if (i >= WARMUP) {
        mdT.push(a);
        cvT.push(b);
        pT.push(c);
      }
    }
    const m = stats(mdT);
    const c = stats(cvT);
    const p = stats(pT);
    rows.push({
      id,
      kb: Math.round(source.length / 1024),
      tokens: tokenCount,
      md50: m.p50,
      md90: m.p90,
      cv50: c.p50,
      cv90: c.p90,
      parse50: p.p50,
      parse90: p.p90,
      ratio50: c.p50 / m.p50,
    });
  }

  for (const { id, source } of FIXTURES) {
    setStatus(`${id} rules`);
    await frames(1);
    const t = buildThrowawayMarkdownIt();
    const inst = instrumentRules(t);
    timerPairNs = inst.overhead * 1e6;
    for (let i = 0; i < WARMUP; i++) t.parse(source, {});
    inst.reset();
    let total = 0;
    for (let i = 0; i < RUNS; i++) total += timed(() => t.parse(source, {}))[0];
    inst
      .stats()
      .filter((r) => r.calls > 0 && r.ms / RUNS >= 0.005)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 14)
      .forEach((r) =>
        rules.push({
          fixture: id,
          rule: `${r.group}:${r.name}`,
          msPerParse: r.ms / RUNS,
          pct: (r.ms / total) * 100,
          callsPerParse: Math.round(r.calls / RUNS),
        })
      );
  }

  const result = { rows, rules, timerPairNs };
  logChunked('parseSplit', { device: deviceInfo(), WARMUP, RUNS, ...result });
  return result;
}

const f1 = (x: number) => x.toFixed(1);

export function ParseSplit() {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState<ParseSplitResult | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    run((s) => !cancelled && setStatus(s)).then((r) => {
      if (!cancelled) {
        setResult(r);
        setStatus('done');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [started]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <UIText variant="label" style={styles.line}>
        parse split · {status}
        {__DEV__ ? ' · DEV BUILD, numbers are not representative' : ''}
      </UIText>
      {!started ? (
        <Pressable style={styles.button} onPress={() => setStarted(true)}>
          <UIText variant="label">Run</UIText>
        </Pressable>
      ) : null}
      {result ? (
        <View>
          <UIText variant="label" style={styles.line}>
            ms, p50 / p90 of {RUNS}. ratio = conv/md p50 (budget 15%)
          </UIText>
          {result.rows.map((r) => (
            <UIText key={r.id} style={styles.mono}>
              {`${r.id} ${r.kb}KB ${r.tokens}tok\n  md ${f1(r.md50)}/${f1(r.md90)}  conv ${f1(r.cv50)}/${f1(r.cv90)}  parse ${f1(r.parse50)}/${f1(r.parse90)}\n  ratio ${(r.ratio50 * 100).toFixed(1)}%`}
            </UIText>
          ))}
          <UIText variant="label" style={styles.line}>
            core and inline rules (instrumented; timer pair{' '}
            {result.timerPairNs.toFixed(0)} ns subtracted per call)
          </UIText>
          {result.rules.map((r) => (
            <UIText key={`${r.fixture}${r.rule}`} style={styles.mono}>
              {`${r.fixture} ${r.rule} ${r.msPerParse.toFixed(2)}ms ${r.pct.toFixed(1)}% x${r.callsPerParse}`}
            </UIText>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  line: { paddingVertical: 8 },
  mono: { fontFamily: 'monospace', fontSize: 11, paddingVertical: 3 },
  button: { padding: 12, borderWidth: 1, borderRadius: 8, marginVertical: 8 },
});
