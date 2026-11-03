// Parser benchmark used in docs/rewrite/02-benchmarks.md.
//
// Usage (from this directory):
//   npm install
//   node bench.mjs [repeat=5] [--no-stream]
//   node --jitless bench.mjs 60 --no-stream   # no-JIT proxy for Hermes
//
// The fixture is markdown-it's README plus a GFM snippet (table, task list,
// strikethrough, autolink literal), repeated `repeat` times.

import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import MarkdownIt from 'markdown-it';
import { marked } from 'marked';
import * as commonmark from 'commonmark';
import { readFileSync } from 'node:fs';

const repeat = Number(process.argv[2] || 5);
const noStream = process.argv.includes('--no-stream');

const unit =
  readFileSync(
    new URL('./node_modules/markdown-it/README.md', import.meta.url),
    'utf8'
  ) +
  `\n\n| a | b |\n|---|---|\n| **x** | [l](http://a.com) |\n\n` +
  `- [x] task\n- [ ] ~~gone~~ www.example.com\n\n`;
const doc = unit.repeat(repeat);

const md = new MarkdownIt();
const cm = new commonmark.Parser();
const mdast = (s) =>
  fromMarkdown(s, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

const cases = {
  'mdast (micromark+gfm)': () => mdast(doc),
  'markdown-it (tokens)': () => md.parse(doc, {}),
  'marked lexer (gfm)': () => marked.lexer(doc),
  'commonmark.js (no gfm)': () => cm.parse(doc),
};

console.log(`doc: ${(doc.length / 1024).toFixed(0)} KB`);
for (const [name, fn] of Object.entries(cases)) {
  for (let i = 0; i < 3; i++) fn(); // warm-up
  const t = [];
  for (let i = 0; i < 11; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  console.log(name.padEnd(28), 'median', t[5].toFixed(1), 'ms');
}

if (!noStream) {
  // Naive streaming: re-parse the whole buffer at each of 200 append steps.
  const steps = 200;
  const step = Math.ceil(doc.length / steps);
  const streamCases = {
    'mdast reparse-all': mdast,
    'marked reparse-all': (s) => marked.lexer(s),
  };
  for (const [name, fn] of Object.entries(streamCases)) {
    const s0 = performance.now();
    for (let i = 1; i <= steps; i++) fn(doc.slice(0, i * step));
    console.log(
      name.padEnd(28),
      'total',
      (performance.now() - s0).toFixed(0),
      `ms for ${steps} chunks`
    );
  }
}
