/**
 * The highlight plugin's CodeBlock (P3-29 to P3-31): colours from the theme,
 * plain fallbacks, the single accessible element, and memoised chunks while
 * streaming.
 */
import { useEffect } from 'react';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import {
  find,
  findAll,
  type Match,
  renderTree,
  textOf,
  type JsonElement,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import { Markdown } from '../../api/Markdown';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../../api/useMarkdownStream';
import { definePlugin, type MarkdownPlugin } from '../../plugins/definePlugin';
import { codeLineCount, codeLines } from '../../render/codeLines';
import { createRenderCtx, type RenderCtxInput } from '../../render/context';
import { RenderCtxContext } from '../../render/contexts';
import { defaultComponents } from '../../render/defaults';
import { darkTheme, getDefaultTheme, lightTheme } from '../../theme';
import type { Chunk } from '../chunking';
import {
  createHighlightedCodeBlock,
  SINGLE_TEXT_MAX_LENGTH,
} from '../HighlightedCodeBlock';
import { DEFAULT_MAX_LENGTH, highlight, type Tokenizer } from '../index';

// Records every `runsOf` call: one per chunk Text render. `lineRunsOf`
// calls: one per chunk render in the numbered wrap layout (P3-35).
const mockRunsCalls: Chunk[] = [];
const mockLineRunsCalls: Chunk[] = [];
jest.mock('../chunking', () => {
  const actual = jest.requireActual('../chunking');
  return {
    ...actual,
    runsOf: (chunk: Chunk, colorOf?: unknown) => {
      mockRunsCalls.push(chunk);
      return actual.runsOf(chunk, colorOf);
    },
    lineRunsOf: (chunk: Chunk, colorOf?: unknown) => {
      mockLineRunsCalls.push(chunk);
      return actual.lineRunsOf(chunk, colorOf);
    },
  };
});

const plugin = highlight();
const plugins = [plugin];
/** Chunked at every size, as a closed block over the single-Text limit. */
const chunkedPlugin = definePlugin({
  name: 'highlight',
  components: {
    CodeBlock: createHighlightedCodeBlock({
      maxLength: DEFAULT_MAX_LENGTH,
      singleTextMaxLength: -1,
    }),
  },
});

const TS = [
  'const answer = 42;',
  'function greet(name: string) {',
  '  // say hi',
  "  return 'hi ' + name;",
  '}',
  '',
].join('\n');
const fence = (lang: string, code: string) =>
  '```' + lang + '\n' + code + '```\n';

const colorOf = (node: TestInstance): unknown =>
  StyleSheet.flatten(node.props.style)?.color;

/** The code block's root View (the default and highlighted alike). */
const codeRoot = (tree: Tree): TestInstance => {
  const scroll = tree.find((n) => n.props.horizontal === true);
  return scroll.parent!;
};

/** The chunk Texts of the (only) highlighted block. */
const chunkNodes = (tree: Tree): TestInstance[] =>
  tree.find(
    (n) => n.type === 'View' && n.props.accessibilityElementsHidden === true
  ).children as TestInstance[];
const chunkTexts = (tree: Tree) => chunkNodes(tree).map(textOf);

/** Text hosts whose own text is exactly `text`. */
const spans = (tree: Tree, text: string) =>
  tree.findAll((n) => n.type === 'Text' && textOf(n) === text);

let warn: jest.SpyInstance;
beforeEach(() => {
  mockRunsCalls.length = 0;
  mockLineRunsCalls.length = 0;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('highlight()', () => {
  it('adds no syntax, only a stable CodeBlock component', () => {
    expect(plugin.name).toBe('highlight');
    expect(plugin.syntax).toBeUndefined();
    expect(plugin.nodes).toBeUndefined();
    expect(Object.keys(plugin.components ?? {})).toEqual(['CodeBlock']);
    expect(DEFAULT_MAX_LENGTH).toBe(50_000);
  });
});

describe('colours', () => {
  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('come from the %s theme', async (mode, tokens) => {
    const tree = await renderTree(
      <Markdown source={fence('ts', TS)} plugins={plugins} theme={mode} />
    );
    const keyword = tree.findAll(
      (n) => n.type === 'Text' && textOf(n).startsWith('const')
    );
    expect(keyword.map(colorOf)).toContain(tokens.syntax.keyword);
    expect(spans(tree, '42').map(colorOf)).toEqual([tokens.syntax.number]);
    const comment = tree.findAll(
      (n) => n.type === 'Text' && textOf(n).trim() === '// say hi'
    );
    expect(comment.map(colorOf)).toEqual([tokens.syntax.comment]);
    // `plain` (the block colour) is inherited: no span of that colour.
    const colored = tree.findAll(
      (n) => n.type === 'Text' && colorOf(n) === tokens.syntax.plain
    );
    expect(colored.every((n) => n.props.selectable !== undefined)).toBe(true);
    expect(chunkTexts(tree).join('\n')).toBe(TS.slice(0, -1));
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders a small closed block as one Text of the code', async () => {
    const tree = await renderTree(
      <Markdown
        source={fence('ts', TS)}
        plugins={plugins}
        selectable
        maxFontSizeMultiplier={1.5}
      />
    );
    const texts = chunkNodes(tree);
    expect(texts).toHaveLength(1);
    const [only] = texts;
    expect(only!.type).toBe('Text');
    expect(textOf(only!)).toBe(TS.slice(0, -1));
    expect(only!.props.style).toBe(getDefaultTheme().elements.CodeBlock.text);
    expect(only!.props.selectable).toBe(true);
    expect(only!.props.maxFontSizeMultiplier).toBe(1.5);
    // Spans only, no nested Text with its own selection.
    for (const child of only!.children) {
      if (typeof child === 'string') continue;
      expect(child.props.selectable).toBeUndefined();
      expect(child.children.every((c) => typeof c === 'string')).toBe(true);
    }
  });

  it('merges same-colour runs across chunk boundaries', async () => {
    // Two plain lines, then two more: one string child, not two.
    const code = 'a b\nc d\ne f\ng h';
    const style = getDefaultTheme().elements.CodeBlock;
    const ctx = createRenderCtx({ components: defaultComponents });
    const C = plugin.components!.CodeBlock!;
    const tree = await renderTree(
      <RenderCtxContext.Provider value={ctx}>
        <C language="ts" meta={null} open={false} style={style} code={code} />
      </RenderCtxContext.Provider>
    );
    expect(chunkNodes(tree)[0]!.children).toEqual([code]);
  });

  it('renders one Text per 2 lines with the default text props', async () => {
    const tree = await renderTree(
      <Markdown
        source={fence('ts', TS)}
        plugins={[chunkedPlugin]}
        selectable
        maxFontSizeMultiplier={1.5}
      />
    );
    const texts = chunkNodes(tree);
    // 5 lines (the fence's last newline is not code): 3 chunks.
    expect(texts.map(textOf)).toEqual([
      'const answer = 42;\nfunction greet(name: string) {',
      "  // say hi\n  return 'hi ' + name;",
      '}',
    ]);
    const style = getDefaultTheme().elements.CodeBlock.text;
    for (const t of texts) {
      expect(t.type).toBe('Text');
      expect(t.props.style).toBe(style);
      expect(t.props.selectable).toBe(true);
      expect(t.props.maxFontSizeMultiplier).toBe(1.5);
    }
  });
});

describe('blank lines at chunk seams', () => {
  // Android draws an empty last line at font-metrics height, not
  // `lineHeight`, and scales it non-linearly. The chunker never ends a
  // non-final chunk in a blank line, so native chunks need no height fix.
  const style = getDefaultTheme().elements.CodeBlock;
  const ctx = createRenderCtx({ components: defaultComponents });
  const block = (
    code: string,
    open = false,
    p: MarkdownPlugin = chunkedPlugin
  ): React.JSX.Element => {
    const C = p.components!.CodeBlock!;
    return (
      <RenderCtxContext.Provider value={ctx}>
        <C language="ts" meta={null} open={open} style={style} code={code} />
      </RenderCtxContext.Provider>
    );
  };
  /** Every chunk Text has the bare text style: no minHeight or other fix. */
  const expectBareStyles = (tree: Tree) => {
    for (const n of chunkNodes(tree)) expect(n.props.style).toBe(style.text);
  };
  const window = Dimensions.get('window');
  afterEach(async () => {
    if (Dimensions.get('window').fontScale === window.fontScale) return;
    await act(async () => Dimensions.set({ window }));
  });

  it.each([
    [
      'a blank line after a chunk',
      'a;\nb;\n}\n\nx;\ny;',
      ['a;\nb;', '}\n\nx;', 'y;'],
    ],
    ['a run of blank lines', 'a;\nb;\n\n\nc;\nd;', ['a;\nb;', '\n\nc;', 'd;']],
    ['whitespace-only lines', 'a;\n  \n\t\nb;\nc;', ['a;\n  \n\t\nb;', 'c;']],
    ['a blank first line', '\nx;\ny;\nz;', ['\nx;', 'y;\nz;']],
    [
      'CRLF',
      'a;\r\nb;\r\n}\r\n\r\nx;\r\ny;',
      ['a;\r\nb;\r', '}\r\n\r\nx;\r', 'y;'],
    ],
    ['blank lines at the end', 'a;\nb;\n}\n\n', ['a;\nb;', '}\n\n']],
  ])('%s: no chunk but the last ends blank', async (_, code, texts) => {
    const tree = await renderTree(block(code));
    expect(chunkTexts(tree)).toEqual(texts);
    expectBareStyles(tree);
  });

  it('streams the same way: a blank line waits for the next line', async () => {
    const open = await renderTree(block('a;\nb;\n}\n\n', true));
    expect(chunkTexts(open)).toEqual(['a;\nb;', '}\n\n']);
    expectBareStyles(open);
    const more = await renderTree(block('a;\nb;\n}\n\nx', true));
    expect(chunkTexts(more)).toEqual(['a;\nb;', '}\n\nx']);
  });

  it('ignores the font scale', async () => {
    Dimensions.set({ window: { ...window, fontScale: 3 } });
    const tree = await renderTree(block('}\n\nx;\ny;\nz;'));
    expect(chunkTexts(tree)).toEqual(['}\n\nx;', 'y;\nz;']);
    expectBareStyles(tree);
  });

  it.each([
    ['blank lines', 'a;\nb;\n}\n\nx;\n\n\ny;\n'],
    ['CRLF', 'a;\r\nb;\r\n}\r\n\r\nx;\r\n'],
  ])('a single Text keeps %s exactly', async (_, code) => {
    const tree = await renderTree(block(code, false, plugin));
    expect(chunkTexts(tree)).toEqual([code]);
    expectBareStyles(tree);
  });

  describe('on web', () => {
    // `pre-wrap` draws no line for a trailing `\n`: chunks keep their text
    // whole, so selection joins to the code.
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web');
    });

    it.each([
      ['a blank line after a chunk', 'a;\nb;\n}\n\nx;\ny;'],
      ['a run of blank lines', 'a;\nb;\n\n\nc;'],
      ['a blank final chunk', 'a;\nb;\n}\n\n'],
      ['CRLF', 'a;\r\nb;\r\n}\r\n\r\nx;'],
    ])('keeps %s, joining to the code', async (_, code) => {
      const tree = await renderTree(block(code));
      expect(chunkTexts(tree).join('')).toBe(code);
      expectBareStyles(tree);
    });

    it('keeps chunks whole while streaming', async () => {
      const tree = await renderTree(block('a;\nb;\n}\n\nx', true));
      expect(chunkTexts(tree)).toEqual(['a;\nb;\n', '}\n\nx']);
    });
  });
});

describe('accessibility', () => {
  it('is one accessible element labelled with the code', async () => {
    const tree = await renderTree(
      <Markdown source={fence('ts', TS)} plugins={plugins} />
    );
    const root = codeRoot(tree);
    expect(root.props.accessible).toBe(true);
    expect(root.props.accessibilityLabel).toBe(TS.slice(0, -1));
    expect(tree.findAll((n) => n.props.accessible === true)).toEqual([root]);
    const hidden = findAll(
      root,
      (n) =>
        n.props.importantForAccessibility === 'no-hide-descendants' &&
        n.props.accessibilityElementsHidden === true
    );
    expect(hidden).toHaveLength(1);
  });

  it('keeps the header (P3-35) outside the labelled body', async () => {
    const onCopyPress = jest.fn();
    const view = await render(
      <Markdown
        source={fence('ts', TS)}
        plugins={plugins}
        codeBlock={{ header: true }}
        onCopyPress={onCopyPress}
      />
    );
    const tree = {
      find: (match: Match) => find(view.container, match),
      findAll: (match: Match) => findAll(view.container, match),
    } as Tree;
    const body = codeRoot(tree);
    expect(body.props.accessibilityLabel).toBe(TS.slice(0, -1));
    const copy = tree.find(
      (n) => n.type === 'View' && n.props.accessibilityLabel === 'Copy code'
    );
    const wrap = tree.find(
      (n) => n.type === 'View' && n.props.accessibilityLabel === 'Wrap lines'
    );
    // Wrap and Copy (Pressables) are their own elements, beside the body.
    expect(tree.findAll((n) => n.props.accessible === true)).toEqual([
      wrap,
      copy,
      body,
    ]);
    const label = tree.find((n) => n.type === 'Text' && textOf(n) === 'ts');
    for (const part of [wrap, copy, label]) {
      expect(findAll(body, (n) => n === part)).toEqual([]);
    }
    // The header and the body share the outer View.
    expect(findAll(body.parent!, (n) => n === copy)).toEqual([copy]);
    await fireEvent.press(copy);
    expect(onCopyPress).toHaveBeenCalledWith({
      code: TS.slice(0, -1),
      language: 'ts',
      meta: null,
    });
  });

  it('gives the plain fallback the same header', async () => {
    const source = fence('cobol', 'MOVE A TO B.\n');
    const props = { source, codeBlock: { header: true } } as const;
    const tree = await renderTree(<Markdown {...props} plugins={plugins} />);
    const plain = await renderTree(<Markdown {...props} />);
    // Each Wrap button has its own handlers: compare as serialised.
    expect(JSON.stringify(tree.toJSON())).toBe(JSON.stringify(plain.toJSON()));
    expect(tree.findAll((n) => textOf(n) === 'cobol').length).toBeGreaterThan(
      0
    );
    // Over maxLength too.
    const ts = { source: fence('ts', TS), codeBlock: { header: true } };
    const long = await renderTree(
      <Markdown {...ts} plugins={[highlight({ maxLength: 10 })]} />
    );
    expect(JSON.stringify(long.toJSON())).toBe(
      JSON.stringify((await renderTree(<Markdown {...ts} />)).toJSON())
    );
  });
});

describe('plain fallback', () => {
  const plainJson = async (source: string) =>
    (await renderTree(<Markdown source={source} />)).toJSON();

  it.each([
    ['an unknown tag', fence('cobol', 'MOVE A TO B.\n')],
    ['no tag', fence('', 'const a = 1;\n')],
    ['an indented block', '    const a = 1;\n'],
  ])('renders %s like the default CodeBlock', async (_, source) => {
    const tree = await renderTree(
      <Markdown source={source} plugins={plugins} />
    );
    expect(tree.toJSON()).toEqual(await plainJson(source));
  });

  it('renders a block over maxLength like the default', async () => {
    const source = fence('ts', TS);
    const short = highlight({ maxLength: 10 });
    const tree = await renderTree(
      <Markdown source={source} plugins={[short]} />
    );
    expect(tree.toJSON()).toEqual(await plainJson(source));
  });

  it('stays plain once a block went over maxLength', async () => {
    const { CodeBlock } = highlight({ maxLength: 10 }).components!;
    const C = CodeBlock!;
    const style = getDefaultTheme().elements.CodeBlock;
    const props = { language: 'ts', meta: null, open: true, style };
    const ctx = createRenderCtx({ components: defaultComponents });
    const at = (code: string) => (
      <RenderCtxContext.Provider value={ctx}>
        <C {...props} code={code} />
      </RenderCtxContext.Provider>
    );
    const accessible = (tree: Tree) =>
      tree.findAll((n) => n.props.accessible === true).length;
    const tree = await renderTree(at('let a = 1;'));
    expect(accessible(tree)).toBe(1);
    await tree.rerender(at('let a = 1; let b'));
    expect(accessible(tree)).toBe(0);
    await tree.rerender(at('let a'));
    expect(accessible(tree)).toBe(0);
  });
});

describe('options', () => {
  const marker: Tokenizer = (code) =>
    code ? [{ type: 'deleted', text: code }] : [];

  it('`languages` overrides a built-in, case-insensitively', async () => {
    const languages = { TS: jest.fn(marker) };
    const tree = await renderTree(
      <Markdown
        source={fence('ts', 'let a = 1;\n')}
        plugins={[highlight({ languages })]}
      />
    );
    expect(languages.TS).toHaveBeenCalledWith('let a = 1;', 'ts');
    expect(spans(tree, 'let a = 1;').map(colorOf)).toContain(
      lightTheme.syntax.deleted
    );
  });

  it('`tokenize` handles other tags and gets the normalised tag', async () => {
    const tokenize = jest.fn(marker);
    const tree = await renderTree(
      <Markdown
        source={fence(' Foo ', 'x\n') + '\n' + fence('ts', 'let a;\n')}
        plugins={[highlight({ tokenize })]}
      />
    );
    expect(tokenize.mock.calls).toEqual([['x', 'foo']]);
    expect(spans(tree, 'x').map(colorOf)).toContain(lightTheme.syntax.deleted);
    expect(spans(tree, 'let').map(colorOf)).toContain(
      lightTheme.syntax.keyword
    );
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error('boom');
      },
    ],
    [
      'drops text',
      ((code) => [{ type: 'keyword', text: code.slice(1) }]) as Tokenizer,
    ],
  ])('a tokenizer that %s renders plain and warns once', async (_, bad) => {
    const p = [highlight({ languages: { ts: bad } })];
    const tree = await renderTree(
      <Markdown source={fence('ts', TS)} plugins={p} />
    );
    expect(chunkTexts(tree).join('\n')).toBe(TS.slice(0, -1));
    // No coloured span: every chunk is one plain string.
    for (const chunk of chunkNodes(tree)) {
      expect(chunk.children.every((c) => typeof c === 'string')).toBe(true);
    }
    await tree.rerender(
      <Markdown source={fence('ts', TS + 'more\n')} plugins={p} />
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(
      /^\[react-native-markdown\] highlight: .*"ts"/
    );
  });
});

