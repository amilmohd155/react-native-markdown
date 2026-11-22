/**
 * M3 (Phase 3a): every whitelist prop that has a rendering slot reaches the
 * element it styles, in the right namespace (container vs text), with the
 * defaults unchanged when it is unset. Consumers that read tokens are in
 * `src/render/__tests__/slots.test.tsx`.
 */
import { resolveTheme } from '../resolve';
import { lightTheme } from '../tokens';
import type { FlatThemeInput } from '../flatTypes';

const resolve = (input: FlatThemeInput, scheme: 'light' | 'dark' = 'light') =>
  resolveTheme(input, scheme);
const base = resolveTheme();

describe('block containers and text', () => {
  it('blockquote: text props to text, box props to container', () => {
    const { Blockquote } = resolve({
      blockquote: {
        color: '#111111',
        fontSize: 20,
        fontStyle: 'italic',
        backgroundColor: '#eeeeee',
        borderLeftColor: '#ff0000',
        borderLeftWidth: 6,
        borderRadius: 8,
        padding: 10,
        paddingLeft: 14,
        marginTop: 3,
        marginBottom: 5,
      },
    }).elements;
    expect(Blockquote.text).toMatchObject({
      color: '#111111',
      fontSize: 20,
      fontStyle: 'italic',
    });
    expect(Blockquote.container).toMatchObject({
      backgroundColor: '#eeeeee',
      borderLeftColor: '#ff0000',
      borderLeftWidth: 6,
      borderRadius: 8,
      paddingVertical: 10,
      paddingLeft: 14,
      marginTop: 3,
      marginBottom: 5,
    });
    expect(Blockquote.container).not.toHaveProperty('color');
    expect(Blockquote.text).not.toHaveProperty('backgroundColor');
  });

  it('blockquote: defaults are the bar, muted text and block spacing', () => {
    expect(base.elements.Blockquote.container).toMatchObject({
      borderLeftWidth: 4,
      borderLeftColor: lightTheme.blockquote!.borderLeftColor,
      paddingLeft: 12,
      marginBottom: 12,
    });
    expect(base.elements.Blockquote.text.color).toBe(
      lightTheme.blockquote!.color
    );
  });

  it('codeBlock: box props to container, text props to text', () => {
    const { CodeBlock } = resolve({
      codeBlock: {
        backgroundColor: '#101010',
        borderColor: '#202020',
        borderWidth: 2,
        borderRadius: 3,
        padding: 9,
        marginTop: 1,
        marginBottom: 2,
        color: '#303030',
        fontFamily: 'Fira',
        fontSize: 13,
        lineHeight: 20,
      },
    }).elements;
    expect(CodeBlock.container).toMatchObject({
      backgroundColor: '#101010',
      borderColor: '#202020',
      borderWidth: 2,
      borderRadius: 3,
      padding: 9,
      marginTop: 1,
      marginBottom: 2,
    });
    expect(CodeBlock.text).toMatchObject({
      color: '#303030',
      fontFamily: 'Fira',
      fontSize: 13,
      lineHeight: 20,
    });
    expect(CodeBlock.container).not.toHaveProperty('fontSize');
  });

  it('codeBlock: overriding only the background keeps the scheme text colour', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const plain = resolve({}, scheme).elements.CodeBlock.text.color;
      const custom = resolve(
        { codeBlock: { backgroundColor: '#000000' } },
        scheme
      ).elements.CodeBlock.text.color;
      expect(custom).toBe(plain);
    }
    expect(resolve({}, 'dark').elements.CodeBlock.text.color).not.toBe(
      base.elements.CodeBlock.text.color
    );
  });

  it('codeBlockGutter derives from codeBlock text props', () => {
    const { codeBlockGutter } = resolve({
      codeBlock: { fontFamily: 'Fira', fontSize: 13, lineHeight: 21 },
    });
    expect(codeBlockGutter.text).toMatchObject({
      fontFamily: 'Fira',
      fontSize: 13,
      lineHeight: 21,
      textAlign: 'right',
    });
    // Colour and separator are structural: not taken from `codeBlock.color`.
    const coloured = resolve({ codeBlock: { color: '#abcdef' } });
    expect(coloured.codeBlockGutter.text.color).toBe(
      base.codeBlockGutter.text.color
    );
  });

  it('codeBlockHeader: text props to text, bar props to container', () => {
    const { CodeBlockHeader } = resolve({
      codeBlockHeader: {
        color: '#111111',
        fontFamily: 'Fira',
        fontSize: 11,
        lineHeight: 15,
        backgroundColor: '#222222',
        borderBottomColor: '#333333',
        borderBottomWidth: 2,
        paddingHorizontal: 5,
        paddingVertical: 7,
      },
    }).elements;
    expect(CodeBlockHeader.text).toMatchObject({
      color: '#111111',
      fontFamily: 'Fira',
      fontSize: 11,
      lineHeight: 15,
    });
    expect(CodeBlockHeader.container).toMatchObject({
      backgroundColor: '#222222',
      borderBottomColor: '#333333',
      borderBottomWidth: 2,
      paddingHorizontal: 5,
      paddingVertical: 7,
    });
  });

  it('divider: height, colour and margins', () => {
    const { Divider } = resolve({
      divider: {
        backgroundColor: '#123456',
        height: 3,
        marginTop: 4,
        marginBottom: 6,
      },
    }).elements;
    expect(Divider.container).toMatchObject({
      backgroundColor: '#123456',
      height: 3,
      marginTop: 4,
      marginBottom: 6,
    });
    expect(base.elements.Divider.container).toMatchObject({
      backgroundColor: lightTheme.divider!.backgroundColor,
      marginVertical: 12,
    });
  });

  it('htmlBlock: text props to text, margins to container', () => {
    const { HtmlBlock } = resolve({
      htmlBlock: {
        color: '#111111',
        fontFamily: 'Fira',
        fontSize: 11,
        marginTop: 2,
        marginBottom: 4,
      },
    }).elements;
    expect(HtmlBlock.text).toMatchObject({
      color: '#111111',
      fontFamily: 'Fira',
      fontSize: 11,
    });
    expect(HtmlBlock.container).toMatchObject({
      marginTop: 2,
      marginBottom: 4,
    });
  });

  it('footnoteDefinition: text props to text', () => {
    const { FootnoteDefinition } = resolve({
      footnoteDefinition: { color: '#111111', fontSize: 11, lineHeight: 15 },
    }).elements;
    expect(FootnoteDefinition.text).toMatchObject({
      color: '#111111',
      fontSize: 11,
      lineHeight: 15,
    });
  });

  it('image: borderRadius and margins to container', () => {
    const { Image } = resolve({
      image: { borderRadius: 9, marginTop: 2, marginBottom: 4 },
    }).elements;
    expect(Image.container).toMatchObject({
      borderRadius: 9,
      marginTop: 2,
      marginBottom: 4,
    });
  });
});

