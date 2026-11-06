/**
 * Targeted streaming cases (docs/rewrite/phase-2/testing-harness.md#targeted-cases).
 * Each is run at every two-chunk split position, plus the fixed and seeded
 * chunkers, by equivalence.test.ts.
 */
import type { ParseOptions } from '../../src/parse';
import type { ExpectedPath } from './harness';

export interface TargetedCase {
  name: string;
  /** One or more complete documents; each is streamed separately. */
  sources: string[];
  parse?: ParseOptions;
  /** Full re-parse triggers are expected (link ref defs, footnote definitions). */
  allowFullReparse?: boolean;
  /**
   * 'fence-fast-path': flushes inside an open top-level fence at column 0
   * must report the fast path. 'tail': the fast path must never be taken
   * (fence indented 4+, inside a list item or a quote). Self-tested in
   * equivalence.test.ts.
   */
  expectedPath?: ExpectedPath;
}

const fence = (marker: string, body: string, close = marker) =>
  `${marker}\n${body}\n${close}\n`;

export const targetedCases: TargetedCase[] = [
  {
    name: 'setext heading arriving late',
    sources: [
      'Title\n===\n',
      'Title\n---\n',
      'Title\n===\n\nnext\n',
      'Title\n\nmore text\n===\n',
      'Title\n===\n- item\n',
      'a\n-\n',
      'a\n- b\n',
      'a\n-\n- b\n',
      'Multi\nline title\n---\n',
    ],
  },
  {
    name: 'lists',
    sources: [
      '- a\n- b\n\n  continued\n- c\n',
      '- a\n\n\n- b\n',
      '1. one\n2. two\n   - nested\n     - deeper\n3. three\n',
      '- a\n  - b\n    - c\n  - d\n- e\n',
      '- item\n\nparagraph after the list\n',
      '- item\n  lazy\ncontinuation\n\nafter\n',
      '* a\n\n* b\n\n  c\n\nend\n',
      '1. a\n1. b\n\n10) c\n',
      '- a\n\n      indented code in item\n- b\n',
    ],
  },
  {
    name: 'tables row by row',
    sources: [
      '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n',
      '| a | b |\n| 1 | 2 |\n',
      '| a | b |\n|---|\n| 1 | 2 |\n',
      '| a | b |\n| :-: | --: |\n| 1 | 2 |\n\nafter\n',
      'a | b\n- | -\n1 | 2\n',
      '| a | b |\n| - | - |\n| 1 | 2 |\ntext right after\n',
    ],
  },
  {
    name: 'open fenced code',
    sources: [
      fence('```', 'let a = 1;\nlet b = 2;'),
      fence('~~~', 'let a = 1;'),
      fence('```js', 'x\n\ny'),
      fence('````', '```\ninner\n```', '````'),
      fence('```', 'a', '`````'),
      fence('~~~~', '~~~\nnot closing', '~~~~'),
      '```\nnever closed\nsecond line',
      '```ts title="x"\nnever closed',
      '   ```\n   indented fence\n   body\n   ```\n',
      '    ```\n    indent 4: code, not a fence\n',
      '```\nclosed\n``` trailing text\nstill code?\n```\nafter\n',
      '```\nclosed\n```\nparagraph in the same chunk as close\n',
      fence(
        '```',
        '  ``` not a close (4 spaces would be)\n    ```\nreal',
        '```'
      ),
    ],
  },
  {
    name: 'open top-level fences take the fast path',
    expectedPath: 'fence-fast-path',
    sources: [
      '```\nlet a = 1;\nlet b = 2;\nlet c = 3;',
      '~~~\nlet a = 1;\nmore\nand more\n',
      '```js\nx\n\ny\nz',
      '````\n```\ninner\n```\nstill open',
      '```\nnever closed\nsecond line\nthird line',
      '~~~~\n~~~\nnot closing\nbody',
    ],
  },
  {
    name: 'fences the fast path must not take',
    expectedPath: 'tail',
    sources: [
      '    ```\n    indent 4: code, not a fence\n    more code\n',
      '        ~~~\n        deeper indent\n        more\n',
      '- item\n\n  ```\n  code in a list\n  more\n  ```\n- next\n',
      '> ```\n> code in a quote\n> more\n> ```\n\nafter\n',
      '1. a\n   ~~~\n   open tilde in list\n',
      '> ```\n> open in quote\n> and more\n',
      '- a\n  ```\n  open in item\n  more\n',
    ],
  },
  {
    name: 'fence info string arriving late',
    sources: [
      '```javascript\ncode\n```\n',
      '~~~python extra words\nprint(1)\n~~~\n',
    ],
  },
  {
    name: 'link reference definition after use',
    allowFullReparse: true,
    sources: [
      '[foo]\n\ntext\n\n[foo]: /url "title"\n',
      'See [a][ref] and [ref].\n\nmore\n\n[ref]: https://example.com\n',
      '[x]: /1\n\n[x]\n\n[y]: /2\n\n[y] [x]\n',
      '[foo]\n\n[foo]: /url\n[bar]: /other\n\n[bar]\n',
    ],
  },
  {
    name: 'footnotes',
    allowFullReparse: true,
    sources: [
      'Text[^1] more[^2].\n\n[^1]: First.\n[^2]: Second.\n',
      'Text[^b] and[^a].\n\n[^a]: A.\n\n[^b]: B.\n',
      '[^1]: Defined first.\n\nThen a reference[^1].\n',
      'Ref[^n].\n\n[^n]: Para one.\n\n    Para two of the note.\n\nafter\n',
      'No definition[^missing].\n\ntext\n',
    ],
  },
  {
    name: 'duplicate headings',
    sources: [
      '# Intro\n\ntext\n\n# Intro\n\ntext\n\n# Intro\n',
      '## Setup\n\n## Setup\n\n### Setup\n\n## Setup 1\n\n## Setup\n',
      'Intro\n===\n\nIntro\n---\n\n# Intro\n',
    ],
  },
  {
    name: 'raw html split across chunks',
    sources: [
      'before <b>bold</b> and <i>it</i> <br/> after\n',
      '<div>\nblock html\n</div>\n\nafter\n',
      'inline <span class="x" data-y="z">text</span> and <a href="https://e.com">link</a>\n',
      '<!-- comment\nspanning lines -->\n\ntext\n',
      '<script>alert(1)</script>\n\ntext <img src="x" onerror="y">\n',
      'unclosed <b>bold\n\nnext paragraph\n',
    ],
  },
  {
    name: 'task lists and autolinks',
    sources: [
      '- [ ] todo\n- [x] done\n- [X] also done\n- [] not a task\n',
      '1. [ ] one\n2. [x] two\n',
      'Visit https://example.com/some/path?x=1&y=2 now, or www.example.org.\n',
      'Mail me@example.com or <https://angle.example/p> or http://a.b/c_(d).\n',
      'Trailing https://example.com/path). And https://example.com/a*b*\n',
      '~~strike~~ and ~single~ and **bold _nested_ text**\n',
    ],
  },
  {
    name: 'mixed blocks',
    sources: [
      '# H\n\n> quote\n> more\n\n---\n\n```\ncode\n```\n\npara\n\n1. a\n2. b\n',
      'a\n\n\n\nb\n',
      '    indented code\n\n    more\n\ntext\n',
      '> a\nlazy\n\n> b\n',
      '***\n___\n- - -\n',
      '\n\n\n',
      'trailing spaces  \nhard break\\\nbackslash break\n',
    ],
  },
  {
    name: 'line endings and unicode',
    sources: [
      'a\r\n\r\nb\r\n',
      'line one\r\nline two\r\n===\r\n',
      '```\r\ncode\r\n```\r\n',
      'a\rb\r\rc\r',
      'emoji \u{1F600} and \u{1F468}‍\u{1F469}‍\u{1F467} text\n',
      '# \u{1F600} heading\n\n- \u{1F680} item\n',
      '\u{1F600}'.repeat(5),
      'tab\tseparated\n\n\tcode with tab\n',
    ],
  },
];