// --- Streaming ---------------------------------------------------------------

const probe = {} as { current: UseMarkdownStreamResult };
function Streamed({ p }: { readonly p: readonly MarkdownPlugin[] }) {
  const stream = useMarkdownStream({ plugins: p });
  useEffect(() => {
    probe.current = stream;
  });
  return <Markdown document={stream.document} plugins={p} />;
}
const run = async (f: (s: UseMarkdownStreamResult) => void) => {
  await act(async () => f(probe.current));
  await act(async () => {
    jest.advanceTimersByTime(50);
  });
};

describe('streaming', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'web');
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const LONG = Array.from(
    { length: 24 },
    (_, i) => `const v${i} = f(${i}, 'item ${i}'); // note ${i}`
  ).join('\n');
  const SOURCE = 'Intro.\n\n' + fence('ts', LONG + '\n');

  /** Appends SOURCE in 40-character flushes. */
  const streamIn = async () => {
    for (let at = 0; at < SOURCE.length; at += 40) {
      await run((s) => s.append(SOURCE.slice(at, at + 40)));
    }
  };

  it('renders each frozen chunk once', async () => {
    await renderTree(<Streamed p={plugins} />);
    await streamIn();
    await run((s) => s.done());
    const frozen = mockRunsCalls.filter((c) => c.frozen);
    const byObject = new Map<Chunk, number>();
    for (const c of frozen) byObject.set(c, (byObject.get(c) ?? 0) + 1);
    // 24 lines: 12 chunks; each freezes once and then never renders again.
    expect(new Set(frozen.map((c) => c.id)).size).toBeGreaterThanOrEqual(11);
    expect([...byObject.values()].every((n) => n === 1)).toBe(true);
    expect(byObject.size).toBe(new Set(frozen.map((c) => c.id)).size);
    // Far fewer chunk renders than flushes x chunks.
    expect(mockRunsCalls.length).toBeLessThan(SOURCE.length / 40 + 2 * 12);
  });

  it('ends equal to a static render of the same code', async () => {
    const tree = await renderTree(<Streamed p={plugins} />);
    await streamIn();
    await run((s) => s.done());
    const streamed = codeRoot(tree).toJSON() as JsonElement;
    const still = await renderTree(
      <Markdown source={SOURCE} plugins={plugins} />
    );
    expect(streamed).toEqual(codeRoot(still).toJSON());
  });

  it('keeps the wrapper mounted when the fence closes', async () => {
    const tree = await renderTree(<Streamed p={plugins} />);
    await run((s) => s.append('```ts\nlet a = 1;\nlet b'));
    const before = codeRoot(tree);
    await run((s) => s.append(' = 2;\n```\n'));
    await run((s) => s.done());
    expect(codeRoot(tree)).toBe(before);
    expect(chunkTexts(tree)).toEqual(['let a = 1;\nlet b = 2;']);
  });
});

