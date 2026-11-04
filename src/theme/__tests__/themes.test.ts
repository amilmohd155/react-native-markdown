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
  it('are frozen', () => {
    expect(Object.isFrozen(lightTheme)).toBe(true);
    expect(Object.isFrozen(darkTheme)).toBe(true);
    expect(Object.isFrozen(darkTheme.colors)).toBe(true);
  });

  it('differ in colors only, so switching scheme never changes layout', () => {
    expect(darkTheme.colors).not.toEqual(lightTheme.colors);
    expect(Object.keys(darkTheme.colors)).toEqual(
      Object.keys(lightTheme.colors)
    );
    expect({ ...darkTheme, colors: lightTheme.colors }).toEqual(lightTheme);
  });

  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)(
    '%s: text on the page and on code/highlight is readable',
    (_n, t) => {
      const page = _n === 'light' ? '#ffffff' : '#0d1117';
      expect(contrast(t.colors.text, page)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.colors.link, page)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.colors.muted, page)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.colors.text, t.colors.codeBg)).toBeGreaterThanOrEqual(
        7
      );
      expect(
        contrast(t.colors.text, t.colors.highlight)
      ).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('resolve to dark element colors', () => {
    const { elements } = resolveTheme(darkTheme);
    expect(elements.Link.text.color).toBe(darkTheme.colors.link);
    expect(elements.CodeBlock.container.backgroundColor).toBe(
      darkTheme.colors.codeBg
    );
  });
});
