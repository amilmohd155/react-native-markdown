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
