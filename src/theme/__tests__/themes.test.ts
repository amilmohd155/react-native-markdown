import { darkTheme, lightTheme, resolveTheme } from '../index';

/** WCAG relative luminance contrast ratio of two #rrggbb colors. */
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

describe('built-in themes', () => {
  it('are frozen flat blocks', () => {
    expect(Object.isFrozen(lightTheme)).toBe(true);
    expect(Object.isFrozen(darkTheme)).toBe(true);
    expect(Object.isFrozen(darkTheme.paragraph)).toBe(true);
    expect(Object.isFrozen(darkTheme.codeBlock!.syntax)).toBe(true);
  });

  it('set the same keys, so switching scheme never changes layout', () => {
    expect(Object.keys(darkTheme)).toEqual(Object.keys(lightTheme));
    for (const key of Object.keys(lightTheme) as (keyof typeof lightTheme)[]) {
      expect(Object.keys(darkTheme[key] ?? {})).toEqual(
        Object.keys(lightTheme[key] ?? {})
      );
    }
    expect(darkTheme.paragraph!.color).not.toBe(lightTheme.paragraph!.color);

    const light = resolveTheme({}, 'light');
    const dark = resolveTheme({}, 'dark');
    expect(dark.tokens.fontSize).toEqual(light.tokens.fontSize);
    expect(dark.tokens.spacing).toEqual(light.tokens.spacing);
    expect(dark.headings.map((h) => h.text.fontSize)).toEqual(
      light.headings.map((h) => h.text.fontSize)
    );
    expect(dark.elements.Paragraph.container).toEqual(
      light.elements.Paragraph.container
    );
  });

  it.each([
    ['light', '#ffffff'],
    ['dark', '#0d1117'],
  ] as const)(
    '%s: text on the page and on code/highlight is readable',
    (scheme, page) => {
      const { colors } = resolveTheme({}, scheme).tokens;
      expect(contrast(colors.text, page)).toBeGreaterThanOrEqual(7);
      expect(contrast(colors.link, page)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.muted, page)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.text, colors.codeBg)).toBeGreaterThanOrEqual(7);
      expect(contrast(colors.text, colors.highlight)).toBeGreaterThanOrEqual(
        4.5
      );
    }
  );

  it('resolve to dark element colors', () => {
    const { elements } = resolveTheme({}, 'dark');
    expect(elements.Link.text.color).toBe(darkTheme.link!.color);
    expect(elements.CodeBlock.container.backgroundColor).toBe(
      darkTheme.codeBlock!.backgroundColor
    );
  });

  it('default code colour follows the scheme', () => {
    expect(resolveTheme({}, 'light').elements.CodeBlock.text.color).toBe(
      lightTheme.paragraph!.color
    );
    expect(resolveTheme({}, 'dark').elements.CodeBlock.text.color).toBe(
      darkTheme.paragraph!.color
    );
    // Overriding only the background cannot make code invisible.
    const dark = resolveTheme(
      { codeBlock: { backgroundColor: '#222222' } },
      'dark'
    );
    expect(dark.elements.CodeBlock.text.color).toBe(darkTheme.paragraph!.color);
  });
});
