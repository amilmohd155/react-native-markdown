// Issue #36 C1: how parse() time splits between markdown-it (md.parse) and the
// node builder (convertTokens), on README x60, F3 and F3-cm; plus a per-rule
// markdown-it breakdown. P1-10 budget: conversion <= 15% of md.parse.
//
//   yarn parse-split            # JIT
//   yarn parse-split:jitless    # no JIT: proxy for Hermes
import { readFileSync } from 'node:fs';
import { getMarkdownIt, convertTokens } from '../src/parse/index.ts';
import { parse } from '../src/api/parse.ts';
import { F3, F3_CM } from './fixtures/index.ts';
import {
  buildThrowawayMarkdownIt,
  instrumentRules,
  stats,
} from './parseSplit.ts';

const WARMUP = 3;
const RUNS = 21;
const readme =
  readFileSync(
    new URL('./node_modules/markdown-it/README.md', import.meta.url),
    'utf8'
  ) +
  `\n\n| a | b |\n|---|---|\n| **x** | [l](http://a.com) |\n\n` +
  `- [x] task\n- [ ] ~~gone~~ www.example.com\n\n`;
const fixtures = [
  ['README x60', readme.repeat(60)],
  ['F3', F3],
  ['F3-cm', F3_CM],
];
const md = getMarkdownIt('gfm');
const options = { html: 'safe' };
const time = (fn) => {
  const t = performance.now();
  const r = fn();
  return [performance.now() - t, r];
};
const f = (x, d = 2) => x.toFixed(d);
const jit = process.execArgv.includes('--jitless') ? 'jitless' : 'JIT';
console.log(
  `== ${jit}, ${WARMUP} warm-up + ${RUNS} runs, interleaved md/conv/parse ==`
);

const summary = [];
for (const [id, src] of fixtures) {
  const mdT = [];
  const cvT = [];
  const pT = [];
  let tokens;
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const [a, toks] = time(() => md.parse(src, {}));
    tokens = toks;
    const [b] = time(() => convertTokens(md, toks, src, options));
    const [c] = time(() => parse(src));
    if (i >= WARMUP) {
      mdT.push(a);
      cvT.push(b);
      pT.push(c);
    }
  }
  const m = stats(mdT);
  const c = stats(cvT);
  const p = stats(pT);
  summary.push({
    id,
    'kb': (src.length / 1024).toFixed(0),
    'tokens': tokens.length,
    'md50': f(m.p50, 1),
    'md90': f(m.p90, 1),
    'cv50': f(c.p50, 1),
    'cv90': f(c.p90, 1),
    'parse50': f(p.p50, 1),
    'parse90': f(p.p90, 1),
    'conv/md p50': `${f((c.p50 / m.p50) * 100, 1)}%`,
    'conv/md p90': `${f((c.p90 / m.p90) * 100, 1)}%`,
    'md share of parse': `${f((m.p50 / p.p50) * 100, 0)}%`,
  });
}
console.table(summary);

// Per-rule breakdown on a throwaway instance (instrumented, so absolute times
// are inflated vs the table above; compare shares).
for (const [id, src] of fixtures) {
  const t = buildThrowawayMarkdownIt();
  const inst = instrumentRules(t);
  for (let i = 0; i < WARMUP; i++) t.parse(src, {});
  inst.reset();
  const totals = [];
  for (let i = 0; i < RUNS; i++) totals.push(time(() => t.parse(src, {}))[0]);
  const total = stats(totals).mean * RUNS;
  const rows = inst.stats().filter((r) => r.calls > 0);
  const core = rows
    .filter((r) => r.group === 'core')
    .sort((a, b) => b.ms - a.ms);
  const inl = rows
    .filter((r) => r.group !== 'core')
    .sort((a, b) => b.ms - a.ms);
  const per = (r) => ({
    'rule': `${r.group}:${r.name}`,
    'ms/parse': f(r.ms / RUNS, 2),
    '% of parse': `${f((r.ms / total) * 100, 1)}%`,
    'calls/parse': Math.round(r.calls / RUNS),
    'ns/call': f((r.ms / r.calls) * 1e6, 0),
  });
  console.log(
    `\n-- ${id}: instrumented parse mean ${f(total / RUNS, 1)} ms; timer pair ${f(inst.overhead * 1e6, 0)} ns (subtracted per call) --`
  );
  console.table(core.map(per));
  console.table(inl.slice(0, 14).map(per));
}
