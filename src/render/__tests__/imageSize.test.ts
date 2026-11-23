import { renderHook, act } from '@testing-library/react-native';
import { Image } from 'react-native';
import {
  cachedImageSize,
  clearImageSizeCache,
  loadImageSize,
  prefetchImageSizes,
  retryImageSize,
  useImageSize,
} from '../imageSize';

let getSize: jest.SpyInstance;

beforeEach(() => {
  clearImageSizeCache();
  getSize = jest
    .spyOn(Image, 'getSize')
    .mockResolvedValue({ width: 40, height: 20 } as never);
});
afterEach(() => {
  getSize.mockRestore();
  jest.useRealTimers();
});

describe('provided size', () => {
  it('wins over the cache and never calls getSize', async () => {
    const provided = { width: 8, height: 4 };
    expect(cachedImageSize('a.png', provided)).toBe(provided);
    const { result } = await renderHook(() => useImageSize('a.png', provided));
    expect(result.current).toBe(provided);
    expect(getSize).not.toHaveBeenCalled();
  });
});

describe('LRU', () => {
  it('keeps a recently read entry when the bound is exceeded', async () => {
    await loadImageSize('keep.png');
    for (let i = 0; i < 499; i++) await loadImageSize(`f${i}.png`);
    // 500 entries now; keep.png is the oldest. A read refreshes it.
    expect(cachedImageSize('keep.png')).toEqual({ width: 40, height: 20 });
    await loadImageSize('new.png');
    expect(cachedImageSize('keep.png')).toBeDefined();
    expect(cachedImageSize('f0.png')).toBeUndefined();
    expect(cachedImageSize('new.png')).toBeDefined();
  });
});

describe('errors', () => {
  it('expire after 60 s and the next subscribe retries', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    getSize.mockRejectedValueOnce(new Error('404'));
    const { result } = await renderHook(() => useImageSize('bad.png'));
    await act(async () => {});
    expect(result.current).toBe('error');
    expect(getSize).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(59_000);
    expect(await loadImageSize('bad.png')).toBe('error');
    expect(getSize).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2_000);
    // The snapshot stays stable until a lookup starts.
    expect(cachedImageSize('bad.png')).toBe('error');
    await renderHook(() => useImageSize('bad.png'));
    await act(async () => {});
    expect(getSize).toHaveBeenCalledTimes(2);
    expect(cachedImageSize('bad.png')).toEqual({ width: 40, height: 20 });
  });

  it('retryImageSize looks up again and notifies', async () => {
    getSize.mockRejectedValueOnce(new Error('404'));
    const { result } = await renderHook(() => useImageSize('r.png'));
    await act(async () => {});
    expect(result.current).toBe('error');
    await act(async () => {
      retryImageSize('r.png');
    });
    expect(getSize).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ width: 40, height: 20 });
  });
});

describe('prefetchImageSizes', () => {
  it('warms the cache and resolves even on failure', async () => {
    getSize.mockRejectedValueOnce(new Error('404'));
    await expect(prefetchImageSizes(['x.png', 'y.png'])).resolves.toBe(
      undefined
    );
    expect(cachedImageSize('x.png')).toBe('error');
    expect(cachedImageSize('y.png')).toEqual({ width: 40, height: 20 });
  });
});

describe('dedupe', () => {
  it('requests a URL once for concurrent lookups', async () => {
    await Promise.all([loadImageSize('d.png'), loadImageSize('d.png')]);
    expect(getSize).toHaveBeenCalledTimes(1);
  });
});
