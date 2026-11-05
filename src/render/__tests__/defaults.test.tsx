import { Image, Linking, StyleSheet } from 'react-native';
import { fireEvent, render as renderRN } from '@testing-library/react-native';
import {
  findAll,
  find,
  type JsonElement,
  type Match,
  type TestInstance,
} from '../../__tests__/tree';
import { getDefaultTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx, type RenderCtxInput } from '../context';
import { defaultComponents } from '../defaults';
import { resetInlineViewWarnings } from '../devInline';
import { isOpenableUrl } from '../links';
import { tableFor } from './helpers';

/** The queries these tests use, over an RNTL render. */
interface Tree {
  findAll(match: Match): TestInstance[];
  find(match: Match): TestInstance;
  toJSON(): JsonElement | JsonElement[] | null;
}

// Image sizes never resolve here: no async state updates after render.
let getSize: jest.SpyInstance;
beforeEach(() => {
  getSize = jest.spyOn(Image, 'getSize') as jest.SpyInstance;
  getSize.mockReturnValue(new Promise(() => {}));
});
afterEach(() => getSize.mockRestore());

async function render(
  source: string,
  input: Omit<RenderCtxInput, 'components'> = {}
): Promise<Tree> {
  const ctx = createRenderCtx({ ...input, components: defaultComponents });
  const view = await renderRN(<BlockList table={tableFor(source)} ctx={ctx} />);
  return {
    findAll: (match) => findAll(view.container, match),
    find: (match) => find(view.container, match),
    toJSON: () => view.toJSON(),
  };
}

/** Host <Text> nodes (RN's Text renders as a host 'Text'). */
const hostTexts = (root: Tree) => root.findAll('Text');

const flat = (node: TestInstance) =>
  StyleSheet.flatten(node.props.style) as Record<string, unknown>;

