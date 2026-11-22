import { StyleSheet } from 'react-native';
import {
  SYNTAX_TOKEN_TYPES,
  clearThemeCache,
  darkTheme,
  lightTheme,
  resolveTheme,
  resolveThemeProp,
  type FlatThemeInput,
} from '../index';

// P3-33: `codeBlock.syntax`, a color per syntax token type that follows the
// theme mode (P3a-2: flat input; `tokens.syntax` is the resolved palette).

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

const syntaxOf = (t: typeof lightTheme) => t.codeBlock!.syntax!;

beforeEach(() => clearThemeCache());

describe('built-in syntax palettes', () => {
  it.each(BUILT_INS)('%s defines every type, frozen', (_n, t) => {
    expect(Object.keys(syntaxOf(t)).sort()).toEqual(
      [...SYNTAX_TOKEN_TYPES].sort()
    );
    expect(Object.isFrozen(syntaxOf(t))).toBe(true);
  });

  it.each(BUILT_INS)(
    '%s: every type is >= 4.5:1 on the code background',
    (_n, t) => {
      for (const type of SYNTAX_TOKEN_TYPES) {
        const ratio = contrast(
          syntaxOf(t)[type]!,
          t.codeBlock!.backgroundColor as string
        );
        expect([type, ratio >= 4.5]).toEqual([type, true]);
      }
    }
  );

  it.each(BUILT_INS)('%s: plain is the code text color', (n) => {
    const resolved = resolveTheme({}, n);
    expect(resolved.tokens.syntax.plain).toBe(
      resolved.elements.CodeBlock.text.color
    );
  });

  it('light and dark palettes differ', () => {
    expect(syntaxOf(darkTheme)).not.toEqual(syntaxOf(lightTheme));
  });
});

describe('syntax through the theme prop', () => {
  it("'light', 'dark' and 'auto' pick the palette of the scheme", () => {
    const palette = (
      p: Parameters<typeof resolveThemeProp>[0],
      s: 'light' | 'dark'
    ) => resolveThemeProp(p, s).tokens.syntax;
    expect(palette('light', 'dark')).toEqual(syntaxOf(lightTheme));
    expect(palette('dark', 'light')).toEqual(syntaxOf(darkTheme));
    expect(palette('auto', 'light')).toEqual(syntaxOf(lightTheme));
    expect(palette('auto', 'dark')).toEqual(syntaxOf(darkTheme));
  });

  it('a partial override merges per key onto the scheme palette', () => {
    const input: FlatThemeInput = {
      codeBlock: { syntax: { keyword: '#ff0000' } },
    };
    const light = resolveThemeProp(input, 'light').tokens.syntax;
    const dark = resolveThemeProp(input, 'dark').tokens.syntax;
    expect(light).toEqual({ ...syntaxOf(lightTheme), keyword: '#ff0000' });
    expect(dark).toEqual({ ...syntaxOf(darkTheme), keyword: '#ff0000' });
    expect(Object.isFrozen(light)).toBe(true);
  });

  it('an undefined value keeps the default', () => {
    const { syntax } = resolveThemeProp(
      { codeBlock: { syntax: { string: undefined } } },
      'dark'
    ).tokens;
    expect(syntax.string).toBe(syntaxOf(darkTheme).string);
  });

  it('a custom paragraph colour leaves the syntax defaults alone', () => {
    const { syntax } = resolveThemeProp(
      { paragraph: { color: '#000000' } },
      'light'
    ).tokens;
    expect(syntax).toEqual(syntaxOf(lightTheme));
  });

  it('a custom codeBlock colour moves only the base-colour types', () => {
    const { syntax } = resolveThemeProp(
      { codeBlock: { color: '#000000' } },
      'light'
    ).tokens;
    expect(syntax).toEqual({
      ...syntaxOf(lightTheme),
      operator: '#000000',
      punctuation: '#000000',
      variable: '#000000',
      embedded: '#000000',
      plain: '#000000',
    });
  });

  it('a scheme block merges its palette over the top-level one', () => {
    const input: FlatThemeInput = {
      codeBlock: { syntax: { comment: '#00ff00', keyword: '#111111' } },
      dark: { codeBlock: { syntax: { keyword: '#222222' } } },
    };
    expect(resolveThemeProp(input, 'dark').tokens.syntax).toEqual({
      ...syntaxOf(darkTheme),
      comment: '#00ff00',
      keyword: '#222222',
    });
    expect(resolveThemeProp(input, 'light').tokens.syntax.keyword).toBe(
      '#111111'
    );
  });

  it('themes differing only in syntax do not share a cache entry', () => {
    const spy = jest.spyOn(StyleSheet, 'create');
    try {
      const a = resolveThemeProp(
        { codeBlock: { syntax: { keyword: '#111111' } } },
        'light'
      );
      const b = resolveThemeProp(
        { codeBlock: { syntax: { keyword: '#222222' } } },
        'light'
      );
      expect(b).not.toBe(a);
      expect(a.tokens.syntax.keyword).toBe('#111111');
      expect(b.tokens.syntax.keyword).toBe('#222222');
      // An equal inline literal hits.
      expect(
        resolveThemeProp(
          { codeBlock: { syntax: { keyword: '#111111' } } },
          'light'
        )
      ).toBe(a);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects unknown token types', () => {
    const input: FlatThemeInput = {
      // @ts-expect-error: not a syntax token type
      codeBlock: { syntax: { regex: '#000000' } },
    };
    expect(input).toBeDefined();
  });
});
