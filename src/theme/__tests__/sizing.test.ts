import { StyleSheet } from 'react-native';
import { getDefaultTheme, resolveTheme } from '../resolve';

const flat = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

describe('sizing: points and relative sizes (P3a-3, P3a-4)', () => {
  it('scales headings from a custom paragraph.fontSize', () => {
    const big = resolveTheme({ paragraph: { fontSize: 20 } });
    const def = getDefaultTheme();
    expect(big.headings[0]!.text.fontSize!).toBeGreaterThan(
      def.headings[0]!.text.fontSize!
    );
    expect(big.headings[5]!.text.fontSize).toBe(20);
    expect(big.headings[1]!.text.fontSize).toBe(Math.round(20 * 1.2 ** 4));
  });

  it('an explicit hN.fontSize wins over the scale', () => {
    const t = resolveTheme({
      paragraph: { fontSize: 20 },
      h1: { fontSize: 50 },
    });
    expect(t.headings[0]!.text.fontSize).toBe(50);
  });

  it('computes paragraph line height in points, an explicit value is exact', () => {
    expect(getDefaultTheme().elements.Paragraph.text!.lineHeight).toBe(24);
    const t = resolveTheme({ paragraph: { fontSize: 20 } });
    expect(t.elements.Paragraph.text!.lineHeight).toBe(30);
    const own = resolveTheme({ paragraph: { lineHeight: 40 } });
    expect(own.elements.Paragraph.text!.lineHeight).toBe(40);
  });

  it('footnote section follows footnoteDefinition and paragraph values', () => {
    const def = getDefaultTheme().footnoteSection.text;
    expect(flat(def)).toMatchObject({ fontSize: 14, lineHeight: 21 });
    const t = resolveTheme({ paragraph: { fontSize: 20 } });
    expect(flat(t.footnoteSection.text)).toMatchObject({
      fontSize: 17.5,
      lineHeight: 26.25,
    });
    const own = resolveTheme({
      footnoteDefinition: { fontSize: 12, lineHeight: 18 },
    });
    expect(flat(own.footnoteSection.text)).toMatchObject({
      fontSize: 12,
      lineHeight: 18,
    });
    expect(flat(own.elements.FootnoteDefinition.text)).toMatchObject({
      fontSize: 12,
      lineHeight: 18,
    });
  });

  it('inline code and kbd carry no fontSize unless set', () => {
    const def = getDefaultTheme();
    expect(flat(def.elements.InlineCode.text).fontSize).toBeUndefined();
    expect(flat(def.elements.Kbd.text).fontSize).toBeUndefined();
    const t = resolveTheme({ inlineCode: { fontSize: 13 } });
    expect(flat(t.elements.InlineCode.text).fontSize).toBe(13);
  });

  it('superscript, subscript and footnoteReference carry no fontSize', () => {
    const def = getDefaultTheme();
    for (const n of [
      'Superscript',
      'Subscript',
      'FootnoteReference',
    ] as const) {
      expect(flat(def.elements[n].text).fontSize).toBeUndefined();
    }
  });
});

describe('fontScale defaults per platform', () => {
  const scales = (t: ReturnType<typeof resolveTheme>) => t.tokens.fontScale;

  afterEach(() => {
    jest.resetModules();
  });

  function withOS(os: 'ios' | 'android' | 'web') {
    let out!: typeof scales extends (t: never) => infer R ? R : never;
    jest.isolateModules(() => {
      jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
        __esModule: true,
        default: {
          OS: os,
          select: (spec: Record<string, unknown>) =>
            os in spec ? spec[os] : spec.default,
        },
      }));
      const { resolveTheme: resolve } = require('../resolve');
      out = resolve().tokens.fontScale;
    });
    jest.dontMock('react-native/Libraries/Utilities/Platform');
    return out;
  }

  it('is 0.75 on ios and web, 0.65 on android', () => {
    expect(withOS('ios')).toEqual({
      superscript: 0.75,
      subscript: 0.75,
      footnoteReference: 0.75,
    });
    expect(withOS('web').superscript).toBe(0.75);
    expect(withOS('android')).toEqual({
      superscript: 0.65,
      subscript: 0.65,
      footnoteReference: 0.65,
    });
  });

  it('is overridden per key', () => {
    const t = resolveTheme({
      superscript: { fontScale: 0.5 },
      footnoteReference: { fontScale: 0.9 },
    });
    expect(scales(t).superscript).toBe(0.5);
    expect(scales(t).footnoteReference).toBe(0.9);
    expect(scales(t).subscript).toBe(scales(getDefaultTheme()).subscript);
  });
});
