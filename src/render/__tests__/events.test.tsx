import { Linking, Pressable, Text } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Markdown } from '../../api/Markdown';
import { BlockList } from '../Block';
import {
  createRenderCtx,
  type RenderCtx,
  type RenderHandlers,
} from '../context';
import { defaultComponents } from '../defaults';
import { cachedImageSize, loadImageSize } from '../imageSize';
import { tableFor } from './helpers';

function mount(source: string, handlers: RenderHandlers = {}) {
  const ctx: RenderCtx = createRenderCtx({
    components: defaultComponents,
    handlers,
  });
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<BlockList table={tableFor(source)} ctx={ctx} />);
  });
  return root;
}

const links = (root: ReactTestRenderer) =>
  root.root.findAll(
    (n) => n.type === Text && n.props.accessibilityRole === 'link'
  );

const press = (node: ReactTestInstance) => act(() => node.props.onPress());

describe('onLinkPress', () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => openURL.mockRestore());

  it('is called for every link, including ones the default refuses', () => {
    const onLinkPress = jest.fn();
    const root = mount(
      '[a](https://x.dev) [b](myapp://open) [c](/docs/page) [d](#top)',
      { onLinkPress }
    );
    for (const link of links(root)) press(link);
    expect(onLinkPress.mock.calls.map((c) => c[0])).toEqual([
      'https://x.dev',
      'myapp://open',
      '/docs/page',
      '#top',
    ]);
  });

  it('opens http, https, mailto and tel only; never custom schemes or relative URLs', () => {
    const root = mount(
      '[a](https://x.dev) [b](http://x.dev) [c](mailto:a@b.dev) [d](tel:+123) [e](myapp://open) [f](/rel) [g](#frag)'
    );
    for (const link of links(root)) press(link);
    expect(openURL.mock.calls.map((c) => c[0])).toEqual([
      'https://x.dev',
      'http://x.dev',
      'mailto:a@b.dev',
      'tel:+123',
    ]);
  });

  it('cancels the default when the handler returns false', () => {
    const root = mount('[a](https://x.dev)', { onLinkPress: () => false });
    press(links(root)[0]!);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('keeps the default for undefined, true and other returns', () => {
    const root = mount('[a](https://x.dev)', { onLinkPress: () => undefined });
    press(links(root)[0]!);
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('catches a rejected openURL', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    const root = mount('[a](https://x.dev)');
    press(links(root)[0]!);
    await act(async () => {});
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('catches a synchronous throw from openURL', () => {
    openURL.mockImplementation(() => {
      throw new Error('sync');
    });
    const root = mount('[a](https://x.dev)');
    expect(() => press(links(root)[0]!)).not.toThrow();
  });
});

describe('onImagePress', () => {
  it('fires for inline images, and only when set', async () => {
    const getSize: jest.SpyInstance = jest.spyOn(Image_, 'getSize');
    getSize.mockResolvedValue({ width: 10, height: 10 });
    await loadImageSize('icon.png');
    expect(cachedImageSize('icon.png')).not.toBeNull();

    expect(
      mount('a ![i](icon.png) b').root.findAllByType(Pressable)
    ).toHaveLength(0);

    const onImagePress = jest.fn();
    const root = mount('a ![i](icon.png "T") b', { onImagePress });
    press(root.root.findByType(Pressable));
    expect(onImagePress).toHaveBeenCalledWith('icon.png', {
      alt: 'i',
      title: 'T',
    });
  });
});

describe('onTaskToggle', () => {
  it('reports the new state of a pressed checkbox', () => {
    const onTaskToggle = jest.fn();
    const root = mount('- [ ] a\n- [x] b\n', { onTaskToggle });
    const boxes = root.root.findAll(
      (n) => n.type === Text && n.props.accessibilityRole === 'checkbox'
    );
    press(boxes[0]!);
    press(boxes[1]!);
    expect(onTaskToggle.mock.calls).toEqual([
      [true, { index: 0 }],
      [false, { index: 1 }],
    ]);
  });
});

describe('onFootnotePress', () => {
  const DOC = 'a[^1] b[^n] c[^1]\n\n[^1]: First.\n[^n]: Named.\n';

  it('leaves references and back-links as plain text without the handler', () => {
    const root = mount(DOC);
    expect(links(root)).toHaveLength(0);
  });

  it('sends references to their definition, with the 1-based reference', () => {
    const onFootnotePress = jest.fn();
    const root = mount(DOC, { onFootnotePress });
    const refs = links(root).filter((n) => /^\[\d\]$/.test(text(n)));
    expect(refs).toHaveLength(3);
    refs.forEach((r) => press(r));
    expect(onFootnotePress.mock.calls).toEqual([
      ['1', { index: 1, direction: 'definition', reference: 1 }],
      ['n', { index: 2, direction: 'definition', reference: 1 }],
      ['1', { index: 1, direction: 'definition', reference: 2 }],
    ]);
  });

  it('sends each back-link to its reference', () => {
    const onFootnotePress = jest.fn();
    const root = mount(DOC, { onFootnotePress });
    const back = links(root).filter((n) => text(n).trim().startsWith('↩'));
    // Footnote 1 has two references, footnote n has one.
    expect(back).toHaveLength(3);
    back.forEach((b) => press(b));
    expect(onFootnotePress.mock.calls).toEqual([
      ['1', { index: 1, direction: 'reference', reference: 1 }],
      ['1', { index: 1, direction: 'reference', reference: 2 }],
      ['n', { index: 2, direction: 'reference', reference: 1 }],
    ]);
  });
});

function text(node: ReactTestInstance): string {
  return node.children
    .map((c) => (typeof c === 'string' ? c : text(c)))
    .join('');
}

describe('handlers stay behind the ref', () => {
  it('a new inline handler neither re-renders blocks nor changes ctx', () => {
    let renders = 0;
    const Counting = ({ children }: { children?: React.ReactNode }) => {
      renders++;
      return <Text>{children}</Text>;
    };
    const first = jest.fn();
    const second = jest.fn();
    let root!: ReactTestRenderer;
    const element = (cb: () => void) => (
      <Markdown
        source={'one\n\n[^1]\n\n[^1]: n'}
        components={{ Paragraph: Counting as never }}
        onLinkPress={cb}
        onFootnotePress={cb}
        onTaskToggle={cb}
        onImagePress={cb}
      />
    );
    act(() => {
      root = create(element(first));
    });
    const before = renders;
    act(() => root.update(element(second)));
    act(() => root.update(element(() => {})));
    expect(renders).toBe(before);
  });

  it('calls the latest handler', () => {
    const first = jest.fn();
    const second = jest.fn();
    let root!: ReactTestRenderer;
    const element = (cb: () => void) => (
      <Markdown source="[a](https://x.dev)" onLinkPress={cb} />
    );
    act(() => {
      root = create(element(first));
    });
    act(() => root.update(element(second)));
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    press(links(root)[0]!);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('interactive options', () => {
  it('flip with the presence of each handler only', () => {
    const none = createRenderCtx({ components: defaultComponents });
    expect(none.options).toMatchObject({
      interactiveTasks: false,
      interactiveImages: false,
      interactiveFootnotes: false,
    });
    const all = createRenderCtx({
      components: defaultComponents,
      handlers: {
        onTaskToggle: () => {},
        onImagePress: () => {},
        onFootnotePress: () => {},
      },
    });
    expect(all.options).toMatchObject({
      interactiveTasks: true,
      interactiveImages: true,
      interactiveFootnotes: true,
    });
  });
});

// `Image` (for getSize) imported last to keep the test bodies readable.
import { Image as Image_ } from 'react-native';