describe('tables', () => {
  it('table: border props to container', () => {
    const { Table } = resolve({
      table: {
        borderColor: '#ff0000',
        borderWidth: 2,
        borderRadius: 5,
        marginTop: 1,
        marginBottom: 3,
      },
    }).elements;
    expect(Table.container).toMatchObject({
      borderColor: '#ff0000',
      borderWidth: 2,
      borderRadius: 5,
      marginTop: 1,
      marginBottom: 3,
    });
  });

  it('table.borderColor colours the cell grid too, width stays a hairline', () => {
    const red = resolve({ table: { borderColor: '#ff0000', borderWidth: 3 } });
    expect(red.elements.TableCell.container.borderColor).toBe('#ff0000');
    expect(red.tableHeaderCell.container.borderColor).toBe('#ff0000');
    expect(red.elements.TableCell.container.borderWidth).toBe(
      base.elements.TableCell.container.borderWidth
    );
    // Default: the divider colour.
    expect(base.elements.TableCell.container.borderColor).toBe(
      lightTheme.divider!.backgroundColor
    );
  });

  it('tableCell: text props to text, padding and background to container', () => {
    const { TableCell } = resolve({
      tableCell: {
        color: '#111111',
        fontSize: 13,
        textAlign: 'center',
        backgroundColor: '#eeeeee',
        padding: 3,
        paddingHorizontal: 4,
        paddingVertical: 5,
      },
    }).elements;
    expect(TableCell.text).toMatchObject({
      color: '#111111',
      fontSize: 13,
      textAlign: 'center',
    });
    expect(TableCell.container).toMatchObject({
      backgroundColor: '#eeeeee',
      padding: 3,
      paddingHorizontal: 4,
      paddingVertical: 5,
    });
  });
});

