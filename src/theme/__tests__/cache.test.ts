import { StyleSheet } from 'react-native';
import {
  clearThemeCache,
  createTheme,
  darkTheme,
  getDefaultTheme,
  lightTheme,
  resolveThemeProp,
  type ElementOverrides,
  type ThemeInput,
} from '../index';

let createSpy: jest.SpyInstance;

beforeEach(() => {
  clearThemeCache();
  createSpy = jest.spyOn(StyleSheet, 'create');
});

afterEach(() => {
  createSpy.mockRestore();
});

describe('resolveThemeProp: built-in themes', () => {
  it('resolves each scheme once and keeps it', () => {
    expect(resolveThemeProp('light', 'dark')).toBe(getDefaultTheme());
    const dark = resolveThemeProp('dark', 'light');
    expect(dark).toBe(resolveThemeProp('dark', 'dark'));
    expect(dark.tokens.colors).toEqual(darkTheme.colors);
    // clearing the user cache doesn't drop built-ins
    clearThemeCache();
    expect(resolveThemeProp('dark', 'light')).toBe(dark);
  });

  it("'auto' is the built-in theme of the current scheme", () => {
    expect(resolveThemeProp('auto', 'light')).toBe(getDefaultTheme());
    expect(resolveThemeProp('auto', 'dark')).toBe(
      resolveThemeProp('dark', 'light')
    );
  });

  it('switching scheme swaps between two cached themes, creating nothing', () => {
    const light = resolveThemeProp('auto', 'light');
    const dark = resolveThemeProp('auto', 'dark');
    createSpy.mockClear();
    for (let i = 0; i < 5; i++) {
      expect(resolveThemeProp('auto', 'light')).toBe(light);
      expect(resolveThemeProp('auto', 'dark')).toBe(dark);
    }
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('resolveThemeProp: user themes', () => {
  it('reuses the resolved theme for a structurally equal input (done-when)', () => {
    // Fresh object literals every call, as in an inline `theme={{ … }}`.
    const make = (): ThemeInput => ({
      colors: { link: 'red' },
      fonts: { body: { regular: 'R', bold: 'B' } },
      spacing: { block: 8 },
      listBullets: ['-', '*'],
      elements: { Link: { text: { fontSize: 20 }, container: { margin: 1 } } },
    });
    const first = resolveThemeProp(make(), 'light');
    expect(createSpy).toHaveBeenCalledTimes(1);
    const second = resolveThemeProp(make(), 'light');
    expect(second).toBe(first);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves again when any token changes', () => {
    const base = resolveThemeProp({ colors: { link: 'red' } }, 'light');
    createSpy.mockClear();
    const changed = [
      { colors: { link: 'blue' } },
      { colors: { link: 'red', text: 'x' } },
      { colors: { link: 'red' }, fontSize: { base: 18 } },
      { colors: { link: 'red' }, lineHeight: 1.3 },
      { colors: { link: 'red' }, listBullets: ['-'] },
      { colors: { link: 'red' }, fonts: { body: { regular: 'R' } } },
      { colors: { link: 'red' }, elements: { Link: { text: { color: 'x' } } } },
    ] satisfies ThemeInput[];
    for (const input of changed) {
      expect(resolveThemeProp(input, 'light')).not.toBe(base);
    }
    expect(createSpy).toHaveBeenCalledTimes(changed.length);
  });

  it('treats a missing group and an empty one as equal', () => {
    const a = resolveThemeProp({ colors: {} }, 'light');
    expect(resolveThemeProp({}, 'light')).toBe(a);
    expect(resolveThemeProp({ elements: {} }, 'light')).toBe(a);
  });

  it("keys on the color scheme, merging onto that scheme's base", () => {
    const input: ThemeInput = { colors: { link: 'red' } };
    const light = resolveThemeProp(input, 'light');
    const dark = resolveThemeProp(input, 'dark');
    expect(dark).not.toBe(light);
    expect(light.tokens.colors.text).toBe(lightTheme.colors.text);
    expect(dark.tokens.colors.text).toBe(darkTheme.colors.text);
    expect(dark.elements.Link.text.color).toBe('red');
    expect(resolveThemeProp(input, 'dark')).toBe(dark);
  });

  it('accepts a createTheme result and an equal one hits the cache', () => {
    const a = resolveThemeProp(
      createTheme({
        colors: { link: 'red' },
        elements: { Link: { text: { fontSize: 9 } } },
      }),
      'light'
    );
    const b = resolveThemeProp(
      createTheme({
        colors: { link: 'red' },
        elements: { Link: { text: { fontSize: 9 } } },
      }),
      'light'
    );
    expect(b).toBe(a);
    expect(a.elements.Link.text).toMatchObject({ color: 'red', fontSize: 9 });
  });

  it('compares Heading functions by identity', () => {
    const fn = () => ({ text: { color: 'red' } });
    const a = resolveThemeProp({ elements: { Heading: fn } }, 'light');
    expect(resolveThemeProp({ elements: { Heading: fn } }, 'light')).toBe(a);
    expect(
      resolveThemeProp(
        { elements: { Heading: () => ({ text: { color: 'red' } }) } },
        'light'
      )
    ).not.toBe(a);
  });
});

describe('resolveThemeProp: plugin themes', () => {
  const layerA: ElementOverrides = { Link: { text: { letterSpacing: 1 } } };
  const layerB: ElementOverrides = { Link: { text: { letterSpacing: 2 } } };

  it('are part of the key, by layer identity and order', () => {
    const input: ThemeInput = { colors: { link: 'red' } };
    const none = resolveThemeProp(input, 'light');
    const withA = resolveThemeProp(input, 'light', [layerA]);
    expect(withA).not.toBe(none);
    expect(withA.elements.Link.text.letterSpacing).toBe(1);
    // same layers (a fresh array of the same objects) hit
    expect(resolveThemeProp(input, 'light', [layerA])).toBe(withA);
    // other layer / order miss
    expect(resolveThemeProp(input, 'light', [layerB])).not.toBe(withA);
    const ab = resolveThemeProp(input, 'light', [layerA, layerB]);
    const ba = resolveThemeProp(input, 'light', [layerB, layerA]);
    expect(ab).not.toBe(ba);
    expect(ab.elements.Link.text.letterSpacing).toBe(2);
    expect(ba.elements.Link.text.letterSpacing).toBe(1);
  });

  it('give built-in themes with plugins their own cached entry', () => {
    const plain = resolveThemeProp('light', 'light');
    const withPlugin = resolveThemeProp('light', 'light', [layerA]);
    expect(withPlugin).not.toBe(plain);
    expect(resolveThemeProp('light', 'light', [layerA])).toBe(withPlugin);
    expect(resolveThemeProp('light', 'light')).toBe(plain);
  });
});

describe('resolveThemeProp: bounded cache', () => {
  it('keeps recently used themes and drops the least recently used', () => {
    const themeN = (n: number): ThemeInput => ({ spacing: { block: n } });
    const first = resolveThemeProp(themeN(0), 'light');
    for (let n = 1; n <= 16; n++) resolveThemeProp(themeN(n), 'light');
    // 17 distinct themes went through a cache of 16: the first is gone.
    expect(resolveThemeProp(themeN(0), 'light')).not.toBe(first);

    // A hit refreshes: touch theme 5, then push 15 more; 5 survives.
    const five = resolveThemeProp(themeN(5), 'light');
    for (let n = 100; n < 115; n++) {
      resolveThemeProp(themeN(n), 'light');
      resolveThemeProp(themeN(5), 'light');
    }
    expect(resolveThemeProp(themeN(5), 'light')).toBe(five);
  });
});
