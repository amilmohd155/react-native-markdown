import { StyleSheet } from 'react-native';
import {
  ELEMENT_NAMES,
  getDefaultTheme,
  headingFontSize,
  lightTheme,
  resolveTheme,
} from '../index';

describe('resolveTheme', () => {
  it('derives heading sizes from the paragraph size (40, 33, 28, 23, 19, 16)', () => {
    const theme = resolveTheme();
    const sizes = [1, 2, 3, 4, 5, 6].map((n) =>
      headingFontSize(theme.tokens, n)
    );
    expect(sizes).toEqual([40, 33, 28, 23, 19, 16]);

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

  it('lets a heading set its own props, the others still scale', () => {
    const theme = resolveTheme({
      paragraph: { fontSize: 20 },
      h2: { fontSize: 30, color: 'red', marginTop: 3 },
    });
    expect(theme.headings.map((h) => h.text.fontSize)).toEqual([
      50, 30, 35, 29, 24, 20,
    ]);
    expect(theme.headings[1]!.text).toMatchObject({
      color: 'red',
      lineHeight: 38,
    });
    expect(theme.headings[1]!.container).toEqual({
      marginTop: 3,
      marginBottom: 6,
    });
    expect(theme.headings[0]!.text.color).toBe(lightTheme.paragraph!.color);
  });

  it('gives every element a text and a container style', () => {
    const theme = resolveTheme();
    for (const name of ELEMENT_NAMES) {
      expect(theme.elements[name].text).toBeDefined();
      expect(theme.elements[name].container).toBeDefined();
    }
  });

  it('keeps inline styles to what they change, so nested Text inherits the rest', () => {
    const { elements } = resolveTheme();
    expect(elements.Strong.text).toEqual({ fontWeight: '700' });
    expect(elements.Emphasis.text).toEqual({ fontStyle: 'italic' });
    expect(elements.Strikethrough.text).toEqual({
      textDecorationLine: 'line-through',
    });
    expect(elements.Link.text).toEqual({
      color: lightTheme.link!.color,
      textDecorationLine: 'underline',
    });
    expect(elements.Superscript.text).toEqual({});
  });

  it('derives block text from the paragraph', () => {
    const { elements } = resolveTheme();
    expect(elements.Paragraph.text).toEqual({
      fontSize: 16,
      lineHeight: 24,
      color: lightTheme.paragraph!.color,
    });
    expect(elements.Paragraph.container).toEqual({ marginBottom: 12 });
  });

  it('follows prop changes', () => {
    const theme = resolveTheme({
      link: { color: 'red' },
      paragraph: { fontSize: 20 },
    });
    expect(theme.elements.Link.text.color).toBe('red');
    expect(theme.elements.Paragraph.text.fontSize).toBe(20);
    expect(theme.headings[5].text.fontSize).toBe(20);
    expect(theme.tokens.fontSize.base).toBe(20);
  });

  it('flows the paragraph text props into list items, table cells and html blocks', () => {
    const theme = resolveTheme({
      paragraph: {
        color: '#123456',
        fontSize: 18,
        fontFamily: 'Inter',
        fontWeight: '500',
        fontStyle: 'italic',
        lineHeight: 30,
        textAlign: 'center',
      },
    });
    const shared = {
      color: '#123456',
      fontSize: 18,
      fontFamily: 'Inter',
      fontWeight: '500',
      fontStyle: 'italic',
      lineHeight: 30,
      textAlign: 'center',
    };
    expect(theme.elements.Paragraph.text).toEqual(shared);
    expect(theme.elements.ListItem.text).toEqual(shared);
    expect(theme.elements.TableCell.text).toEqual(shared);
    expect(theme.tableHeaderCell.text).toMatchObject({ fontSize: 18 });
    expect(theme.tightParagraph.text).toEqual(shared);
    // html blocks keep their own colour and mono family, the rest flows.
    expect(theme.elements.HtmlBlock.text).toMatchObject({
      fontSize: 18,
      fontWeight: '500',
      lineHeight: 30,
      color: lightTheme.blockquote!.color,
    });
    expect(theme.elements.HtmlBlock.text.fontFamily).not.toBe('Inter');
  });

  it("lets list, table and htmlBlock props win over the paragraph's", () => {
    const theme = resolveTheme({
      paragraph: { color: 'p', fontSize: 18 },
      list: { color: 'li' },
      table: { fontSize: 14, cellPadding: 2 },
      htmlBlock: { color: 'html', fontSize: 11 },
    });
    expect(theme.elements.ListItem.text).toMatchObject({
      color: 'li',
      fontSize: 18,
    });
    expect(theme.elements.TableCell.text).toMatchObject({
      color: 'p',
      fontSize: 14,
    });
    expect(theme.elements.TableCell.container.padding).toBe(2);
    expect(theme.elements.HtmlBlock.text).toMatchObject({
      color: 'html',
      fontSize: 11,
    });
  });

  it('puts blockquote text props on the text, so its children inherit them', () => {
    const { elements } = resolveTheme({
      blockquote: {
        color: 'q',
        fontStyle: 'italic',
        padding: 5,
        paddingLeft: 9,
      },
    });
    expect(elements.Blockquote.text).toEqual({
      color: 'q',
      fontStyle: 'italic',
    });
    // `padding` is top and bottom only; `paddingLeft` is the bar-to-text gap.
    expect(elements.Blockquote.container).toMatchObject({
      paddingVertical: 5,
      paddingLeft: 9,
    });
    expect(elements.Blockquote.container.padding).toBeUndefined();
  });

  it('creates all styles with one StyleSheet.create call', () => {
    const spy = jest.spyOn(StyleSheet, 'create');
    resolveTheme();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('resolves the default theme once', () => {
    expect(getDefaultTheme()).toBe(getDefaultTheme());
    expect(Object.isFrozen(getDefaultTheme())).toBe(true);
  });
});