describe('reconcile at close (P3-30)', () => {
  const style = getDefaultTheme().elements.CodeBlock;
  const ctx = createRenderCtx({ components: defaultComponents });
  const block = (p: MarkdownPlugin, code: string, open: boolean) => {
    const C = p.components!.CodeBlock!;
    return (
      <RenderCtxContext.Provider value={ctx}>
        <C language="ts" meta={null} open={open} style={style} code={code} />
      </RenderCtxContext.Provider>
    );
  };

  /**
   * Streams `code` line by line with `open`, then closes it. Chunked when
   * closed too, as a block over the single-Text limit.
   */
  const streamLines = async (
    code: string,
    p: MarkdownPlugin = chunkedPlugin
  ) => {
    const lines = code.split(/(?<=\n)/);
    const tree = await renderTree(block(p, lines[0]!, true));
    for (let i = 2; i <= lines.length; i++) {
      await tree.rerender(block(p, lines.slice(0, i).join(''), true));
    }
    const beforeClose = mockRunsCalls.length;
    await tree.rerender(block(p, code, false));
    return { tree, atClose: mockRunsCalls.slice(beforeClose) };
  };

  it('re-renders only the chunks whose colours changed', async () => {
    // `name` and `tags` stream as plain (one line of left context misses
    // the interface brace); the full pass makes them `property`.
    const code = [
      'export interface A {',
      '  readonly id: number;',
      '  name: string;',
      '  tags: readonly string[];',
      '}',
      '',
    ].join('\n');
    const { tree, atClose } = await streamLines(code);
    expect(atClose.map((c) => c.id)).toEqual([1]);
    const still = await renderTree(block(chunkedPlugin, code, false));
    expect(tree.toJSON()).toEqual(still.toJSON());
  });

  it('re-renders nothing when the full pass gives the same tokens', async () => {
    const { tree, atClose } = await streamLines(TS);
    expect(atClose).toEqual([]);
    const still = await renderTree(block(chunkedPlugin, TS, false));
    expect(tree.toJSON()).toEqual(still.toJSON());
  });

  it('tokenizes a block mounted closed once, and not again on re-render', async () => {
    const calls: string[] = [];
    const counted = highlight({
      languages: {
        ts: (code) => {
          calls.push(code);
          return [{ type: 'plain', text: code }];
        },
      },
    });
    const tree = await renderTree(block(counted, TS, false));
    await tree.rerender(block(counted, TS, false));
    expect(calls).toEqual([TS]);
  });
});

