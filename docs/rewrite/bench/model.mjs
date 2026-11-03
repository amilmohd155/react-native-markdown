// Data-model benchmark used in docs/rewrite/08-model-and-api.md.
// Compares building an object tree vs a flat struct-of-arrays node table from
// markdown-it tokens (time), and retained heap per document (memory).
//   node model.mjs 60 time
//   node --jitless model.mjs 60 time
//   node --expose-gc model.mjs 60 <mdast|tokens|tree|table>

import MarkdownIt from 'markdown-it';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { readFileSync } from 'node:fs';
const unit = readFileSync(new URL('./node_modules/markdown-it/README.md', import.meta.url), 'utf8') +
  `\n\n| a | b |\n|---|---|\n| **x** | [l](http://a.com) |\n\n- [x] task\n- [ ] ~~gone~~ www.example.com\n\n`;
const N = Number(process.argv[2] || 60);
const doc = unit.repeat(N);
const md = new MarkdownIt();

// A) mdast-like object tree from tokens
function toTree(tokens) {
  const root = { type: 'root', children: [] }; const st = [root];
  const push = (n) => st[st.length - 1].children.push(n);
  const inl = (ch) => { for (const t of ch) {
    if (t.nesting === 1) { const n = { type: t.tag, children: [] }; if (t.attrs) n.attrs = t.attrs; push(n); st.push(n); }
    else if (t.nesting === -1) st.pop();
    else push({ type: t.type, value: t.content }); } };
  for (const t of tokens) {
    if (t.nesting === 1) { const n = { type: t.type.slice(0, -5), children: [], start: t.map?.[0], end: t.map?.[1] }; push(n); st.push(n); }
    else if (t.nesting === -1) st.pop();
    else if (t.type === 'inline') inl(t.children);
    else push({ type: t.type, value: t.content, start: t.map?.[0], end: t.map?.[1] });
  }
  return root;
}
// B) flat struct-of-arrays node table from tokens
const TYPES = new Map(); const tid = (s) => TYPES.get(s) ?? (TYPES.set(s, TYPES.size), TYPES.size - 1);
function toTable(tokens) {
  let cap = 1024, n = 0;
  let type = new Uint8Array(cap), parent = new Int32Array(cap), first = new Int32Array(cap), next = new Int32Array(cap), text = new Int32Array(cap);
  const strings = []; const lastChild = [];
  const grow = () => { cap *= 2; const g = (A, a) => { const b = new A(cap); b.set(a); return b; };
    type = g(Uint8Array, type); parent = g(Int32Array, parent); first = g(Int32Array, first); next = g(Int32Array, next); text = g(Int32Array, text); };
  const add = (t, p, s) => { if (n === cap) grow(); const id = n++; type[id] = tid(t); parent[id] = p; first[id] = -1; next[id] = -1;
    text[id] = s == null ? -1 : (strings.push(s), strings.length - 1);
    if (p >= 0) { if (first[p] === -1) first[p] = id; else next[lastChild[p]] = id; lastChild[p] = id; } return id; };
  const st = [add('root', -1)];
  for (const t of tokens) {
    if (t.nesting === 1) st.push(add(t.type, st[st.length - 1]));
    else if (t.nesting === -1) st.pop();
    else if (t.type === 'inline') { const s2 = [st[st.length - 1]];
      for (const c of t.children) { if (c.nesting === 1) s2.push(add(c.tag, s2[s2.length - 1], c.attrs ? c.attrs[0]?.[1] : null));
        else if (c.nesting === -1) s2.pop(); else add(c.type, s2[s2.length - 1], c.content); } }
    else add(t.type, st[st.length - 1], t.content);
  }
  return { n, type: type.subarray(0, n), parent: parent.subarray(0, n), first: first.subarray(0, n), next: next.subarray(0, n), text: text.subarray(0, n), strings };
}
const time = (f) => { for (let i = 0; i < 3; i++) f(); const t = []; for (let i = 0; i < 11; i++) { const s = performance.now(); f(); t.push(performance.now() - s); } return t.sort((a, b) => a - b)[5]; };
const tokens = md.parse(doc, {});
const mode = process.argv[3];
if (mode === 'time') {
  console.log(`doc ${(doc.length/1024)|0} KB`);
  console.log('markdown-it parse          ', time(() => md.parse(doc, {})).toFixed(1), 'ms');
  console.log('  + tokens → object tree   ', time(() => toTree(tokens)).toFixed(1), 'ms');
  console.log('  + tokens → flat table    ', time(() => toTable(tokens)).toFixed(1), 'ms');
  console.log('micromark → mdast (current)', time(() => fromMarkdown(doc, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })).toFixed(1), 'ms');
  const t = toTable(tokens); console.log('nodes:', t.n);
} else {
  // retained heap for K documents kept alive (e.g. chat history)
  const K = 20; const build = { tokens: () => md.parse(doc, {}), tree: () => toTree(md.parse(doc, {})), table: () => toTable(md.parse(doc, {})),
    mdast: () => fromMarkdown(doc, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) }[mode];
  global.gc(); const before = process.memoryUsage().heapUsed; const keep = []; for (let i = 0; i < K; i++) keep.push(build());
  global.gc(); const mem = process.memoryUsage(); const per = (mem.heapUsed + mem.arrayBuffers - before) / K;
  console.log(mode.padEnd(8), 'retained per', (doc.length/1024|0), 'KB doc:', (per / 1024 / 1024).toFixed(2), 'MB'); keep.length;
}
