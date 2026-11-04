// Evidence for P1-9: can two documents have a block with identical source
// text that must render differently? If yes, block identity can't be "source
// text" (or a hash of it) alone.
//   node --import tsx identity-pitfalls.mjs
import { parseWithMarkdownIt } from '../src/parse/markdownItBackend.ts';
import { childIds, getAttrs, getText, isSameBlock } from '../src/model/index.ts';

function block(src, i, options) {
  const { table } = parseWithMarkdownIt(src, options);
  const id = table.blocks[i];
  return {
    table,
    i,
    id,
    source: src.slice(table.blockStart[i], table.blockEnd[i]),
  };
}

/** Flat description of a node and its descendants (types, text, attrs). */
function describe(table, id) {
  const parts = [`${table.type[id]}`, JSON.stringify(getAttrs(table, id)), getText(table, id) ?? ''];
  for (const c of childIds(table, id)) parts.push(describe(table, c));
  return parts.join('|');
}

function check(name, a, b) {
  const sameSource = a.source === b.source;
  const sameTree = describe(a.table, a.id) === describe(b.table, b.id);
  const same = isSameBlock(a.table, a.i, b.table, b.i);
  const verdict =
    sameSource && !sameTree
      ? `source-only identity would be stale; isSameBlock=${same} → ${same ? 'BUG' : 'caught'}`
      : 'ok';
  console.log(`${name.padEnd(42)} sameSource=${sameSource} sameTree=${sameTree} · ${verdict}`);
}

// 1. Reference definitions are document-global.
check(
  '1. reference definition changed elsewhere',
  block('[docs][ref]\n\n[ref]: /old\n', 0),
  block('[docs][ref]\n\n[ref]: /new\n', 0)
);

// 2. Heading slug de-duplication depends on earlier headings.
check(
  '2. duplicate heading inserted earlier',
  block('# Intro\n\ntext\n\n# Intro\n', 2),
  block('# Intro\n\n# Intro\n\n# Intro\n', 2)
);

// 3. Parse options change the tree for the same text.
check(
  '3. preset differs (table vs paragraph)',
  block('| a |\n|---|\n| b |\n', 0, { preset: 'gfm' }),
  block('| a |\n|---|\n| b |\n', 0, { preset: 'commonmark' })
);
check(
  '3b. html mode differs',
  block('a <sup>1</sup>\n', 0, { html: 'safe' }),
  block('a <sup>1</sup>\n', 0, { html: 'text' })
);

// 4. Streaming: a following line changes an earlier block's type (setext).
const s1 = block('Title\n', 0);
const s2 = block('Title\n===\n', 0);
console.log(
  `${'4. setext underline appended'.padEnd(46)} sameSource=${s1.source === s2.source} → range grows, caught (ok)`
);

// 5. Keys: inserting a block shifts index and offset of every later block.
// With index-only keys (blockKey), key "2" now holds what used to be block 1:
// later blocks shift by one and re-render (not remount). Editing a block, by
// contrast, keeps every later key and isSameBlock skips them.
const e1 = parseWithMarkdownIt('a\n\nedit me\n\nc\n').table;
const e2 = parseWithMarkdownIt('a\n\nedited text\n\nc\n').table;
console.log(
  `${'5. edit a middle block'.padEnd(42)} block 2 same=${isSameBlock(e1, 2, e2, 2)} (offset moved ${e1.blockStart[2]} → ${e2.blockStart[2]}, key stays "2")`
);