describe('one Text for a small closed block (P3-30)', () => {
  const style = getDefaultTheme().elements.CodeBlock;
  const ctx = createRenderCtx({ components: defaultComponents });
  const block = (code: string, open: boolean, p: MarkdownPlugin = plugin) => {
    const C = p.components!.CodeBlock!;
    return (
      <RenderCtxContext.Provider value={ctx}>
        <C language="ts" meta={null} open={open} style={style} code={code} />
      </RenderCtxContext.Provider>
    );
  };
  const hiddenView = (tree: Tree) =>
    tree.find(
      (n) => n.type === 'View' && n.props.accessibilityElementsHidden === true
    );
  /** TS lines cut to exactly `length` characters. */
  const codeOf = (length: number) => {
    let code = '';
    for (let i = 0; code.length < length; i++) {
      code += `const v${i} = f(${i}, 'item ${i}'); // note ${i}\n`;
    }
    return code.slice(0, length);
  };

  it.each([
    ['at the limit is one Text', SINGLE_TEXT_MAX_LENGTH, true],
    ['one over the limit is chunked', SINGLE_TEXT_MAX_LENGTH + 1, false],
  ])('a closed block %s', async (_, n, one) => {
    const code = codeOf(n);
    expect(code).toHaveLength(n);
    const tree = await renderTree(block(code, false));
    const count = chunkNodes(tree).length;
    if (one) expect(count).toBe(1);
    else expect(count).toBeGreaterThan(1);
    expect(chunkTexts(tree).join('\n')).toBe(code);
    expect(codeRoot(tree).props.accessibilityLabel).toBe(code);
  });

  it('is chunked while open and one Text at close, in the same wrapper', async () => {
    const code = TS.slice(0, -1);
    const lines = code.split(/(?<=\n)/);
    const tree = await renderTree(block(lines[0]!, true));
    const root = codeRoot(tree);
    const hidden = hiddenView(tree);
    for (let i = 2; i <= lines.length; i++) {
      await tree.rerender(block(lines.slice(0, i).join(''), true));
    }
    expect(chunkNodes(tree)).toHaveLength(3);
    await tree.rerender(block(code, false));
    expect(codeRoot(tree)).toBe(root);
    expect(hiddenView(tree)).toBe(hidden);
    expect(chunkTexts(tree)).toEqual([code]);
    const still = await renderTree(block(code, false));
    expect(tree.toJSON()).toEqual(still.toJSON());
  });

  it('colours every character as the chunked render does', async () => {
    const code = TS.slice(0, -1);
    const coloured = (tree: Tree) => {
      const out: { ch: string; color: unknown }[] = [];
      for (const chunk of chunkNodes(tree)) {
        for (const child of chunk.children) {
          const color = typeof child === 'string' ? undefined : colorOf(child);
          for (const ch of textOf(child)) out.push({ ch, color });
        }
      }
      return out.filter((c) => c.ch.trim() !== '');
    };
    const single = await renderTree(block(code, false));
    const chunked = await renderTree(block(code, false, chunkedPlugin));
    expect(chunkNodes(chunked).length).toBeGreaterThan(1);
    expect(coloured(single)).toEqual(coloured(chunked));
  });
});

