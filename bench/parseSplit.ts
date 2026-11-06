/**
 * Shared by bench/parse-split.mjs (Node) and example/src/screens/ParseSplit.tsx
 * (device): the md.parse vs convertTokens split (issue #36 C1, P1-10) and a
 * per-rule markdown-it breakdown on a throwaway instance.
 */
import markdownIt, { type MarkdownIt } from 'markdown-it';
import { MAX_NESTING } from '../src/parse/markdownIt';
import { resolvePreset } from '../src/plugins/presets';

/** Same construction as src/parse/markdownIt.ts createParser, uncached. */
export function buildThrowawayMarkdownIt(): MarkdownIt {
  const md = markdownIt('commonmark', {
    html: true,
    linkify: false,
    typographer: false,
    maxNesting: MAX_NESTING,
  });
  for (const plugin of resolvePreset('gfm')) plugin.syntax?.markdownIt?.(md);
  return md;
}

interface RuleEntry {
  name: string;
  fn: (...args: never[]) => unknown;
}
interface RulerInternals {
  __rules__: RuleEntry[];
}

export interface RuleStat {
  readonly group: 'core' | 'inline' | 'inline2';
  readonly name: string;
  /** Total ms over the measured parses, overhead-corrected, floored at 0. */
  readonly ms: number;
  readonly calls: number;
}

/** Cost of one `performance.now()` pair in ms (median of batches). */
export function timerOverheadMs(): number {
  const per: number[] = [];
  for (let b = 0; b < 15; b++) {
    const n = 5000;
    const t0 = performance.now();
    let sink = 0;
    for (let i = 0; i < n; i++) {
      const a = performance.now();
      sink += performance.now() - a;
    }
    per.push((performance.now() - t0) / n);
    if (sink < 0) throw new Error('unreachable');
  }
  per.sort((a, b) => a - b);
  return per[Math.floor(per.length / 2)]!;
}

/**
 * Wraps every core, inline and inline-postprocess rule of `md` (mutates it:
 * pass a throwaway). Inline rules called recursively (link text, emphasis)
 * are counted by each call, so inline totals can exceed the core `inline`
 * rule's time.
 */
export function instrumentRules(md: MarkdownIt) {
  const acc = new Map<
    string,
    { group: RuleStat['group']; ms: number; calls: number }
  >();
  const groups: [RuleStat['group'], RulerInternals][] = [
    ['core', md.core.ruler as unknown as RulerInternals],
    ['inline', md.inline.ruler as unknown as RulerInternals],
    ['inline2', md.inline.ruler2 as unknown as RulerInternals],
  ];
  for (const [group, ruler] of groups) {
    for (const rule of ruler.__rules__) {
      const key = `${group}:${rule.name}`;
      const entry = { group, ms: 0, calls: 0 };
      acc.set(key, entry);
      const orig = rule.fn as (...a: unknown[]) => unknown;
      rule.fn = ((...args: unknown[]) => {
        const t0 = performance.now();
        const r = orig(...args);
        entry.ms += performance.now() - t0;
        entry.calls++;
        return r;
      }) as RuleEntry['fn'];
    }
  }
  const overhead = timerOverheadMs();
  return {
    overhead,
    reset() {
      for (const e of acc.values()) {
        e.ms = 0;
        e.calls = 0;
      }
    },
    stats(): RuleStat[] {
      return [...acc.entries()].map(([key, e]) => ({
        group: e.group,
        name: key.slice(key.indexOf(':') + 1),
        // each call includes about one timer pair of its own overhead
        ms: Math.max(0, e.ms - e.calls * overhead),
        calls: e.calls,
      }));
    },
  };
}

export interface Stats {
  readonly p50: number;
  readonly p90: number;
  readonly mean: number;
}

export function stats(xs: readonly number[]): Stats {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) =>
    s[Math.max(0, Math.min(s.length - 1, Math.ceil(p * s.length) - 1))]!;
  return {
    p50: q(0.5),
    p90: q(0.9),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}
