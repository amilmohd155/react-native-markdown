import { StyleSheet } from 'react-native';
import {
  clearThemeCache,
  createTheme,
  darkTheme,
  getDefaultTheme,
  lightTheme,
  resolveThemeProp,
  type FlatThemeBlock,
  type FlatThemeInput,
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
    expect(dark.tokens.colors.text).toBe(darkTheme.paragraph!.color);
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
    const make = (): FlatThemeInput => ({
      link: { color: 'red' },
      paragraph: { fontFamily: { regular: 'R', bold: 'B' }, fontSize: 18 },
      list: { bullets: ['-', '*'] },
      codeBlock: { syntax: { keyword: '#111111' }, padding: 4 },
      checkbox: { checkedText: { opacity: 0.5 } },
      dark: {
        link: { variants: { '^u:': { color: 'blue' } } },
        blockquote: { admonitions: { note: { color: 'x' } } },
      },
    });
    const first = resolveThemeProp(make(), 'light');
    expect(createSpy).toHaveBeenCalledTimes(1);
    const second = resolveThemeProp(make(), 'light');
    expect(second).toBe(first);
    expect(createSpy).toHaveBeenCalledTimes(1);
    // the scheme blocks are compared at depth too
    const dark = resolveThemeProp(make(), 'dark');
    expect(resolveThemeProp(make(), 'dark')).toBe(dark);
  });

  it('resolves again when any value changes', () => {
    const base = resolveThemeProp({ link: { color: 'red' } }, 'light');
    createSpy.mockClear();
    const changed = [
      { link: { color: 'blue' } },
      { link: { color: 'red', fontWeight: '700' } },
      { link: { color: 'red' }, paragraph: { fontSize: 18 } },
      { link: { color: 'red' }, list: { bullets: ['-'] } },
      { link: { color: 'red' }, paragraph: { fontFamily: { regular: 'R' } } },
      { link: { color: 'red' }, codeBlock: { syntax: { keyword: 'x' } } },
      { link: { color: 'red' }, dark: { link: { color: 'x' } } },
      { link: { color: 'red' }, strong: { color: 'x' } },
    ] satisfies FlatThemeInput[];
    for (const input of changed) {
      expect(resolveThemeProp(input, 'light')).not.toBe(base);
    }
    expect(createSpy).toHaveBeenCalledTimes(changed.length);
  });

  it('tells keys apart even when the counts match', () => {
    expect(resolveThemeProp({ link: { color: 'red' } }, 'light')).not.toBe(
      resolveThemeProp({ paragraph: { color: 'red' } }, 'light')
    );
    expect(
      resolveThemeProp({ paragraph: { fontFamily: { regular: 'R' } } }, 'light')
    ).not.toBe(
      resolveThemeProp(
        { paragraph: { fontFamily: { regular: 'R', bold: 'B' } } },
        'light'
      )
    );
  });

  it('compares checkbox, its checkedText and the bullets by value', () => {
    const a = resolveThemeProp(
      { checkbox: { color: 'red', checkedText: { opacity: 0.5 } } },
      'light'
    );
    expect(
      resolveThemeProp(
        { checkbox: { color: 'red', checkedText: { opacity: 0.5 } } },
        'light'
      )
    ).toBe(a);
    expect(
      resolveThemeProp(
        { checkbox: { color: 'red', checkedText: { opacity: 0.4 } } },
        'light'
      )
    ).not.toBe(a);
    expect(
      resolveThemeProp(
        { checkbox: { color: 'red', checkedText: false } },
        'light'
      )
    ).not.toBe(a);
    const b = resolveThemeProp({ list: { bullets: ['-', '*'] } }, 'light');
    expect(resolveThemeProp({ list: { bullets: ['-', '*'] } }, 'light')).toBe(
      b
    );
    expect(
      resolveThemeProp({ list: { bullets: ['-', '+'] } }, 'light')
    ).not.toBe(b);
    expect(resolveThemeProp({ list: { bullets: ['-'] } }, 'light')).not.toBe(b);
  });

  it("keys on the color scheme, merging onto that scheme's base", () => {
    const input: FlatThemeInput = { link: { color: 'red' } };
    const light = resolveThemeProp(input, 'light');
    const dark = resolveThemeProp(input, 'dark');
    expect(dark).not.toBe(light);
    expect(light.tokens.colors.text).toBe(lightTheme.paragraph!.color);
    expect(dark.tokens.colors.text).toBe(darkTheme.paragraph!.color);
    expect(dark.elements.Link.text.color).toBe('red');
    expect(resolveThemeProp(input, 'dark')).toBe(dark);
  });

  it('merges the dark/light block for the active scheme, auto switching included', () => {
    const input: FlatThemeInput = {
      link: { color: 'top' },
      dark: { link: { color: 'dark' } },
    };
    expect(resolveThemeProp(input, 'light').elements.Link.text.color).toBe(
      'top'
    );
    expect(resolveThemeProp(input, 'dark').elements.Link.text.color).toBe(
      'dark'
    );
    createSpy.mockClear();
    for (let i = 0; i < 3; i++) {
      resolveThemeProp(input, 'light');
      resolveThemeProp(input, 'dark');
    }
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('accepts a createTheme result and an equal one hits the cache', () => {
    const make = () =>
      createTheme({ link: { color: 'red', fontWeight: '700' } });
    const a = resolveThemeProp(make(), 'light');
    expect(resolveThemeProp(make(), 'light')).toBe(a);
    expect(a.elements.Link.text).toMatchObject({
      color: 'red',
      fontWeight: '700',
    });
    // an inline literal equal to a createTheme copy hits too
    expect(
      resolveThemeProp({ link: { color: 'red', fontWeight: '700' } }, 'light')
    ).toBe(a);
  });
});

describe('resolveThemeProp: plugin themes', () => {
  const layerA: FlatThemeBlock = { link: { fontWeight: '100' } };
  const layerB: FlatThemeBlock = { link: { fontWeight: '200' } };

  it('are part of the key, by layer identity and order', () => {
    const input: FlatThemeInput = { link: { color: 'red' } };
    const none = resolveThemeProp(input, 'light');
    const withA = resolveThemeProp(input, 'light', [layerA]);
    expect(withA).not.toBe(none);
    expect(withA.elements.Link.text.fontWeight).toBe('100');
    // same layers (a fresh array of the same objects) hit
    expect(resolveThemeProp(input, 'light', [layerA])).toBe(withA);
    // other layer / order miss
    expect(resolveThemeProp(input, 'light', [layerB])).not.toBe(withA);
    const ab = resolveThemeProp(input, 'light', [layerA, layerB]);
    const ba = resolveThemeProp(input, 'light', [layerB, layerA]);
    expect(ab).not.toBe(ba);
    expect(ab.elements.Link.text.fontWeight).toBe('200');
    expect(ba.elements.Link.text.fontWeight).toBe('100');
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
    const themeN = (n: number): FlatThemeInput => ({
      paragraph: { marginBottom: n },
    });
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
