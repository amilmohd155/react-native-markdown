/**
 * The highlight plugin's CodeBlock (P3-29 to P3-31): colours from the theme,
 * plain fallbacks, the single accessible element, and memoised chunks while
 * streaming.
 */
import { useEffect } from 'react';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  findAll,
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
import { createRenderCtx } from '../../render/context';
import { RenderCtxContext } from '../../render/contexts';
import { defaultComponents } from '../../render/defaults';
import { darkTheme, getDefaultTheme, lightTheme } from '../../theme';
import type { Chunk } from '../chunking';
import {
  createHighlightedCodeBlock,
  SINGLE_TEXT_MAX_LENGTH,
} from '../HighlightedCodeBlock';
import { DEFAULT_MAX_LENGTH, highlight, type Tokenizer } from '../index';

// Records every `runsOf` call: one per chunk Text render.
const mockRunsCalls: Chunk[] = [];
jest.mock('../chunking', () => {
  const actual = jest.requireActual('../chunking');
  return {
    ...actual,
    runsOf: (chunk: Chunk, colorOf?: unknown) => {
      mockRunsCalls.push(chunk);
      return actual.runsOf(chunk, colorOf);
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