describe('inline elements', () => {
  it('strong, em: colour, family and weight/style reach the text', () => {
    const { Strong, Emphasis } = resolve({
      strong: { color: '#111111', fontFamily: 'Bold', fontWeight: '800' },
      em: { color: '#222222', fontFamily: 'Ital', fontStyle: 'normal' },
    }).elements;
    expect(Strong.text).toMatchObject({
      color: '#111111',
      fontFamily: 'Bold',
      fontWeight: '800',
    });
    expect(Emphasis.text).toMatchObject({
      color: '#222222',
      fontFamily: 'Ital',
      fontStyle: 'normal',
    });
    expect(base.elements.Strong.text).toMatchObject({ fontWeight: '700' });
    expect(base.elements.Emphasis.text).toMatchObject({ fontStyle: 'italic' });
  });

  it('strikethrough, underline: colour with the decoration line', () => {
    const { Strikethrough, Underline } = resolve({
      strikethrough: { color: '#111111' },
      underline: { color: '#222222' },
    }).elements;
    expect(Strikethrough.text).toEqual({
      textDecorationLine: 'line-through',
      color: '#111111',
    });
    expect(Underline.text).toEqual({
      textDecorationLine: 'underline',
      color: '#222222',
    });
    expect(base.elements.Underline.text).toEqual({
      textDecorationLine: 'underline',
    });
  });

  it('highlight: background and colour', () => {
    const { Highlight } = resolve({
      highlight: { backgroundColor: '#ffff00', color: '#000000' },
    }).elements;
    expect(Highlight.text).toEqual({
      backgroundColor: '#ffff00',
      color: '#000000',
    });
    expect(base.elements.Highlight.text).toEqual({
      backgroundColor: lightTheme.highlight!.backgroundColor,
    });
  });

  it('link: colour, family, weight, decoration and background', () => {
    const { Link } = resolve({
      link: {
        color: '#0000ff',
        fontFamily: 'Fira',
        fontWeight: '600',
        textDecorationLine: 'none',
        backgroundColor: '#eeeeff',
      },
    }).elements;
    expect(Link.text).toEqual({
      color: '#0000ff',
      fontFamily: 'Fira',
      fontWeight: '600',
      textDecorationLine: 'none',
      backgroundColor: '#eeeeff',
    });
    expect(base.elements.Link.text).toEqual({
      color: lightTheme.link!.color,
      textDecorationLine: 'underline',
    });
  });

  it('inlineCode, kbd: colour, family, background (size is M2)', () => {
    const own = {
      color: '#111111',
      fontFamily: 'Fira',
      backgroundColor: '#eeeeee',
    };
    const { InlineCode, Kbd } = resolve({
      inlineCode: own,
      kbd: { ...own, color: '#222222' },
    }).elements;
    expect(InlineCode.text).toMatchObject(own);
    expect(Kbd.text).toMatchObject({ ...own, color: '#222222' });
    expect(base.elements.InlineCode.text).toMatchObject({
      backgroundColor: lightTheme.codeBlock!.backgroundColor,
    });
  });

  it('footnoteReference, footnoteBackLink: colour', () => {
    const { FootnoteReference, FootnoteBackLink } = resolve({
      footnoteReference: { color: '#111111' },
      footnoteBackLink: { color: '#222222' },
    }).elements;
    expect(FootnoteReference.text.color).toBe('#111111');
    expect(FootnoteBackLink.text.color).toBe('#222222');
    expect(base.elements.FootnoteReference.text.color).toBe(
      lightTheme.link!.color
    );
    expect(base.elements.FootnoteBackLink.text.color).toBe(
      lightTheme.link!.color
    );
  });

  it('superscript, subscript: colour', () => {
    const { Superscript, Subscript } = resolve({
      superscript: { color: '#111111' },
      subscript: { color: '#222222' },
    }).elements;
    expect(Superscript.text.color).toBe('#111111');
    expect(Subscript.text.color).toBe('#222222');
  });
});

describe('tokens read by consumers', () => {
  it('list.bullets, image.aspectRatio, image/codeBlock radius', () => {
    const t = resolve({
      list: { bullets: ['-', '+'] },
      image: { aspectRatio: 2 },
      codeBlock: { borderRadius: 11 },
    }).tokens;
    expect(t.listBullets).toEqual(['-', '+']);
    expect(t.imageRatio).toBe(2);
    expect(t.radius.code).toBe(11);
    expect(base.tokens.listBullets).toEqual(lightTheme.list!.bullets);
    expect(base.tokens.imageRatio).toBe(16 / 9);
  });

  it('checkbox: colours, size and checkedText', () => {
    const t = resolve({
      checkbox: {
        color: '#111111',
        checkedColor: '#22aa22',
        size: 22,
        checkedText: { opacity: 1 },
      },
    }).tokens.checkbox;
    expect(t).toMatchObject({
      color: '#111111',
      checkedColor: '#22aa22',
      size: 22,
    });
    // Merged onto the default: the line-through stays.
    expect(t.checkedText).toEqual({
      textDecorationLine: 'line-through',
      opacity: 1,
    });
    expect(
      resolve({ checkbox: { checkedText: false } }).tokens.checkbox
    ).toMatchObject({ checkedText: false });
  });

  it('footnoteDefinition.highlightColor is the flash colour', () => {
    expect(
      resolve({ footnoteDefinition: { highlightColor: '#abcdef' } }).tokens
        .colors.footnoteHighlight
    ).toBe('#abcdef');
  });

  it('syntax colours merge per scheme', () => {
    const light = resolve({ codeBlock: { syntax: { variable: '#010101' } } });
    const dark = resolve(
      { dark: { codeBlock: { syntax: { embedded: '#020202' } } } },
      'dark'
    );
    expect(light.tokens.syntax.variable).toBe('#010101');
    expect(dark.tokens.syntax.embedded).toBe('#020202');
  });
});
