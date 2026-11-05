import { Image, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { find } from '../../__tests__/tree';
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

async function mount(
  source: string,
  input: Omit<RenderCtxInput, 'components'> = {}
) {
  const ctx = createRenderCtx({ ...input, components: defaultComponents });
  return render(<BlockList table={tableFor(source)} ctx={ctx} />);
}

const theImage = () => find(screen.container, 'Image');

const imageStyle = () =>
  StyleSheet.flatten(theImage().props.style) as Record<string, unknown>;

/** maxWidth of the frame View around a block image. */
const frameMaxWidth = () => {
  let node = theImage().parent;
  while (node !== null && node.type !== 'View') node = node.parent;
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
    await mount('![a](photo.png)\n');
    expect(imageStyle()).toMatchObject({
      width: '100%',
      aspectRatio: 16 / 9,
    });

    await act(async () => d.resolve({ width: 400, height: 100 }));
    expect(imageStyle()).toMatchObject({ width: '100%', aspectRatio: 4 });
    // The natural width caps the frame, not the image (Yoga aspect ratio).
    expect(frameMaxWidth()).toBe(400);
  });

  it('renders synchronously from the cache on later mounts', async () => {
    getSize.mockResolvedValue({ width: 300, height: 300 });
    await loadImageSize('cached.png');
    await mount('![a](cached.png)\n');
    expect(imageStyle()).toMatchObject({ aspectRatio: 1 });
    expect(frameMaxWidth()).toBe(300);
  });

  it('shows the alt text when the image fails', async () => {
    getSize.mockRejectedValue(new Error('404'));
    await mount('![A broken photo](broken.png)\n');
    await act(async () => {});
    expect(screen.container.queryAll((n) => n.type === 'Image')).toHaveLength(
      0
    );
    expect(JSON.stringify(screen.toJSON())).toContain('A broken photo');
  });

  it('is pressable only with onImagePress', async () => {
    getSize.mockResolvedValue({ width: 10, height: 10 });
    await loadImageSize('i.png');
    await mount('![a](i.png)\n');
    expect(screen.queryAllByRole('imagebutton')).toHaveLength(0);
    await screen.unmount();

    const onImagePress = jest.fn();
    await mount('![alt](i.png "T")\n', { handlers: { onImagePress } });
    await fireEvent.press(screen.getByRole('imagebutton'));
    expect(onImagePress).toHaveBeenCalledWith('i.png', {
      alt: 'alt',
      title: 'T',
    });
  });
});

describe('InlineImage', () => {
  it('uses a line-height square while loading', async () => {
    getSize.mockReturnValue(new Promise(() => {}));
    await mount('see ![i](icon.png) here\n');
    expect(imageStyle()).toEqual({ width: 24, height: 24 });
  });

  it('scales a loaded size down to the line height', async () => {
    getSize.mockResolvedValue({ width: 96, height: 48 });
    await mount('see ![i](wide.png) here\n');
    await act(async () => {});
    expect(imageStyle()).toEqual({ width: 48, height: 24 });
  });

  it('keeps small images at their natural size', async () => {
    getSize.mockResolvedValue({ width: 12, height: 10 });
    await loadImageSize('small.png');
    // Already cached: the renderer passes the size as props.
    await mount('see ![i](small.png) here\n');
    expect(imageStyle()).toEqual({ width: 12, height: 10 });
  });
});
