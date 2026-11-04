import { StyleSheet } from 'react-native';
import {
  ELEMENT_NAMES,
  getDefaultTheme,
  headingFontSize,
  lightTheme,
  resolveTheme,
} from '../index';

describe('resolveTheme', () => {
  it('derives heading sizes from base and scale (40, 33, 28, 23, 19, 16)', () => {
    const sizes = [1, 2, 3, 4, 5, 6].map((n) => headingFontSize(lightTheme, n));
    expect(sizes).toEqual([40, 33, 28, 23, 19, 16]);

    const theme = resolveTheme(lightTheme);
    expect(theme.headings.map((h) => h.text.fontSize)).toEqual(sizes);
    expect(theme.headings.map((h) => h.text.fontWeight)).toEqual([
      '700',
      '700',
      '600',
      '600',
      '600',
      '600',
    ]);
  });

  it('gives every element a text and a container style', () => {
    const theme = resolveTheme(lightTheme);
    for (const name of ELEMENT_NAMES) {
      expect(theme.elements[name].text).toBeDefined();
      expect(theme.elements[name].container).toBeDefined();
    }
  });

  it('keeps inline styles to what they change, so nested Text inherits the rest', () => {
    const { elements } = resolveTheme(lightTheme);
    expect(elements.Strong.text).toEqual({ fontWeight: '700' });
    expect(elements.Emphasis.text).toEqual({ fontStyle: 'italic' });
    expect(elements.Strikethrough.text).toEqual({
      textDecorationLine: 'line-through',
    });
    expect(elements.Link.text).toEqual({
      color: lightTheme.colors.link,
      textDecorationLine: 'underline',
    });
    expect(elements.Superscript.text).toEqual({ fontSize: 12 });
  });

  it('derives block text from tokens', () => {
    const { elements } = resolveTheme(lightTheme);
    expect(elements.Paragraph.text).toEqual({
      fontSize: 16,
      lineHeight: 24,
      color: lightTheme.colors.text,
    });
    expect(elements.Paragraph.container).toEqual({ marginBottom: 12 });
  });

  it('follows token changes', () => {
    const theme = resolveTheme({
      ...lightTheme,
      colors: { ...lightTheme.colors, link: 'red' },
      fontSize: { base: 20, scale: 1.2 },
    });
    expect(theme.elements.Link.text.color).toBe('red');
    expect(theme.elements.Paragraph.text.fontSize).toBe(20);
    expect(theme.headings[5].text.fontSize).toBe(20);
  });

  it('creates all styles with one StyleSheet.create call', () => {
    const spy = jest.spyOn(StyleSheet, 'create');
    resolveTheme(lightTheme);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('resolves the default theme once', () => {
    expect(getDefaultTheme()).toBe(getDefaultTheme());
    expect(Object.isFrozen(getDefaultTheme())).toBe(true);
  });
});
