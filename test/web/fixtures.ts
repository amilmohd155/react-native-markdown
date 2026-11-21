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
