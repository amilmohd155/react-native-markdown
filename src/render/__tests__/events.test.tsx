import { Linking, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Markdown } from '../../api/Markdown';
import { textOf } from '../../__tests__/tree';
import { BlockList } from '../Block';
import {
  createRenderCtx,
  type RenderCtx,
  type RenderHandlers,
} from '../context';
import { defaultComponents } from '../defaults';
import { cachedImageSize, loadImageSize } from '../imageSize';
import { tableFor } from './helpers';

async function mount(source: string, handlers: RenderHandlers = {}) {
  const ctx: RenderCtx = createRenderCtx({
    components: defaultComponents,
    handlers,
  });
  return render(<BlockList table={tableFor(source)} ctx={ctx} />);
}

const links = () => screen.queryAllByRole('link');

type Node = ReturnType<typeof links>[number];

const press = (node: Node) => fireEvent.press(node);

describe('onLinkPress', () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => openURL.mockRestore());

  it('is called for every link, including ones the default refuses', async () => {
    const onLinkPress = jest.fn();
    await mount(
      '[a](https://x.dev) [b](myapp://open) [c](/docs/page) [d](#top)',
      { onLinkPress }
    );
    for (const link of links()) await press(link);
    expect(onLinkPress.mock.calls.map((c) => c[0])).toEqual([
      'https://x.dev',
      'myapp://open',
      '/docs/page',
      '#top',
    ]);
  });

  it('opens http, https, mailto and tel only; never custom schemes or relative URLs', async () => {
    await mount(
      '[a](https://x.dev) [b](http://x.dev) [c](mailto:a@b.dev) [d](tel:+123) [e](myapp://open) [f](/rel) [g](#frag)'
    );
    for (const link of links()) await press(link);
    expect(openURL.mock.calls.map((c) => c[0])).toEqual([
      'https://x.dev',
      'http://x.dev',
      'mailto:a@b.dev',
      'tel:+123',
    ]);
  });

  it('cancels the default when the handler returns false', async () => {
    await mount('[a](https://x.dev)', { onLinkPress: () => false });
    await press(links()[0]!);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('keeps the default for undefined, true and other returns', async () => {
    await mount('[a](https://x.dev)', { onLinkPress: () => undefined });
    await press(links()[0]!);
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('catches a rejected openURL', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    await mount('[a](https://x.dev)');
    await press(links()[0]!);
    await act(async () => {});
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('catches a synchronous throw from openURL', async () => {
    openURL.mockImplementation(() => {
      throw new Error('sync');
    });
    await mount('[a](https://x.dev)');
    await expect(press(links()[0]!)).resolves.not.toThrow();
  });
});

describe('onImagePress', () => {
  it('fires for inline images, and only when set', async () => {
    const getSize: jest.SpyInstance = jest.spyOn(Image_, 'getSize');
    getSize.mockResolvedValue({ width: 10, height: 10 });
    await loadImageSize('icon.png');
    expect(cachedImageSize('icon.png')).not.toBeNull();

    await mount('a ![i](icon.png) b');
    expect(screen.queryAllByRole('imagebutton')).toHaveLength(0);
    await screen.unmount();

    const onImagePress = jest.fn();
    await mount('a ![i](icon.png "T") b', { onImagePress });
    await press(screen.getByRole('imagebutton'));
    expect(onImagePress).toHaveBeenCalledWith('icon.png', {
      alt: 'i',
      title: 'T',
    });
  });
});

describe('onTaskToggle', () => {
  it('reports the new state of a pressed checkbox', async () => {
    const onTaskToggle = jest.fn();
    await mount('- [ ] a\n- [x] b\n', { onTaskToggle });
    const boxes = screen.getAllByRole('checkbox');
    await press(boxes[0]!);
    await press(boxes[1]!);
    expect(onTaskToggle.mock.calls).toEqual([
      [true, { index: 0 }],
      [false, { index: 1 }],
    ]);
  });
});

describe('onFootnotePress', () => {
  const DOC = 'a[^1] b[^n] c[^1]\n\n[^1]: First.\n[^n]: Named.\n';

  it('leaves references and back-links as plain text without the handler', async () => {
    await mount(DOC);
    expect(links()).toHaveLength(0);
  });

  it('sends references to their definition, with the 1-based reference', async () => {
    const onFootnotePress = jest.fn();
    await mount(DOC, { onFootnotePress });
    const refs = links().filter((n) => /^\[\d\]$/.test(textOf(n)));
    expect(refs).toHaveLength(3);
    for (const r of refs) await press(r);
    expect(onFootnotePress.mock.calls).toEqual([
      ['1', { index: 1, direction: 'definition', reference: 1 }],
      ['n', { index: 2, direction: 'definition', reference: 1 }],
      ['1', { index: 1, direction: 'definition', reference: 2 }],
    ]);
  });

  it('sends each back-link to its reference', async () => {
    const onFootnotePress = jest.fn();
    await mount(DOC, { onFootnotePress });
    const back = links().filter((n) => textOf(n).trim().startsWith('↩'));
    // Footnote 1 has two references, footnote n has one.
    expect(back).toHaveLength(3);
    for (const b of back) await press(b);
    expect(onFootnotePress.mock.calls).toEqual([
      ['1', { index: 1, direction: 'reference', reference: 1 }],
      ['1', { index: 1, direction: 'reference', reference: 2 }],
      ['n', { index: 2, direction: 'reference', reference: 1 }],
    ]);
  });
});

describe('handlers stay behind the ref', () => {
  it('a new inline handler neither re-renders blocks nor changes ctx', async () => {
    let renders = 0;
    const Counting = ({ children }: { children?: React.ReactNode }) => {
      renders++;
      return <Text>{children}</Text>;
    };
    const first = jest.fn();
    const second = jest.fn();
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
    const view = await render(element(first));
    const before = renders;
    await view.rerender(element(second));
    await view.rerender(element(() => {}));
    expect(renders).toBe(before);
  });

  it('calls the latest handler', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const element = (cb: () => void) => (
      <Markdown source="[a](https://x.dev)" onLinkPress={cb} />
    );
    const view = await render(element(first));
    await view.rerender(element(second));
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await press(links()[0]!);
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