describe('line numbers and wrap (P3-35)', () => {
  const CODE = TS.slice(0, -1);
  /** Lines `1\n2`, `3\n4`, `5`: the 2-line chunks. */
  const CHUNKS = [
    'const answer = 42;\nfunction greet(name: string) {',
    "  // say hi\n  return 'hi ' + name;",
    '}',
  ];

  type Options = Omit<RenderCtxInput, 'components'>;
  const element = (
    input: Options,
    code = CODE,
    open = false,
    p: MarkdownPlugin = plugin
  ) => {
    const ctx = createRenderCtx({ ...input, components: defaultComponents });
    const C = p.components!.CodeBlock!;
    return (
      <RenderCtxContext.Provider value={ctx}>
        <C
          language="ts"
          meta={null}
          open={open}
          style={ctx.theme.elements.CodeBlock}
          code={code}
        />
      </RenderCtxContext.Provider>
    );
  };
  const mount = (input: Options, code?: string, open?: boolean) =>
    renderTree(element(input, code, open));

  const isScroll = (n: TestInstance) => n.props.horizontal === true;
  const isGutter = (n: TestInstance) =>
    n.type === 'Text' &&
    n.props.selectable === false &&
    Array.isArray(n.props.style) &&
    n.props.style.some(
      (x: unknown) => typeof x === 'object' && x !== null && 'minWidth' in x
    );
  /** A code Text: not a gutter, not a colour span inside another Text. */
  const isCode = (n: TestInstance) =>
    n.type === 'Text' && !isGutter(n) && n.parent?.type !== 'Text';
  const isLabelled = (n: TestInstance) =>
    n.type === 'View' &&
    typeof n.props.accessibilityLabel === 'string' &&
    n.props.accessible === true &&
    n.props.accessibilityRole !== 'button';
  const isWrapButton = (n: TestInstance) =>
    n.type === 'View' && n.props.accessibilityLabel === 'Wrap lines';
  const inside = (node: TestInstance, ancestor: TestInstance) => {
    for (let n = node.parent; n !== null; n = n.parent) {
      if (n === ancestor) return true;
    }
    return false;
  };
  const hiddenFromA11y = (node: TestInstance) => {
    for (let n: TestInstance | null = node; n !== null; n = n.parent) {
      if (
        n.props.accessibilityElementsHidden === true &&
        n.props.importantForAccessibility === 'no-hide-descendants'
      ) {
        return true;
      }
    }
    return false;
  };
  /** Web: `aria-hidden` on an ancestor (react-native-web ignores the native props). */
  const ariaHidden = (node: TestInstance) => {
    for (let n: TestInstance | null = node; n !== null; n = n.parent) {
      if (n.props['aria-hidden'] === true) return true;
    }
    return false;
  };
  const gutters = (tree: Tree) => tree.findAll(isGutter);
  const codes = (tree: Tree) => tree.findAll(isCode);
  const body = (tree: Tree) => tree.find(isLabelled);
  /** The gutter frame's instances: body, row, gutter column, ScrollView, code column. */
  const frameOf = (tree: Tree) => {
    const scroll = tree.find(isScroll);
    return [
      body(tree),
      scroll.parent!,
      gutters(tree)[0]!.parent!,
      scroll,
      codes(tree)[0]!.parent!,
    ];
  };
  const sameFrame = (tree: Tree, frame: readonly TestInstance[]) => {
    const now = frameOf(tree);
    expect(now).toHaveLength(frame.length);
    for (const [i, n] of frame.entries()) expect(now[i]).toBe(n);
  };
  const minWidthOf = (g: TestInstance): unknown =>
    StyleSheet.flatten(g.props.style).minWidth;

  it('numbers off, wrap off: the tree is unchanged by the options', async () => {
    for (const p of [plugin, chunkedPlugin]) {
      const today = await renderTree(element({}, CODE, false, p));
      const explicit = await renderTree(
        element(
          { codeBlock: { lineNumbers: false, wrap: false } },
          CODE,
          false,
          p
        )
      );
      expect(explicit.toJSON()).toEqual(today.toJSON());
    }
  });

  it.each([
    ['one Text', plugin, [CODE]],
    ['chunks', chunkedPlugin, CHUNKS],
  ] as const)(
    'numbers off, wrap on: the same %s without the ScrollView',
    async (_, p, texts) => {
      const wrapped = await renderTree(
        element({ codeBlock: { wrap: true } }, CODE, false, p)
      );
      const scrolled = await renderTree(element({}, CODE, false, p));
      expect(wrapped.findAll(isScroll)).toEqual([]);
      expect(gutters(wrapped)).toEqual([]);
      expect(codes(wrapped).map(textOf)).toEqual(texts);
      // The hidden code column is the scrolled one, moved up a level.
      const root = body(wrapped);
      expect(root.children).toHaveLength(1);
      const column = root.children[0] as TestInstance;
      expect(hiddenFromA11y(column)).toBe(true);
      const scrolledColumn = findAll(
        scrolled.find(isScroll),
        (n) => n.type === 'View' && n.props.accessibilityElementsHidden === true
      );
      expect(scrolledColumn).toHaveLength(1);
      expect(column.toJSON()).toEqual(scrolledColumn[0]!.toJSON());
    }
  );

  it('numbers on, wrap off: chunks beside a mirrored gutter outside the ScrollView', async () => {
    // Over the single-Text limit: chunks.
    const tree = await renderTree(
      element(
        { codeBlock: { lineNumbers: true }, selectable: true },
        CODE,
        false,
        chunkedPlugin
      )
    );
    const scroll = tree.find(isScroll);
    const code = codes(tree);
    expect(code.map(textOf)).toEqual(CHUNKS);
    const gutter = gutters(tree);
    expect(gutter.map(textOf)).toEqual(['1\n2', '3\n4', '5']);
    const theme = getDefaultTheme();
    for (const [i, g] of gutter.entries()) {
      expect(inside(g, scroll)).toBe(false);
      expect(g.props.selectable).toBe(false);
      expect(hiddenFromA11y(g)).toBe(true);
      // Web: the gutter column carries aria-hidden, the code does not.
      expect(g.parent!.props['aria-hidden']).toBe(true);
      expect(g.props.style[0]).toBe(theme.codeBlockGutter.text);
      // Mirrored: as many numbers as its chunk has lines.
      expect(textOf(g).split('\n')).toHaveLength(
        codeLineCount(textOf(code[i]!))
      );
    }
    for (const c of code) {
      expect(inside(c, scroll)).toBe(true);
      expect(c.props.selectable).toBe(true);
      expect(c.props.style).toBe(theme.elements.CodeBlock.text);
      expect(hiddenFromA11y(c)).toBe(true);
      expect(ariaHidden(c)).toBe(false);
    }
    // Colours survive.
    expect(spans(tree, '42').map(colorOf)).toEqual([lightTheme.syntax.number]);
  });

  it('numbers on, wrap on: one row per line, coloured', async () => {
    const tree = await mount({
      codeBlock: { lineNumbers: true, wrap: true },
      selectable: true,
    });
    expect(tree.findAll(isScroll)).toEqual([]);
    const gutter = gutters(tree);
    expect(gutter.map(textOf)).toEqual(['1', '2', '3', '4', '5']);
    const code = codes(tree);
    expect(code).toHaveLength(codeLineCount(CODE));
    expect(code.map(textOf)).toEqual(codeLines(CODE));
    for (const [i, c] of code.entries()) {
      expect(c.props.selectable).toBe(true);
      expect(c.props.style).toContainEqual(
        expect.objectContaining({ flex: 1 })
      );
      expect(hiddenFromA11y(c)).toBe(true);
      expect(findAll(c.parent!, isGutter)).toEqual([gutter[i]]);
      expect(ariaHidden(c)).toBe(false);
    }
    for (const g of gutter) {
      expect(g.props.selectable).toBe(false);
      expect(hiddenFromA11y(g)).toBe(true);
      expect(g.parent!.props['aria-hidden']).toBe(true);
    }
    expect(spans(tree, '42').map(colorOf)).toEqual([lightTheme.syntax.number]);
  });

  describe('blank rows', () => {
    const code = 'a;\nb;\n}\n\nx;\n\n\ny;\n';
    const rows = { codeBlock: { lineNumbers: true, wrap: true } };

    it("hold ' ' on native", async () => {
      const tree = await mount(rows, code);
      expect(codes(tree).map(textOf)).toEqual(
        codeLines(code).map((l) => (l === '' ? ' ' : l))
      );
    });

    it('keep their newline on web, joining to the code', async () => {
      jest.replaceProperty(Platform, 'OS', 'web');
      for (const c of [code, code.slice(0, -1)]) {
        const tree = await mount(rows, c);
        const texts = codes(tree).map(textOf);
        expect(texts).toHaveLength(codeLineCount(c));
        expect(texts.join('')).toBe(c);
      }
    });
  });

  it('shows line 1 for an empty block', async () => {
    const gutter = await mount({ codeBlock: { lineNumbers: true } }, '');
    expect(gutters(gutter).map(textOf)).toEqual(['1']);
    const rows = await mount(
      { codeBlock: { lineNumbers: true, wrap: true } },
      ''
    );
    expect(gutters(rows).map(textOf)).toEqual(['1']);
    expect(codes(rows).map(textOf)).toEqual([' ']);
  });

  it('labels the body with the code exactly, numbers on', async () => {
    for (const header of [false, true]) {
      for (const wrap of [false, true]) {
        const tree = await mount({
          codeBlock: { header, wrap, lineNumbers: true },
        });
        const labelled = tree.findAll(isLabelled);
        expect(labelled).toHaveLength(1);
        expect(labelled[0]!.props.accessibilityLabel).toBe(CODE);
        // Nothing inside the body is reachable on its own.
        expect(
          findAll(labelled[0]!, (n) => n.props.accessible === true)
        ).toEqual([]);
      }
    }
  });

  it('copies the code without numbers', async () => {
    const onCopyPress = jest.fn();
    const view = await render(
      element({
        codeBlock: { header: true, lineNumbers: true, wrap: true },
        handlers: { onCopyPress },
      })
    );
    const [copy] = findAll(
      view.container,
      (n) => n.type === 'View' && n.props.accessibilityLabel === 'Copy code'
    );
    await fireEvent.press(copy!);
    expect(onCopyPress).toHaveBeenCalledWith({
      code: CODE,
      language: 'ts',
      meta: null,
    });
  });

  it('the Wrap button toggles the layout and tracks it', async () => {
    const view = await render(
      element({ codeBlock: { header: true, lineNumbers: true } })
    );
    const all = (m: Match) => findAll(view.container, m);
    const button = () => all(isWrapButton)[0]!;
    expect(button().props.accessibilityState.selected).toBe(false);
    expect(all(isScroll)).toHaveLength(1);
    expect(all(isGutter).map(textOf)).toEqual(['1\n2\n3\n4\n5']);

    await fireEvent.press(button());
    expect(button().props.accessibilityState.selected).toBe(true);
    expect(all(isScroll)).toEqual([]);
    expect(all(isGutter)).toHaveLength(5);

    await fireEvent.press(button());
    expect(button().props.accessibilityState.selected).toBe(false);
    expect(all(isScroll)).toHaveLength(1);
    expect(all(isGutter).map(textOf)).toEqual(['1\n2\n3\n4\n5']);
  });

  it('hides the Wrap button while open; wrap still applies', async () => {
    const tree = await mount(
      { codeBlock: { header: true, wrap: true, lineNumbers: true } },
      CODE,
      true
    );
    expect(tree.findAll(isWrapButton)).toEqual([]);
    expect(tree.findAll(isScroll)).toEqual([]);
    expect(gutters(tree)).toHaveLength(5);
  });

  describe('numbers on, wrap off: one Text for a small closed block', () => {
    const numbers = { codeBlock: { lineNumbers: true } };
    const oneTo = (n: number) =>
      Array.from({ length: n }, (_, i) => String(i + 1)).join('\n');
    /** At most `limit` characters drawn as one Text. */
    const limited = (limit: number) =>
      definePlugin({
        name: 'highlight',
        components: {
          CodeBlock: createHighlightedCodeBlock({
            maxLength: DEFAULT_MAX_LENGTH,
            singleTextMaxLength: limit,
          }),
        },
      });
    /** Lines a Text draws: native adds an empty line after a final `\n`. */
    const drawn = (text: string, web: boolean) =>
      web ? Math.max(1, codeLineCount(text)) : text.split('\n').length;

    it('is one code Text in the ScrollView beside one gutter Text', async () => {
      const tree = await mount({ ...numbers, selectable: true });
      const scroll = tree.find(isScroll);
      const [code, ...moreCode] = codes(tree);
      expect(moreCode).toEqual([]);
      expect(textOf(code!)).toBe(CODE);
      expect(inside(code!, scroll)).toBe(true);
      expect(code!.props.selectable).toBe(true);
      expect(code!.props.style).toBe(getDefaultTheme().elements.CodeBlock.text);
      expect(hiddenFromA11y(code!)).toBe(true);
      expect(ariaHidden(code!)).toBe(false);
      const [gutter, ...moreGutters] = gutters(tree);
      expect(moreGutters).toEqual([]);
      expect(textOf(gutter!)).toBe('1\n2\n3\n4\n5');
      expect(inside(gutter!, scroll)).toBe(false);
      expect(gutter!.props.selectable).toBe(false);
      expect(hiddenFromA11y(gutter!)).toBe(true);
      expect(gutter!.parent!.props['aria-hidden']).toBe(true);
      expect(gutter!.props.style[0]).toBe(
        getDefaultTheme().codeBlockGutter.text
      );
      expect(spans(tree, '42').map(colorOf)).toEqual([
        lightTheme.syntax.number,
      ]);
      // The label is the code, without numbers.
      expect(body(tree).props.accessibilityLabel).toBe(CODE);
    });

    it('chunks over the limit and while open, with a mirrored gutter', async () => {
      const at = await renderTree(
        element(numbers, CODE, false, limited(CODE.length))
      );
      expect(codes(at).map(textOf)).toEqual([CODE]);
      for (const tree of [
        await renderTree(
          element(numbers, CODE, false, limited(CODE.length - 1))
        ),
        await mount(numbers, CODE, true),
      ]) {
        expect(codes(tree).map(textOf)).toEqual(CHUNKS);
        expect(gutters(tree).map(textOf)).toEqual(['1\n2', '3\n4', '5']);
      }
    });

    it.each([false, true])(
      'gutter and code draw the same lines, and the close swap keeps the code lines (web %s)',
      async (web) => {
        if (web) jest.replaceProperty(Platform, 'OS', 'web');
        for (const code of [
          'a;',
          'a;\n',
          'a;\n\n',
          'a;\n\nb;\n\n\n',
          'a;\nb;\n\nc;\n',
          'a;\r\nb;\r\n',
        ]) {
          const tree = await mount(numbers, code);
          const [text, ...more] = codes(tree).map(textOf);
          expect(more).toEqual([]);
          expect(text).toBe(code);
          const [gutter, ...moreGutters] = gutters(tree).map(textOf);
          expect(moreGutters).toEqual([]);
          // Numbered: the logical lines; a final `\n` adds a bare line.
          expect(
            gutter!
              .split('\n')
              .filter((n) => n !== '')
              .join('\n')
          ).toBe(oneTo(codeLineCount(code)));
          expect(drawn(gutter!, web)).toBe(drawn(code, web));
          // The open chunks draw as many code lines as the one Text.
          const open = await mount(numbers, code, true);
          const lines = codes(open)
            .map(textOf)
            .reduce((n, t) => n + drawn(t, web), 0);
          expect(lines).toBe(drawn(code, web));
        }
      }
    );

    it.each([false, true])(
      'chunked: the gutter draws as many lines as the chunks, trailing blank lines too (web %s)',
      async (web) => {
        if (web) jest.replaceProperty(Platform, 'OS', 'web');
        for (const code of [
          'a;\nb;\nc;',
          'a;\nb;\nc;\n',
          'a;\nb;\nc;\n\n',
          'a;\nb;\nc;\n\n\n',
          'a;\n\nb;\n\n\nc;\n\n',
        ]) {
          const tree = await renderTree(
            element(numbers, code, false, chunkedPlugin)
          );
          const codeTexts = codes(tree).map(textOf);
          const gutterTexts = gutters(tree).map(textOf);
          expect(gutterTexts).toHaveLength(codeTexts.length);
          const sum = (texts: string[]) =>
            texts.reduce((n, t) => n + drawn(t, web), 0);
          expect(sum(gutterTexts)).toBe(sum(codeTexts));
          // Only the last entry gains a bare `\n`, on native only.
          const extra = !web && code.endsWith('\n');
          const numbersOf = gutterTexts.map((t) => t.replace(/\n$/, ''));
          expect(numbersOf.join('\n')).toBe(oneTo(codeLineCount(code)));
          expect(gutterTexts.map((t) => t.endsWith('\n'))).toEqual(
            gutterTexts.map((_, i) => extra && i === gutterTexts.length - 1)
          );
          // The cache is not mutated: a rerender draws the same gutter.
          const before = gutters(tree);
          await tree.rerender(element(numbers, code, false, chunkedPlugin));
          expect(gutters(tree).map(textOf)).toEqual(gutterTexts);
          for (const [i, g] of gutters(tree).entries()) {
            expect(g).toBe(before[i]);
          }
        }
      }
    );

    it('chunked while open: finished chunks keep their gutter Text and text', async () => {
      const code = 'a;\nb;\nc;\nd;\n';
      const tree = await renderTree(
        element(numbers, code, true, chunkedPlugin)
      );
      expect(gutters(tree).map(textOf)).toEqual(['1\n2', '3\n4\n']);
      const [first] = gutters(tree);
      await tree.rerender(
        element(numbers, `${code}e;\n\n`, true, chunkedPlugin)
      );
      expect(gutters(tree).map(textOf)).toEqual(['1\n2', '3\n4', '5\n6\n']);
      expect(gutters(tree)[0]).toBe(first);
    });

    it('numbers 10 and 100 lines at the chunked width', async () => {
      const lines = (n: number) =>
        Array.from({ length: n }, (_, i) => `x${i};`).join('\n');
      const widths: unknown[] = [];
      for (const n of [9, 10, 100]) {
        const code = lines(n);
        expect(code.length).toBeLessThanOrEqual(SINGLE_TEXT_MAX_LENGTH);
        const tree = await mount(numbers, code);
        const [gutter] = gutters(tree);
        expect(textOf(gutter!)).toBe(oneTo(n));
        const chunked = await renderTree(
          element(numbers, code, false, chunkedPlugin)
        );
        expect(minWidthOf(gutter!)).toBe(minWidthOf(gutters(chunked)[0]!));
        widths.push(minWidthOf(gutter!));
      }
      const [w9, w10, w100] = widths as number[];
      expect(w9!).toBeLessThan(w10!);
      expect(w10!).toBeLessThan(w100!);
    });

    it('wrap with numbers stays one row per line', async () => {
      const tree = await mount({
        codeBlock: { lineNumbers: true, wrap: true },
      });
      expect(codes(tree).map(textOf)).toEqual(codeLines(CODE));
      expect(gutters(tree).map(textOf)).toEqual(['1', '2', '3', '4', '5']);
    });
  });

  describe('streaming, then close', () => {
    const lines = CODE.split(/(?<=\n)/);

    it.each([
      ['numbers on, wrap off', { lineNumbers: true, wrap: false }],
      ['numbers on, wrap on', { lineNumbers: true, wrap: true }],
    ] as const)(
      '%s: numbers grow with the lines; nothing remounts',
      async (_, codeBlock) => {
        const tree = await renderTree(element({ codeBlock }, lines[0]!, true));
        let mounted: TestInstance[] = [];
        for (let i = 1; i <= lines.length; i++) {
          const code = lines.slice(0, i).join('');
          await tree.rerender(element({ codeBlock }, code, true));
          // Native: the last gutter ends in a bare `\n` after the code's.
          const numbers = gutters(tree)
            .flatMap((n) => textOf(n).split('\n'))
            .filter((n) => n !== '');
          expect(numbers).toEqual(
            [...Array(codeLineCount(code)).keys()].map((k) => String(k + 1))
          );
          // Every gutter and code Text mounted earlier is still there.
          const now = [...gutters(tree), ...codes(tree)];
          for (const n of mounted) expect(now).toContain(n);
          mounted = now;
        }
        // Wrap off swaps the chunks to one Text at close (P3-35): only the
        // chunk and gutter Texts change, the frame stays.
        const frame = codeBlock.wrap ? [] : frameOf(tree);
        await tree.rerender(element({ codeBlock }, CODE, false));
        const after = [...gutters(tree), ...codes(tree)];
        if (codeBlock.wrap) {
          for (const n of mounted) expect(after).toContain(n);
        } else {
          sameFrame(tree, frame);
          expect(gutters(tree).map(textOf)).toEqual(['1\n2\n3\n4\n5']);
          expect(codes(tree).map(textOf)).toEqual([CODE]);
        }
        expect(body(tree).props.accessibilityLabel).toBe(CODE);
        // The final tree is the static one.
        const still = await renderTree(element({ codeBlock }, CODE, false));
        expect(tree.toJSON()).toEqual(still.toJSON());
      }
    );

    it('numbers on, wrap on: a finished chunk renders its rows once', async () => {
      // 9 lines: the gutter width never changes (one digit).
      const code = Array.from(
        { length: 9 },
        (_, i) => `let v${i} = ${i};\n`
      ).join('');
      const codeBlock = { lineNumbers: true, wrap: true };
      const parts = code.split(/(?<=\n)/);
      const tree = await renderTree(element({ codeBlock }, parts[0]!, true));
      for (let i = 2; i <= parts.length; i++) {
        await tree.rerender(
          element({ codeBlock }, parts.slice(0, i).join(''), true)
        );
      }
      const frozen = mockLineRunsCalls.filter((c) => c.frozen);
      expect(new Set(frozen.map((c) => c.id)).size).toBeGreaterThanOrEqual(3);
      const perObject = new Map<Chunk, number>();
      for (const c of frozen) perObject.set(c, (perObject.get(c) ?? 0) + 1);
      expect([...perObject.values()].filter((n) => n !== 1)).toEqual([]);
      expect(codes(tree)).toHaveLength(9);
    });

    it('numbers off, wrap on: a small block swaps to one Text at close', async () => {
      const codeBlock = { wrap: true };
      const tree = await renderTree(element({ codeBlock }, lines[0]!, true));
      for (let i = 2; i <= lines.length; i++) {
        await tree.rerender(
          element({ codeBlock }, lines.slice(0, i).join(''), true)
        );
      }
      const root = body(tree);
      const column = root.children[0];
      expect(codes(tree).map(textOf)).toEqual(CHUNKS);
      await tree.rerender(element({ codeBlock }, CODE, false));
      expect(body(tree)).toBe(root);
      expect(root.children[0]).toBe(column);
      expect(codes(tree).map(textOf)).toEqual([CODE]);
      expect(tree.findAll(isScroll)).toEqual([]);
    });
  });
});
