import { Image, Pressable, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BlockList } from '../Block';
import { createRenderCtx, type RenderCtxInput } from '../context';
import { defaultComponents } from '../defaults';
import {
  cachedImageSize,
  clearImageSizeCache,
  loadImageSize,
} from '../imageSize';
import { tableFor } from './helpers';

let getSize: jest.SpyInstance;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function render(
  source: string,
  input: Omit<RenderCtxInput, 'components'> = {}
) {
  const ctx = createRenderCtx({ ...input, components: defaultComponents });
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<BlockList table={tableFor(source)} ctx={ctx} />);
  });
  return root;
}

const imageStyle = (root: ReactTestRenderer) =>
  StyleSheet.flatten(root.root.findByType(Image).props.style) as Record<
    string,
    unknown
  >;

/** maxWidth of the frame View around a block image. */
const frameMaxWidth = (root: ReactTestRenderer) => {
  let node = root.root.findByType(Image).parent;
  while (node !== null && node.type !== ('View' as never)) node = node.parent;
  return (StyleSheet.flatten(node?.props.style) as { maxWidth?: number })
    .maxWidth;
};

beforeEach(() => {
  clearImageSizeCache();
  getSize = jest.spyOn(Image, 'getSize');
});
afterEach(() => getSize.mockRestore());

describe('image size cache', () => {
  it('requests each URL once, even with concurrent lookups', async () => {
    const d = deferred<{ width: number; height: number }>();
    getSize.mockReturnValue(d.promise);
    const a = loadImageSize('x.png');
    const b = loadImageSize('x.png');
    d.resolve({ width: 40, height: 20 });
    expect(await a).toEqual({ width: 40, height: 20 });
    expect(await b).toBe(await a);
    expect(getSize).toHaveBeenCalledTimes(1);
    expect(cachedImageSize('x.png')).toEqual({ width: 40, height: 20 });
  });

  it('caches failures and empty sizes as errors', async () => {
    getSize.mockRejectedValueOnce(new Error('404'));
    getSize.mockResolvedValueOnce({ width: 0, height: 0 });
    expect(await loadImageSize('broken.png')).toBe('error');
    expect(await loadImageSize('empty.png')).toBe('error');
    expect(await loadImageSize('broken.png')).toBe('error');
    expect(getSize).toHaveBeenCalledTimes(2);
  });
});

describe('block Image', () => {
  it('holds a placeholder box, then takes the real aspect ratio', async () => {
    const d = deferred<{ width: number; height: number }>();
    getSize.mockReturnValue(d.promise);
    const root = render('![a](photo.png)\n');
    expect(imageStyle(root)).toMatchObject({
      width: '100%',
      aspectRatio: 16 / 9,
    });

    await act(async () => d.resolve({ width: 400, height: 100 }));
    expect(imageStyle(root)).toMatchObject({ width: '100%', aspectRatio: 4 });
    // The natural width caps the frame, not the image (Yoga aspect ratio).
    expect(frameMaxWidth(root)).toBe(400);
  });

  it('renders synchronously from the cache on later mounts', async () => {
    getSize.mockResolvedValue({ width: 300, height: 300 });
    await loadImageSize('cached.png');
    const root = render('![a](cached.png)\n');
    expect(imageStyle(root)).toMatchObject({ aspectRatio: 1 });
    expect(frameMaxWidth(root)).toBe(300);
  });

  it('shows the alt text when the image fails', async () => {
    getSize.mockRejectedValue(new Error('404'));
    const root = render('![A broken photo](broken.png)\n');
    await act(async () => {});
    expect(root.root.findAllByType(Image)).toHaveLength(0);
    expect(JSON.stringify(root.toJSON())).toContain('A broken photo');
  });

  it('is pressable only with onImagePress', async () => {
    getSize.mockResolvedValue({ width: 10, height: 10 });
    await loadImageSize('i.png');
    expect(render('![a](i.png)\n').root.findAllByType(Pressable)).toHaveLength(
      0
    );

    const onImagePress = jest.fn();
    const root = render('![alt](i.png "T")\n', { handlers: { onImagePress } });
    act(() => root.root.findByType(Pressable).props.onPress());
    expect(onImagePress).toHaveBeenCalledWith('i.png', {
      alt: 'alt',
      title: 'T',
    });
  });
});

describe('InlineImage', () => {
  it('uses a line-height square while loading', () => {
    getSize.mockReturnValue(new Promise(() => {}));
    const root = render('see ![i](icon.png) here\n');
    expect(imageStyle(root)).toEqual({ width: 24, height: 24 });
  });

  it('scales a loaded size down to the line height', async () => {
    getSize.mockResolvedValue({ width: 96, height: 48 });
    const root = render('see ![i](wide.png) here\n');
    await act(async () => {});
    expect(imageStyle(root)).toEqual({ width: 48, height: 24 });
  });

  it('keeps small images at their natural size', async () => {
    getSize.mockResolvedValue({ width: 12, height: 10 });
    await loadImageSize('small.png');
    // Already cached: the renderer passes the size as props.
    const root = render('see ![i](small.png) here\n');
    expect(imageStyle(root)).toEqual({ width: 12, height: 10 });
  });
});
