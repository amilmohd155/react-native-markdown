/**
 * The highlight plugin's rendered output per built-in language (P3-29,
 * P3-33): every character's colour comes from `theme.tokens.syntax` for the
 * token the language's tokenizer gives it, in every theme mode and with a
 * partial user override; and the rendered text is the code exactly.
 */
import { StyleSheet, useColorScheme, type ColorValue } from 'react-native';
import {
  renderTree,
  textOf,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import { Markdown } from '../../api/Markdown';
import { createRenderCtx } from '../../render/context';
import { RenderCtxContext } from '../../render/contexts';
import { defaultComponents } from '../../render/defaults';
import { darkTheme, getDefaultTheme, lightTheme } from '../../theme';
import type { ThemeProp } from '../../theme/cache';
import { highlight, type SyntaxTokenType, type Tokenizer } from '../index';
import { bashTokenizer } from '../tokenizers/bash';
import { diffTokenizer } from '../tokenizers/diff';
import { javascriptTokenizer } from '../tokenizers/javascript';
import { jsonTokenizer } from '../tokenizers/json';
import { pythonTokenizer } from '../tokenizers/python';

// React Native's jest setup replaces `useColorScheme` with a `jest.fn`.
const schemeMock = useColorScheme as unknown as jest.Mock;

const plugins = [highlight()];

type Syntax = { readonly [T in SyntaxTokenType]: string };

type Language = {
  readonly tag: string;
  /** The built-in tokenizer as the registry binds it for `tag`. */
  readonly tokenize: Tokenizer;
  /** Types the snippets must contain (and so must colour). */
  readonly required: readonly SyntaxTokenType[];
  /** Each ends in `\n`, as the fence body does. */
  readonly snippets: readonly string[];
};

const ts: Tokenizer = (code) => javascriptTokenizer(code, 'typescript');
const js: Tokenizer = (code) => javascriptTokenizer(code, 'javascript');

const LANGUAGES: readonly Language[] = [
  {
    tag: 'ts',
    tokenize: ts,
    required: ['keyword', 'string', 'comment', 'type', 'number'],
    snippets: [
      [
        '// A typed helper.',
        'export function sum(xs: readonly number[]): number {',
        '  /* a block comment',
        '     across a chunk join */',
        '  const label = `total:',
        '${xs.length}`;',
        "  const unit = 'items';",
        '  return xs.reduce((a, b) => a + b, 0);',
        '}',
        'interface P { name: string; tags?: string[] }',
        '',
      ].join('\n'),
    ],
  },
  {
    tag: 'tsx',
    tokenize: ts,
    required: ['keyword', 'string', 'comment'],
    snippets: [
      [
        "import { View } from 'react-native';",
        '// Renders a row.',
        'export const Row = ({ title }: { title: string }) => (',
        '  <View accessibilityLabel="row">{title}</View>',
        ');',
        '',
      ].join('\n'),
    ],
  },
  {
    tag: 'js',
    tokenize: js,
    required: ['keyword', 'string', 'comment', 'function'],
    snippets: [
      [
        '/**',
        ' * A doc comment over',
        ' * several lines.',
        ' */',
        'async function load(url) {',
        "  const res = await fetch(url, { method: 'GET' });",
        '  if (!res.ok) throw new Error("failed: " + res.status);',
        '  return res.json(); // parse',
        '}',
        '',
      ].join('\n'),
    ],
  },
  {
    tag: 'json',
    tokenize: (code) => jsonTokenizer(code, 'json'),
    required: ['property', 'string', 'comment', 'constant', 'number'],
    snippets: [
      [
        '{',
        '  "name": "demo",',
        '  "version": 2,',
        '  "private": true,',
        '  "deps": { "a": "^1.0.0" }, // a jsonc comment',
        '  "list": [1, null, "x"]',
        '}',
        '',
      ].join('\n'),
    ],
  },
  {
    tag: 'bash',
    tokenize: (code) => bashTokenizer(code, 'bash'),
    required: ['keyword', 'string', 'comment'],
    snippets: [
      [
        '#!/usr/bin/env bash',
        '# install the dependencies',
        'set -euo pipefail',
        'if [ -f "package.json" ]; then',
        "  echo 'found' && npm install",
        'fi',
        'for f in *.ts; do echo "$f"; done',
        '',
      ].join('\n'),
    ],
  },
  {
    tag: 'diff',
    tokenize: (code) => diffTokenizer(code, 'diff'),
    required: ['inserted', 'deleted', 'comment', 'function'],
    snippets: [
      [
        'diff --git a/x.ts b/x.ts',
        '--- a/x.ts',
        '+++ b/x.ts',
        '@@ -1,3 +1,3 @@ function f()',
        ' const a = 1;',
        '-const b = 2;',
        '+const b = 3;',
        '',
      ].join('\n'),
    ],
  },
  {
    tag: 'python',
    tokenize: (code) => pythonTokenizer(code, 'python'),
    required: ['keyword', 'string', 'comment'],
    snippets: [
      [
        '# compute things',
        'def greet(name: str) -> str:',
        '    """A docstring',
        '    over lines."""',
        '    if name is None:',
        "        return 'nobody'",
        '    return f"hi {name}"  # trailing',
        '',
      ].join('\n'),
    ],
  },
];

const fence = (tag: string, code: string) =>
  '```' + tag + '\n' + code + '```\n';

const colorOf = (node: TestInstance): ColorValue | undefined =>
  StyleSheet.flatten(node.props.style)?.color;

/** The code block roots (the View above the horizontal ScrollView). */
const codeRoots = (tree: Tree): TestInstance[] =>
  tree.findAll((n) => n.props.horizontal === true).map((n) => n.parent!);

/** The chunk Texts of the only highlighted block. */
const chunkNodes = (tree: Tree): TestInstance[] =>
  tree.find(
    (n) => n.type === 'View' && n.props.accessibilityElementsHidden === true
  ).children as TestInstance[];

/** The rendered code: chunk Texts joined by the newline each one drops. */
const renderedCode = (tree: Tree) => chunkNodes(tree).map(textOf).join('\n');

/** Each rendered character with its colour (the chunk colour if unset). */
function renderedColours(tree: Tree): { ch: string; color: unknown }[] {
  const out: { ch: string; color: unknown }[] = [];
  chunkNodes(tree).forEach((chunk, i) => {
    if (i > 0) out.push({ ch: '\n', color: undefined });
    const base = colorOf(chunk);
    for (const child of chunk.children) {
      const color = typeof child === 'string' ? base : colorOf(child);
      for (const ch of textOf(child)) out.push({ ch, color });
    }
  });
  return out;
}

/**
 * Checks every non-whitespace character's colour against the token type
 * the tokenizer gives it, resolved through `syntax`; a type drawn in the
 * block colour is inherited. Returns the mismatches.
 */
function colourMismatches(
  tree: Tree,
  code: string,
  tokenize: Tokenizer,
  syntax: Syntax
) {
  const expected: { ch: string; type: SyntaxTokenType }[] = [];
  for (const token of tokenize(code, '')) {
    for (const ch of token.text) expected.push({ ch, type: token.type });
  }
  const rendered = renderedColours(tree);
  expect(rendered.map((r) => r.ch).join('')).toBe(code);
  const mismatches: string[] = [];
  rendered.forEach((r, i) => {
    if (r.ch.trim() === '') return;
    const { type } = expected[i]!;
    if (r.color !== syntax[type]) {
      mismatches.push(
        `${i} ${JSON.stringify(r.ch)} ${type}: ${String(r.color)} != ${syntax[type]}`
      );
    }
  });
  return mismatches;
}

/** The body as the parser hands it over: the fence's last newline dropped. */
const bodyOf = (snippet: string) => snippet.replace(/\n$/, '');

afterEach(() => {
  schemeMock.mockReset();
});

const CASES = LANGUAGES.flatMap((lang) =>
  lang.snippets.map(
    (snippet, i) => [`${lang.tag} #${i}`, lang, snippet] as const
  )
);

describe('the snippets', () => {
  it.each(CASES)('%s contain every required token type', (_, lang, snippet) => {
    const types = new Set(
      lang.tokenize(bodyOf(snippet), '').map((t) => t.type)
    );
    expect(lang.required.filter((t) => !types.has(t))).toEqual([]);
  });

  it('cover every built-in language', () => {
    expect(LANGUAGES.map((l) => l.tag)).toEqual([
      'ts',
      'tsx',
      'js',
      'json',
      'bash',
      'diff',
      'python',
    ]);
  });
});

describe.each<[string, ThemeProp, 'light' | 'dark' | null, Syntax]>([
  ['light', 'light', null, lightTheme.syntax],
  ['dark', 'dark', null, darkTheme.syntax],
  ['auto (light scheme)', 'auto', 'light', lightTheme.syntax],
  ['auto (dark scheme)', 'auto', 'dark', darkTheme.syntax],
  [
    'a partial override (light scheme)',
    { syntax: { keyword: '#123456' } },
    'light',
    { ...lightTheme.syntax, keyword: '#123456' },
  ],
  [
    'a partial override (dark scheme)',
    { syntax: { keyword: '#123456' } },
    'dark',
    { ...darkTheme.syntax, keyword: '#123456' },
  ],
])('colours with theme %s', (_, theme, scheme, syntax) => {
  beforeEach(() => {
    if (scheme !== null) schemeMock.mockReturnValue(scheme);
  });

  it.each(CASES)(
    '%s: every token from tokens.syntax',
    async (_n, lang, snippet) => {
      const tree = await renderTree(
        <Markdown
          source={fence(lang.tag, snippet)}
          plugins={plugins}
          theme={theme}
        />
      );
      const code = bodyOf(snippet);
      expect(colourMismatches(tree, code, lang.tokenize, syntax)).toEqual([]);
      // The required types are drawn in their own colour (not inherited).
      const colours = new Set(renderedColours(tree).map((r) => r.color));
      for (const type of lang.required) {
        expect([type, colours.has(syntax[type])]).toEqual([type, true]);
      }
    }
  );
});

describe('the override', () => {
  it('wins for keyword only; operators keep the default that keyword had', async () => {
    schemeMock.mockReturnValue('light');
    // In the light palette keyword and operator share a colour.
    expect(lightTheme.syntax.operator).toBe(lightTheme.syntax.keyword);
    const code = 'const a = b + 1;\n';
    const tree = await renderTree(
      <Markdown
        source={fence('ts', code)}
        plugins={plugins}
        theme={{ syntax: { keyword: '#123456' } }}
      />
    );
    const rendered = renderedColours(tree);
    const at = (text: string) => rendered[code.indexOf(text)]!.color;
    expect(at('const')).toBe('#123456');
    expect(at('=')).toBe(lightTheme.syntax.operator);
    expect(at('+')).toBe(lightTheme.syntax.operator);
    expect(at('1')).toBe(lightTheme.syntax.number);
  });
});

describe('text content is the code exactly', () => {
  const plainText = async (source: string) => {
    const tree = await renderTree(<Markdown source={source} />);
    const [root] = codeRoots(tree);
    return textOf(root!);
  };

  const check = async (source: string, expected: string) => {
    const tree = await renderTree(
      <Markdown source={source} plugins={plugins} />
    );
    const roots = codeRoots(tree);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.props.accessibilityLabel).toBe(expected);
    expect(renderedCode(tree)).toBe(expected);
    expect(renderedCode(tree)).toBe(await plainText(source));
  };

  it.each(CASES)('%s', async (_, lang, snippet) => {
    await check(fence(lang.tag, snippet), bodyOf(snippet));
  });

  it.each(CASES)('%s with CRLF line endings', async (_, lang, snippet) => {
    const source = fence(lang.tag, snippet).replace(/\n/g, '\r\n');
    // The parser normalises line endings: the code is the LF text.
    await check(source, bodyOf(snippet));
  });

  it.each(LANGUAGES.map((l) => [l.tag]))(
    '%s: CRLF code handed to the CodeBlock directly',
    async (tag) => {
      const lang = LANGUAGES.find((l) => l.tag === tag)!;
      const code = bodyOf(lang.snippets[0]!).replace(/\n/g, '\r\n');
      const C = plugins[0]!.components!.CodeBlock!;
      const style = getDefaultTheme().elements.CodeBlock;
      const ctx = createRenderCtx({ components: defaultComponents });
      const tree = await renderTree(
        <RenderCtxContext.Provider value={ctx}>
          <C
            code={code}
            language={tag}
            meta={null}
            open={false}
            style={style}
          />
        </RenderCtxContext.Provider>
      );
      expect(renderedCode(tree)).toBe(code);
      expect(codeRoots(tree)[0]!.props.accessibilityLabel).toBe(code);
    }
  );

  it('a fence with no trailing newline: unclosed at the end', async () => {
    await check('```ts\nconst a = 1;\nlet b', 'const a = 1;\nlet b');
  });

  it('a fence with no trailing newline: closer at the end', async () => {
    await check('```ts\nconst a = 1;\nlet b\n```', 'const a = 1;\nlet b');
  });

  it.each(['```ts\n```\n', '```ts\n```', '```ts\n'])(
    'an empty fence (%j) is one empty Text',
    async (source) => {
      const tree = await renderTree(
        <Markdown source={source} plugins={plugins} />
      );
      const chunks = chunkNodes(tree);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.type).toBe('Text');
      expect(textOf(chunks[0]!)).toBe('');
      expect(codeRoots(tree)[0]!.props.accessibilityLabel).toBe('');
    }
  );

  it('odd and even line counts, blank lines and a lone newline', async () => {
    for (const code of [
      'a\n',
      'a\nb\n',
      'a\nb\nc\n',
      '\n',
      '\n\n\n',
      'x\n\ny\n\n',
    ]) {
      await check(fence('ts', code), bodyOf(code));
    }
  });
});
