import { Image, Linking, StyleSheet, Text } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
  type ReactTestRendererJSON,
} from 'react-test-renderer';
import { getDefaultTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx, type RenderCtxInput } from '../context';
import { defaultComponents } from '../defaults';
import { resetInlineViewWarnings } from '../devInline';
import { isOpenableUrl } from '../links';
import { tableFor } from './helpers';

// Image sizes never resolve here: no async state updates after render.
let getSize: jest.SpyInstance;
beforeEach(() => {
  getSize = jest.spyOn(Image, 'getSize') as jest.SpyInstance;
  getSize.mockReturnValue(new Promise(() => {}));
});
afterEach(() => getSize.mockRestore());

function render(
  source: string,
  input: Omit<RenderCtxInput, 'components'> = {}
): ReactTestRenderer {
  const ctx = createRenderCtx({ ...input, components: defaultComponents });
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<BlockList table={tableFor(source)} ctx={ctx} />);
  });
  return root;
}

/** Host <Text> nodes (RN's Text renders as a host 'Text'). */
const hostTexts = (root: ReactTestRenderer) =>
  root.root.findAll((n) => n.type === ('Text' as never));

const flat = (node: ReactTestInstance) =>
  StyleSheet.flatten(node.props.style) as Record<string, unknown>;

describe('default elements', () => {
  it('renders the gallery of block and inline elements', () => {
    const root = render(
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

  it('renders a paragraph as one host Text with nested Text', () => {
    const root = render('plain **bold** and *em*\n');
    const texts = hostTexts(root);
    // Outer paragraph Text + Strong + Emphasis.
    expect(texts).toHaveLength(3);
    const outer = texts[0]!;
    expect(outer.findAll((n) => n.type === ('Text' as never))).toHaveLength(3);
    expect(flat(texts[1]!)).toEqual({ fontWeight: '700' });
  });

  it('applies the paragraph container style to the Text itself', () => {
    const [paragraph] = hostTexts(render('para\n'));
    expect(flat(paragraph!)).toMatchObject({
      marginBottom: 12,
      fontSize: 16,
    });
  });

  it('gives headings the header role and the level style', () => {
    const [heading] = hostTexts(render('## Sub\n'));
    expect(heading!.props.accessibilityRole).toBe('header');
    expect(flat(heading!).fontSize).toBe(33);
  });

  it('renders hard breaks as newlines inside the paragraph text', () => {
    const view = render('a\\\nb\n').toJSON() as ReactTestRendererJSON;
    const paragraph = view.children![0] as ReactTestRendererJSON;
    expect(paragraph.children).toEqual(['a', '\n', 'b']);
  });

  it('cascades the blockquote text style into its paragraphs', () => {
    const [paragraph] = hostTexts(render('> quoted\n'));
    expect(flat(paragraph!).color).toBe(getDefaultTheme().tokens.colors.muted);
  });

  it('passes selectable and maxFontSizeMultiplier to block text', () => {
    const [paragraph] = hostTexts(
      render('para\n', { selectable: true, maxFontSizeMultiplier: 1.5 })
    );
    expect(paragraph!.props.selectable).toBe(true);
    expect(paragraph!.props.maxFontSizeMultiplier).toBe(1.5);
  });

  it('gives every ordered marker the same width, right-aligned', () => {
    const root = render('9. nine\n10. ten\n');
    const markers = hostTexts(root).filter((n) =>
      ['9.', '10.'].includes(n.props.children)
    );
    expect(markers).toHaveLength(2);
    const widths = markers.map((m) => flat(m.parent!).width);
    expect(widths[0]).toBe(widths[1]);
    expect(markers.map((m) => flat(m).textAlign)).toEqual(['right', 'right']);
  });

  it('trims the trailing newline of an HTML block', () => {
    const texts = hostTexts(render('<div>\nx\n</div>\n'));
    expect(texts[0]!.props.children).toBe('<div>\nx\n</div>');
  });

  it('does not warn about the default inline image (a declared inline view)', () => {
    resetInlineViewWarnings();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render('see ![i](i.png)\n');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('task list items', () => {
  const checkboxes = (root: ReactTestRenderer) =>
    root.root.findAll(
      (n) => n.type === Text && n.props.accessibilityRole === 'checkbox'
    );

  it('are read-only without onTaskToggle', () => {
    const [box] = checkboxes(render('- [ ] open\n'));
    expect(box!.props.onPress).toBeUndefined();
    expect(box!.props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
  });

  it('report the toggled state and the item index', () => {
    const onTaskToggle = jest.fn();
    const root = render('- [x] a\n- [ ] b\n', { handlers: { onTaskToggle } });
    const [first, second] = checkboxes(root);
    act(() => first!.props.onPress());
    act(() => second!.props.onPress());
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

  const press = (source: string, input: Omit<RenderCtxInput, 'components'>) => {
    const root = render(source, input);
    const link = root.root.find(
      (n) => n.type === Text && n.props.accessibilityRole === 'link'
    );
    act(() => link.props.onPress());
  };

  it('call onLinkPress, then open allowlisted URLs', () => {
    const onLinkPress = jest.fn();
    press('[a](https://example.com "T")\n', { handlers: { onLinkPress } });
    expect(onLinkPress).toHaveBeenCalledWith('https://example.com', {
      title: 'T',
    });
    expect(openURL).toHaveBeenCalledWith('https://example.com');
  });

  it('cancel the default when onLinkPress returns false', () => {
    press('[a](https://example.com)\n', {
      handlers: { onLinkPress: () => false },
    });
    expect(openURL).not.toHaveBeenCalled();
  });

  it('never open custom schemes or relative URLs by default, but report them', () => {
    const onLinkPress = jest.fn();
    press('[a](myapp://route)\n', { handlers: { onLinkPress } });
    press('[b](/docs)\n', { handlers: { onLinkPress } });
    expect(onLinkPress.mock.calls.map((c) => c[0])).toEqual([
      'myapp://route',
      '/docs',
    ]);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('swallow openURL failures', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    press('[a](https://example.com)\n', {});
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
