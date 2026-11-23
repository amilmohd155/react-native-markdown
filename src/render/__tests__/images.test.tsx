import { AccessibilityInfo, Animated, Image, StyleSheet } from 'react-native';
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
import { createTheme, resolveTheme } from '../../theme';
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

  it('reserves the theme imageRatio box while the size is unknown', async () => {
    getSize.mockReturnValue(new Promise(() => {}));
    await mount('![a](photo.png)\n', {
      theme: resolveTheme(createTheme({ image: { aspectRatio: 2 } })),
    });
    expect(imageStyle()).toMatchObject({
      aspectRatio: 2,
      backgroundColor: expect.any(String),
    });
    expect(frameMaxWidth()).toBeUndefined();
  });

  it('shows no placeholder and no second lookup when cached', async () => {
    getSize.mockResolvedValue({ width: 200, height: 100 });
    await loadImageSize('warm.png');
    getSize.mockClear();
    await mount('![a](warm.png)\n');
    expect(imageStyle()).toMatchObject({ aspectRatio: 2 });
    expect(imageStyle()).not.toHaveProperty('backgroundColor');
    await act(async () => {});
    expect(getSize).not.toHaveBeenCalled();
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

describe('image cache polish (P3-36)', () => {
  const provided = { 'p.png': { width: 200, height: 100 } };
  let timing: jest.SpyInstance;
  beforeEach(() => {
    timing = jest.spyOn(Animated, 'timing');
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
  });
  afterEach(() => {
    timing.mockRestore();
    jest.restoreAllMocks();
  });

  const load = async () => {
    await fireEvent(theImage(), 'load');
    await act(async () => {});
  };

  it('renders a provided size at its ratio with no lookup (block)', async () => {
    await mount('![a](p.png)\n', { imageSizes: provided });
    expect(imageStyle()).toMatchObject({ aspectRatio: 2 });
    expect(imageStyle()).not.toHaveProperty('backgroundColor');
    expect(frameMaxWidth()).toBe(200);
    await act(async () => {});
    expect(getSize).not.toHaveBeenCalled();
  });

  it('renders a provided size with no lookup (inline)', async () => {
    await mount('see ![i](p.png) here\n', {
      imageSizes: { 'p.png': { width: 12, height: 10 } },
    });
    expect(imageStyle()).toEqual({ width: 12, height: 10 });
    await act(async () => {});
    expect(getSize).not.toHaveBeenCalled();
  });

  it('clears busy on an inline image once its size is known', async () => {
    const d = deferred<{ width: number; height: number }>();
    getSize.mockReturnValue(d.promise);
    await mount('see ![i](late.png) here\n');
    expect(theImage().props.accessibilityState).toEqual({ busy: true });
    expect(theImage().props['aria-busy']).toBe(true);
    d.resolve({ width: 12, height: 10 });
    await act(async () => {});
    expect(theImage().props.accessibilityState).toEqual({ busy: false });
    expect(theImage().props['aria-busy']).toBeUndefined();
  });

  it('is not busy once an inline lookup has failed', async () => {
    const d = deferred<{ width: number; height: number }>();
    getSize.mockReturnValue(d.promise);
    await mount('see ![i](nope.png) here\n');
    expect(theImage().props.accessibilityState).toEqual({ busy: true });
    d.reject(new Error('404'));
    await act(async () => {});
    expect(theImage().props.accessibilityState).toEqual({ busy: false });
    expect(theImage().props['aria-busy']).toBeUndefined();
  });

  it('reports a failed inline image once', async () => {
    const onImageError = jest.fn();
    const d = deferred<{ width: number; height: number }>();
    getSize.mockReturnValue(d.promise);
    await mount('see ![i](gone.png "T") here\n', {
      handlers: { onImageError },
    });
    d.reject(new Error('404'));
    await act(async () => {});
    expect(onImageError).toHaveBeenCalledTimes(1);
    expect(onImageError).toHaveBeenCalledWith({
      src: 'gone.png',
      alt: 'i',
      title: 'T',
    });
  });

  it('does not fade a provided or cached size', async () => {
    await mount('![a](p.png)\n', { imageSizes: provided });
    await load();
    expect(timing).not.toHaveBeenCalled();
    await screen.unmount();

    getSize.mockResolvedValue({ width: 10, height: 10 });
    await loadImageSize('c.png');
    await mount('![a](c.png)\n');
    await load();
    expect(timing).not.toHaveBeenCalled();
  });

  it('fades in on load when the size was unknown', async () => {
    getSize.mockResolvedValue({ width: 10, height: 10 });
    await mount('![a](f.png)\n');
    await act(async () => {});
    expect(timing).not.toHaveBeenCalled();
    await load();
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, duration: 150 })
    );
  });

  it('does not fade with fadeDuration 0', async () => {
    getSize.mockResolvedValue({ width: 10, height: 10 });
    await mount('![a](z.png)\n', {
      theme: resolveTheme(createTheme({ image: { fadeDuration: 0 } })),
    });
    await act(async () => {});
    await load();
    expect(timing).not.toHaveBeenCalled();
  });

  it('does not fade with reduce motion on', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    getSize.mockResolvedValue({ width: 10, height: 10 });
    await mount('![a](r.png)\n');
    await act(async () => {});
    await load();
    expect(timing).not.toHaveBeenCalled();
  });

  it('is busy while loading and hides an empty alt', async () => {
    getSize.mockReturnValue(new Promise(() => {}));
    await mount('![](d.png)\n');
    expect(theImage().props.accessibilityState).toEqual({ busy: true });
    expect(theImage().props.accessible).toBe(false);
    expect(theImage().props['aria-hidden']).toBe(true);
  });

  it('keeps an image with alt text accessible', async () => {
    await mount('![a](p.png)\n', { imageSizes: provided });
    expect(theImage().props.accessible).toBeUndefined();
    expect(theImage().props.accessibilityState).toEqual({ busy: false });
    expect(theImage().props['aria-busy']).toBeUndefined();
  });

  it('draws a visible hairline on the placeholder only', async () => {
    const d = deferred<{ width: number; height: number }>();
    getSize.mockReturnValue(d.promise);
    await mount('![a](hair.png)\n');
    expect(imageStyle()).toMatchObject({
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: expect.any(String),
    });
    d.resolve({ width: 20, height: 10 });
    await act(async () => {});
    await load();
    expect(imageStyle()).not.toHaveProperty('borderWidth');
  });

  it('reports again when a remount retries an expired error', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const first = jest.fn();
    getSize.mockRejectedValue(new Error('404'));
    await mount('![Broken](x.png)\n', { handlers: { onImageError: first } });
    await act(async () => {});
    expect(first).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 61_000);
    const second = jest.fn();
    await mount('![Broken](x.png)\n', { handlers: { onImageError: second } });
    await act(async () => {});
    expect(getSize).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not report a cached error again on remount', async () => {
    const onImageError = jest.fn();
    getSize.mockRejectedValue(new Error('404'));
    await mount('![Broken](c.png)\n', { handlers: { onImageError } });
    await act(async () => {});
    expect(onImageError).toHaveBeenCalledTimes(1);
    await mount('![Broken](c.png)\n', { handlers: { onImageError } });
    await act(async () => {});
    expect(onImageError).toHaveBeenCalledTimes(1);
  });

  it('retries a failed image on press and reports the error once', async () => {
    const onImageError = jest.fn();
    // The first lookup fails after mount (as a network failure does); the
    // retry fails at once.
    const first = deferred<{ width: number; height: number }>();
    getSize
      .mockReturnValueOnce(first.promise)
      .mockRejectedValue(new Error('404'));
    await mount('![Broken](b.png "T")\n', {
      handlers: { onImageError, onImagePress: jest.fn() },
    });
    first.reject(new Error('404'));
    await act(async () => {});
    expect(onImageError).toHaveBeenCalledTimes(1);
    expect(onImageError).toHaveBeenCalledWith({
      src: 'b.png',
      alt: 'Broken',
      title: 'T',
    });
    expect(screen.queryAllByRole('imagebutton')).toHaveLength(0);
    expect(getSize).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button'));
    await act(async () => {});
    expect(getSize).toHaveBeenCalledTimes(2);
    expect(onImageError).toHaveBeenCalledTimes(2);
  });
});
