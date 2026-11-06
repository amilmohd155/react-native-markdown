// F3-cm check (issue #36 / P1-25): derives F3-cm from F3 (fixtures/commonmark.ts),
// prints what was removed, block counts before and after, proves no GFM
// construct is left, and times parse() for v0.8.5's parser and v1 with the
// GFM plugins on and off. Node numbers only; the device bench is authoritative.
//
//   yarn f3-cm                                    # JIT
//   yarn f3-cm:jitless                            # no JIT: a proxy for Hermes
//   node --import tsx f3-cm.mjs --write out.md    # also save the derived text

import { writeFileSync } from 'node:fs';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { F3, F3_CM } from './fixtures/index.ts';
import { toCommonMark } from './fixtures/commonmark.ts';
import { parse } from '../src/api/parse.ts';
import { tableOf } from '../src/api/document.ts';
import { Flag, NodeType } from '../src/model/types.ts';

const { source, removed } = toCommonMark(F3);
if (source !== F3_CM || toCommonMark(F3).source !== source) {
  throw new Error('F3-cm is not deterministic');
}
const out = process.argv.indexOf('--write');
if (out > 0) writeFileSync(process.argv[out + 1], source);

const lines = (s) => s.split('\n').length - 1;
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1);
console.log(
  `F3     ${Buffer.byteLength(F3)} bytes (${kb(F3)} KB), ${lines(F3)} lines`
);
console.log(
  `F3-cm  ${Buffer.byteLength(source)} bytes (${kb(source)} KB), ${lines(source)} lines`
);
console.log('removed', JSON.stringify(removed));

// Elements the GFM plugins add, counted on the node table behind a document.
function census(doc) {
  const t = tableOf(doc);
  const c = {
    nodes: t.count,
    Table: 0,
    TableCell: 0,
    Strikethrough: 0,
    FootnoteReference: 0,
    FootnoteDefinition: 0,
    taskItems: 0,
    Link: 0,
    autolinks: 0,
  };
  for (let i = 0; i < t.count; i++) {
    switch (t.type[i]) {
      case NodeType.Table:
        c.Table++;
        break;
      case NodeType.TableCell:
        c.TableCell++;
        break;
      case NodeType.Strikethrough:
        c.Strikethrough++;
        break;
      case NodeType.FootnoteReference:
        c.FootnoteReference++;
        break;
      case NodeType.FootnoteDefinition:
        c.FootnoteDefinition++;
        break;
      case NodeType.ListItem:
        if (t.flags[i] & Flag.TASK) c.taskItems++;
        break;
      case NodeType.Link:
        c.Link++;
        if (t.flags[i] & Flag.AUTOLINK) c.autolinks++;
        break;
    }
  }
  return c;
}

const warn = () => {};
const gfmCm = parse(source, { onWarning: warn });
const cmCm = parse(source, { preset: 'commonmark', onWarning: warn });
const docs = [
  ['F3    v1 gfm       ', parse(F3, { onWarning: warn })],
  ['F3-cm v1 gfm       ', gfmCm],
  ['F3-cm v1 commonmark', cmCm],
];
for (const [name, doc] of docs) {
  console.log(name, `blocks ${doc.blockCount}`, JSON.stringify(census(doc)));
}
console.log(
  `v0 mdast blocks: F3 ${fromMarkdown(F3).children.length}, F3-cm ${fromMarkdown(source).children.length}`
);
const same =
  JSON.stringify(census(gfmCm)) === JSON.stringify(census(cmCm)) &&
  gfmCm.blockCount === cmCm.blockCount;
console.log(
  `F3-cm: gfm and commonmark presets give the same blocks/elements: ${same}`
);

function median(fn, runs = 21) {
  for (let i = 0; i < 5; i++) fn();
  const t = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((a, b) => a - b)[Math.floor(runs / 2)];
}
const ms = (n) => `${n.toFixed(1)} ms`;
console.log('parse, median of 21:');
console.log('  F3     v0 fromMarkdown ', ms(median(() => fromMarkdown(F3))));
console.log(
  '  F3     v1 gfm          ',
  ms(median(() => parse(F3, { onWarning: warn })))
);
console.log(
  '  F3-cm  v0 fromMarkdown ',
  ms(median(() => fromMarkdown(source)))
);
console.log(
  '  F3-cm  v1 gfm          ',
  ms(median(() => parse(source, { onWarning: warn })))
);
console.log(
  '  F3-cm  v1 commonmark   ',
  ms(median(() => parse(source, { preset: 'commonmark', onWarning: warn })))
);
