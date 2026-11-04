// M1 done check (#9): token → node table conversion must cost at most 15% of
// markdown-it's own parse time for the ~97 KB fixture, measured with
// `node --jitless` (a rough proxy for Hermes, which has no JIT). A relative
// budget, because absolute times depend on the machine.
//
//   yarn convert            # JIT
//   yarn convert:jitless    # no JIT: the number the done check uses
//
// Imports the library's TypeScript sources directly (via tsx).

import { readFileSync } from 'node:fs';
import { getMarkdownIt } from '../src/parse/markdownIt.ts';
import { convertTokens } from '../src/parse/convert.ts';
import { parse } from '../src/api/parse.ts';

const repeat = Number(process.argv[2] || 60);
const budgetRatio = 0.15;

// Same fixture as bench.mjs / model.mjs: markdown-it's README plus a GFM snippet.
const unit =
  readFileSync(
    new URL('./node_modules/markdown-it/README.md', import.meta.url),
    'utf8'
  ) +
  `\n\n| a | b |\n|---|---|\n| **x** | [l](http://a.com) |\n\n` +
  `- [x] task\n- [ ] ~~gone~~ www.example.com\n\n`;
const source = unit.repeat(repeat);

const md = getMarkdownIt('gfm');
const tokens = md.parse(source, {});
const options = { html: 'safe' };

function median(fn, runs = 11, warmup = 3) {
  for (let i = 0; i < warmup; i++) fn();
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(runs / 2)];
}

const parseMs = median(() => md.parse(source, {}));
const convertMs = median(() => convertTokens(md, tokens, source, options));
const totalMs = median(() => parse(source));
const { table } = convertTokens(md, tokens, source, options);

const jit = process.execArgv.includes('--jitless') ? 'jitless' : 'JIT';
console.log(
  `doc ${(source.length / 1024).toFixed(0)} KB · ${tokens.length} tokens · ${table.count} nodes · ${table.blockCount} blocks · ${jit}`
);
console.log(`markdown-it parse        median ${parseMs.toFixed(1)} ms`);
console.log(`token → table convert    median ${convertMs.toFixed(1)} ms`);
console.log(`parse() end to end       median ${totalMs.toFixed(1)} ms`);
const ratio = convertMs / parseMs;
const pass = ratio <= budgetRatio;
console.log(
  `conversion overhead: ${(ratio * 100).toFixed(1)}% of parse; budget ${budgetRatio * 100}% → ${pass ? 'PASS' : 'FAIL'}`
);
process.exitCode = pass ? 0 : 1;