describe('default elements', () => {
  it('renders the gallery of block and inline elements', async () => {
    const root = await render(
      [
        '# Title',
        'Text with **strong**, *em*, ~~del~~, `code`, [link](https://x), H<sub>2</sub>O, <kbd>K</kbd>, <u>u</u>, <mark>m</mark>, x<sup>2</sup>, <span>raw</span>.',
        '> quote',
        '3. three\n4. four',
        '- [x] done\n- [ ] open',
        '```js\nconst a = 1;\n```',
        '---',
        '<div>block</div>',
        '| a | b |\n|:--|--:|\n| 1 | 2 |',
        '![img](a.png)',
        'note[^1]\n\n[^1]: The note.',
      ].join('\n\n')
    );
    expect(root.toJSON()).toMatchSnapshot();
  });

  it('renders a paragraph as one host Text with nested Text', async () => {
    const root = await render('plain **bold** and *em*\n');
    const texts = hostTexts(root);
    // Outer paragraph Text + Strong + Emphasis.
    expect(texts).toHaveLength(3);
    const outer = texts[0]!;
    // findAll excludes the node itself; the old one included it.
    expect([outer, ...findAll(outer, 'Text')]).toHaveLength(3);
    expect(flat(texts[1]!)).toEqual({ fontWeight: '700' });
  });

  it('applies the paragraph container style to the Text itself', async () => {
    const [paragraph] = hostTexts(await render('para\n'));
    expect(flat(paragraph!)).toMatchObject({
      marginBottom: 12,
      fontSize: 16,
    });
  });

  it('gives headings the header role and the level style', async () => {
    const [heading] = hostTexts(await render('## Sub\n'));
    expect(heading!.props.accessibilityRole).toBe('header');
    expect(flat(heading!).fontSize).toBe(33);
  });

  it('renders hard breaks as newlines inside the paragraph text', async () => {
    const view = (await render('a\\\nb\n')).toJSON() as JsonElement;
    const paragraph = view.children![0] as JsonElement;
    expect(paragraph.children).toEqual(['a', '\n', 'b']);
  });

  it('cascades the blockquote text style into its paragraphs', async () => {
    const [paragraph] = hostTexts(await render('> quoted\n'));
    expect(flat(paragraph!).color).toBe(getDefaultTheme().tokens.colors.muted);
  });

  it('passes selectable and maxFontSizeMultiplier to block text', async () => {
    const [paragraph] = hostTexts(
      await render('para\n', { selectable: true, maxFontSizeMultiplier: 1.5 })
    );
    expect(paragraph!.props.selectable).toBe(true);
    expect(paragraph!.props.maxFontSizeMultiplier).toBe(1.5);
  });

  it('gives every ordered marker the same width, right-aligned', async () => {
    const root = await render('9. nine\n10. ten\n');
    const markers = hostTexts(root).filter((n) =>
      ['9.', '10.'].includes(n.props.children)
    );
    expect(markers).toHaveLength(2);
    const widths = markers.map((m) => flat(m.parent!).width);
    expect(widths[0]).toBe(widths[1]);
    expect(markers.map((m) => flat(m).textAlign)).toEqual(['right', 'right']);
  });

  it('trims the trailing newline of an HTML block', async () => {
    const texts = hostTexts(await render('<div>\nx\n</div>\n'));
    expect(texts[0]!.props.children).toBe('<div>\nx\n</div>');
  });

  it('does not warn about the default inline image (a declared inline view)', async () => {
    resetInlineViewWarnings();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await render('see ![i](i.png)\n');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('task list items', () => {
  const checkboxes = (root: Tree) =>
    root.findAll(
      (n) => n.type === 'Text' && n.props.accessibilityRole === 'checkbox'
    );

  it('are read-only without onTaskToggle', async () => {
    const [box] = checkboxes(await render('- [ ] open\n'));
    expect(box!.props.onPress).toBeUndefined();
    expect(box!.props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
  });

  it('report the toggled state and the item index', async () => {
    const onTaskToggle = jest.fn();
    const root = await render('- [x] a\n- [ ] b\n', {
      handlers: { onTaskToggle },
    });
    const [first, second] = checkboxes(root);
    await fireEvent.press(first!);
    await fireEvent.press(second!);
    expect(onTaskToggle.mock.calls).toEqual([
      [false, { index: 0 }],
      [true, { index: 1 }],
    ]);
  });
});

describe('links', () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => openURL.mockRestore());

  const press = async (
    source: string,
    input: Omit<RenderCtxInput, 'components'>
  ) => {
    const root = await render(source, input);
    const link = root.find(
      (n) => n.type === 'Text' && n.props.accessibilityRole === 'link'
    );
    await fireEvent.press(link);
  };

  it('call onLinkPress, then open allowlisted URLs', async () => {
    const onLinkPress = jest.fn();
    await press('[a](https://example.com "T")\n', {
      handlers: { onLinkPress },
    });
    expect(onLinkPress).toHaveBeenCalledWith('https://example.com', {
      title: 'T',
    });
    expect(openURL).toHaveBeenCalledWith('https://example.com');
  });

  it('cancel the default when onLinkPress returns false', async () => {
    await press('[a](https://example.com)\n', {
      handlers: { onLinkPress: () => false },
    });
    expect(openURL).not.toHaveBeenCalled();
  });

  it('never open custom schemes or relative URLs by default, but report them', async () => {
    const onLinkPress = jest.fn();
    await press('[a](myapp://route)\n', { handlers: { onLinkPress } });
    await press('[b](/docs)\n', { handlers: { onLinkPress } });
    expect(onLinkPress.mock.calls.map((c) => c[0])).toEqual([
      'myapp://route',
      '/docs',
    ]);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('swallow openURL failures', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    await press('[a](https://example.com)\n', {});
    await Promise.resolve();
    expect(openURL).toHaveBeenCalled();
  });

  it('allowlist http, https, mailto and tel only', () => {
    expect(
      [
        'https://a',
        'HTTP://a',
        'mailto:x@y',
        'tel:123',
        'ftp://a',
        'myapp://x',
        '/rel',
        '#frag',
      ].map(isOpenableUrl)
    ).toEqual([true, true, true, true, false, false, false, false]);
  });
});
