import { resolveTheme } from '../../theme';
import { createLru } from '../lru';
import { cachedColumnWidths, storeColumnWidths } from '../tableLayout';

const MAX = 200;

function fill(theme: ReturnType<typeof resolveTheme>) {
  for (let i = 0; i < MAX; i++) storeColumnWidths(theme, `k${i}`, [i]);
}

describe('table width cache (LRU)', () => {
  it('evicts the least recently used entry at 200', () => {
    const theme = resolveTheme({});
    fill(theme);
    storeColumnWidths(theme, 'extra', [1]);
    expect(cachedColumnWidths(theme, 'k0')).toBeNull();
    expect(cachedColumnWidths(theme, 'k1')).toEqual([1]);
    expect(cachedColumnWidths(theme, 'extra')).toEqual([1]);
  });

  it('does not refresh an entry on read (reads happen in render)', () => {
    const theme = resolveTheme({});
    fill(theme);
    expect(cachedColumnWidths(theme, 'k0')).toEqual([0]);
    storeColumnWidths(theme, 'extra', [1]);
    expect(cachedColumnWidths(theme, 'k0')).toBeNull();
    expect(cachedColumnWidths(theme, 'k1')).toEqual([1]);
  });

  it('refreshes an entry on re-store', () => {
    const theme = resolveTheme({});
    fill(theme);
    storeColumnWidths(theme, 'k0', [99]);
    storeColumnWidths(theme, 'extra', [1]);
    expect(cachedColumnWidths(theme, 'k0')).toEqual([99]);
    expect(cachedColumnWidths(theme, 'k1')).toBeNull();
    expect(cachedColumnWidths(theme, 'k2')).toEqual([2]);
  });

  it('keeps themes isolated', () => {
    const a = resolveTheme({});
    const b = resolveTheme({});
    fill(a);
    storeColumnWidths(b, 'k0', [5]);
    storeColumnWidths(b, 'extra', [6]);
    expect(cachedColumnWidths(a, 'k0')).toEqual([0]);
    expect(cachedColumnWidths(b, 'k0')).toEqual([5]);
    expect(cachedColumnWidths(b, 'k1')).toBeNull();
  });
});

describe('createLru', () => {
  it('peek does not refresh', () => {
    const lru = createLru<number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    expect(lru.peek('a')).toBe(1);
    lru.set('c', 3);
    expect(lru.peek('a')).toBeUndefined();
    expect(lru.peek('b')).toBe(2);
  });

  it('delete and clear', () => {
    const lru = createLru<number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.delete('a');
    expect(lru.get('a')).toBeUndefined();
    lru.clear();
    expect(lru.get('b')).toBeUndefined();
  });
});
