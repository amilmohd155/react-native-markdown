// Parse-only comparison on the device fixtures (F1–F3): v1 parse() vs
// v0.8.5's parser (mdast-util-from-markdown, which v0 calls without GFM).
//
// Usage (from this directory):
//   node --jitless --import tsx fixtures-parse.mjs   # no-JIT proxy for Hermes
//
// Context: docs/rewrite/02-benchmarks.md, "Device results (preliminary, M3)".

import { fromMarkdown } from 'mdast-util-from-markdown';
import { FIXTURES } from './fixtures/index.ts';
import { parse } from '../src/api/index.ts';

function median(fn, runs = 11) {
  for (let i = 0; i < 3; i++) fn();
  const t = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

for (const { id, source } of FIXTURES) {
  const v1 = median(() => parse(source));
  const v0 = median(() => fromMarkdown(source));
  console.log(
    `${id} ${(source.length / 1024).toFixed(1)} KB  v1 parse ${v1.toFixed(1)} ms  v0 fromMarkdown ${v0.toFixed(1)} ms  (${(v0 / v1).toFixed(1)}x)`
  );
}
