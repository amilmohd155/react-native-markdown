import { StyleSheet } from 'react-native';
import {
  SYNTAX_TOKEN_TYPES,
  clearThemeCache,
  createTheme,
  darkTheme,
  lightTheme,
  resolveTheme,
  resolveThemeProp,
  type ThemeInput,
} from '../index';

// P3-33: `tokens.syntax`, a color per syntax token type that follows the
// theme mode.

/** WCAG contrast ratio of two #rrggbb colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const BUILT_INS = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const;

beforeEach(() => clearThemeCache());

describe('built-in syntax palettes', () => {
  it.each(BUILT_INS)('%s defines every type, frozen', (_n, t) => {
    expect(Object.keys(t.syntax).sort()).toEqual(
      [...SYNTAX_TOKEN_TYPES].sort()
    );
    expect(Object.isFrozen(t.syntax)).toBe(true);
  });

  it.each(BUILT_INS)('%s: every type is >= 4.5:1 on codeBg', (_n, t) => {
    for (const type of SYNTAX_TOKEN_TYPES) {
      const ratio = contrast(t.syntax[type], t.colors.codeBg);
      expect([type, ratio >= 4.5]).toEqual([type, true]);
    }
  });

  it.each(BUILT_INS)('%s: plain is the code text color', (_n, t) => {
    expect(t.syntax.plain).toBe(resolveTheme(t).elements.CodeBlock.text.color);
  });

  it('light and dark palettes differ', () => {
    expect(darkTheme.syntax).not.toEqual(lightTheme.syntax);
  });
});

describe('syntax through the theme prop', () => {
  it("'light', 'dark' and 'auto' pick the palette of the scheme", () => {
    expect(resolveThemeProp('light', 'dark').tokens.syntax).toBe(
      lightTheme.syntax
    );
    expect(resolveThemeProp('dark', 'light').tokens.syntax).toBe(
      darkTheme.syntax
    );
    expect(resolveThemeProp('auto', 'light').tokens.syntax).toBe(
      lightTheme.syntax
    );
    expect(resolveThemeProp('auto', 'dark').tokens.syntax).toBe(
      darkTheme.syntax
    );
  });

  it('a partial override merges per key onto the scheme palette', () => {
    const input: ThemeInput = { syntax: { keyword: '#ff0000' } };
    const light = resolveThemeProp(input, 'light').tokens.syntax;
    const dark = resolveThemeProp(input, 'dark').tokens.syntax;
    expect(light).toEqual({ ...lightTheme.syntax, keyword: '#ff0000' });
    expect(dark).toEqual({ ...darkTheme.syntax, keyword: '#ff0000' });
    expect(Object.isFrozen(light)).toBe(true);
  });

  it('an undefined value keeps the default', () => {
    const { syntax } = resolveThemeProp(
      { syntax: { string: undefined } },
      'dark'
    ).tokens;
    expect(syntax.string).toBe(darkTheme.syntax.string);
  });

  it('a custom colors.text leaves the syntax defaults alone', () => {
    const { syntax } = resolveThemeProp(
      { colors: { text: '#000000' } },
      'light'
    ).tokens;
    expect(syntax).toEqual(lightTheme.syntax);
  });

  it('createTheme merges syntax onto its base', () => {
    const t = createTheme({ syntax: { comment: '#00ff00' } }, darkTheme);
    expect(t.syntax).toEqual({ ...darkTheme.syntax, comment: '#00ff00' });
    expect(createTheme({}).syntax).toBe(lightTheme.syntax);
  });

  it('themes differing only in syntax do not share a cache entry', () => {
    const spy = jest.spyOn(StyleSheet, 'create');
    try {
      const a = resolveThemeProp({ syntax: { keyword: '#111111' } }, 'light');
      const b = resolveThemeProp({ syntax: { keyword: '#222222' } }, 'light');
      expect(b).not.toBe(a);
      expect(a.tokens.syntax.keyword).toBe('#111111');
      expect(b.tokens.syntax.keyword).toBe('#222222');
      // An equal inline literal hits.
      expect(
        resolveThemeProp({ syntax: { keyword: '#111111' } }, 'light')
      ).toBe(a);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects unknown token types', () => {
    // @ts-expect-error: not a syntax token type
    const input: ThemeInput = { syntax: { regex: '#000000' } };
    expect(input).toBeDefined();
  });
});
