// Evidence for P1-9: block identity for memoization —
// FNV-1a hashing in JS at parse time vs native string comparison at render time.
//   node --jitless --import tsx identity.mjs
import { readFileSync } from 'node:fs';
import { parseWithMarkdownIt } from '../src/parse/markdownItBackend.ts';

// The FNV-1a hash the model used before P1-9, kept here as the baseline.
function fnv1a(source, start, end) {
  let hash = 0x811c9dc5;
  for (let i = start; i < end; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const unit =
  readFileSync(new URL('./node_modules/markdown-it/README.md', import.meta.url), 'utf8') +
  `\n\n| a | b |\n|---|---|\n| **x** | [l](http://a.com) |\n\n- [x] task\n- [ ] ~~gone~~ www.example.com\n\n`;
const a = unit.repeat(60);
const b = (' ' + a).slice(1); // equal content, different string object
const { table } = parseWithMarkdownIt(a);

function median(fn, runs = 11) {
  for (let i = 0; i < 3; i++) fn();
  const t = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((x, y) => x - y)[5].toFixed(2);
}

const n = table.blockCount;
console.log(`${n} blocks, ${(a.length / 1024).toFixed(0)} KB`);
console.log(
  'hash every block (parse time)      ',
  median(() => {
    for (let i = 0; i < n; i++) fnv1a(a, table.blockStart[i], table.blockEnd[i]);
  })
);
console.log(
  'compare every block (native slices)',
  median(() => {
    let same = 0;
    for (let i = 0; i < n; i++) {
      const s = table.blockStart[i];
      const e = table.blockEnd[i];
      if (a.slice(s, e) === b.slice(s, e)) same++;
    }
    return same;
  })
);
