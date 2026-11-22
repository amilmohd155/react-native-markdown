/**
 * Fixtures shared by the web Jest project (`*.web.test.tsx`) and the
 * Playwright smoke test (M6.3). Each one renders every string in `text`
 * somewhere in its output; `links` are the `href`s expected on the page.
 */
export interface WebFixture {
  readonly name: string;
  readonly source: string;
  readonly text: readonly string[];
  readonly links?: readonly string[];
  /** `alt` of every `<img>` expected on the page. */
  readonly images?: readonly string[];
}

/**
 * A small closed `ts` fence for the smoke screen's `highlight()` block (not
 * in {@link WEB_FIXTURES}, which render without plugins): one `Text` of
 * colour spans whose text is the code exactly.
 */
export const HIGHLIGHT_CODE =
  'const greet = (name: string): string => {\n' +
  '  // a comment\n' +
  '  return `Hello, ${name}!`;\n' +
  '};\n' +
  '\n' +
  'export default greet(42);';

/**
 * A `ts` fence with one line far wider than the screen, for the code block
 * header (P3-35): the body scrolls horizontally, the header stays put.
 */
export const LONG_LINE_CODE =
  'const wide = [' +
  Array.from({ length: 40 }, (_, i) => `'item-${i}'`).join(', ') +
  '];\nexport default wide;';

/**
 * A `ts` fence of 30 lines for line numbers and wrap (P3-35): one blank line
 * in the middle (line 10), two adjacent ones (lines 20 and 21), and one line
 * far wider than the screen (line {@link NUMBERED_LONG_LINE}) that wraps
 * when wrap is on. Over 800 characters, so a highlighted block is chunked
 * in every layout. Selecting the code must yield this exactly.
 */
export const NUMBERED_CODE = (() => {
  const lines: string[] = [];
  for (let i = 1; i <= 30; i++) {
    if (i === 10 || i === 20 || i === 21) lines.push('');
    else if (i === 15) lines.push(LONG_LINE_CODE.split('\n')[0]!);
    else lines.push(`export const v${i} = sum(${i}, 'line ${i}');`);
  }
  return lines.join('\n');
})();

/**
 * A small `ts` fence of 6 lines with a blank line (line 3), under 800
 * characters: highlighted with numbers and no wrap, it is one code Text
 * beside one gutter Text (P3-35), so a drag selects the whole block.
 */
export const NUMBERED_SMALL_CODE = [
  'function greet(name: string) {',
  "  const hi = 'hi ' + name;",
  '',
  '  console.log(hi);',
  '  return hi.trim() === hi ? hi : null;',
  '}',
].join('\n');

/**
 * {@link NUMBERED_CODE} ending in 2 blank lines (P3-35): the code ends in
 * `\n\n`, so native draws an empty last line that the gutter must match.
 * Over 800 characters, so the highlighted block is chunked.
 */
export const NUMBERED_TRAILING_CODE = `${NUMBERED_CODE}\n\n`;

/** The 1-based line of {@link NUMBERED_CODE} that wraps. */
export const NUMBERED_LONG_LINE = 15;

/**
 * A closed `ts` fence of 3 KB, over the single-Text limit, so it renders as
 * one Text per 2 lines. Blank lines fall at chunk ends, inside chunks, as a
 * whole chunk, and in the final chunk (`\n// end`). Selecting the block
 * must yield this exactly.
 */
export const HIGHLIGHT_LARGE_CODE = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 52; i++) {
    lines.push(`function f${i}(a: number): number {`, `  return a * ${i};`);
    lines.push('}', '');
    // Every third group moves the next blank lines inside a chunk.
    if (i % 3 === 0) lines.push(`// note ${i}`);
    // Some groups add a chunk of two blank lines.
    if (i % 5 === 0 && lines.length % 2 === 0) lines.push('', '');
  }
  if (lines.length % 2 === 1) lines.push('// tail');
  // The last two chunks: `}` + blank, then blank + `// end`.
  lines.push('}', '', '', '// end');
  return lines.join('\n');
})();

export const WEB_FIXTURES: readonly WebFixture[] = [
  { name: 'heading', source: '# Title\n\n## Sub', text: ['Title', 'Sub'] },
  {
    name: 'emphasis',
    source: 'a **strong** and *em* and ~~gone~~',
    text: ['strong', 'em', 'gone'],
  },
  {
    name: 'list',
    source: '- one\n- two\n\n1. first\n2. second',
    text: ['one', 'two', 'first', 'second'],
  },
  {
    name: 'code',
    source: '```ts\nconst a = 1;\n```\n\nand `inline`',
    text: ['const a = 1;', 'inline'],
  },
  {
    name: 'table',
    source: '| a | b |\n|---|---|\n| 1 | 2 |',
    text: ['a', 'b', '1', '2'],
  },
  {
    // Words that fill their columns: a width rounded down wraps them mid-word.
    name: 'table-words',
    source:
      '| Left | Center | Right |\n|:---|:---:|---:|\n| aligned | per | column |',
    text: ['Left', 'Center', 'Right', 'aligned', 'per', 'column'],
  },
  {
    name: 'link',
    source: 'see [docs](https://example.com/docs)',
    text: ['docs'],
    links: ['https://example.com/docs'],
  },
  {
    name: 'autolink',
    source: 'go to https://example.com/x',
    text: ['https://example.com/x'],
    links: ['https://example.com/x'],
  },
  {
    name: 'footnote',
    source: 'Text[^1].\n\n[^1]: The note.',
    text: ['Text', 'The note.'],
  },
  {
    name: 'image',
    source: '![pixel](data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=)',
    text: [],
    images: ['pixel'],
  },
  { name: 'task', source: '- [x] done\n- [ ] open', text: ['done', 'open'] },
  {
    name: 'html',
    source: 'H<sub>2</sub>O and <kbd>Ctrl</kbd>',
    text: ['Ctrl'],
  },
];
