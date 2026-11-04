import {
  BODY_FONT,
  HEADING_FONT,
  fontDelta,
  fontStateAt,
  fontStateIndex,
  fontStyleFor,
  withFont,
} from '../fonts';
import { lightTheme, type FontFaces, type ThemeTokens } from '../index';

const inter: FontFaces = {
  regular: 'Inter_400Regular',
  italic: 'Inter_400Regular_Italic',
  bold: 'Inter_700Bold',
  boldItalic: 'Inter_700Bold_Italic',
};
const display: FontFaces = {
  regular: 'Display_400',
  italic: 'Display_400_Italic',
  bold: 'Display_700',
  boldItalic: 'Display_700_Italic',
};

function fonts(
  body: ThemeTokens['fonts']['body'],
  heading?: ThemeTokens['fonts']['heading']
): ThemeTokens['fonts'] {
  return { ...lightTheme.fonts, body, heading };
}

describe('font state', () => {
  it('indexes every state uniquely and round-trips', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const state = fontStateAt(i);
      expect(fontStateIndex(state)).toBe(i);
      seen.add(i);
    }
    expect(seen.size).toBe(8);
  });

  it('withFont adds bold/italic and reuses the state when nothing changes', () => {
    expect(withFont(BODY_FONT, { bold: true })).toEqual({
      bold: true,
      italic: false,
      heading: false,
    });
    expect(withFont(HEADING_FONT, { bold: true })).toBe(HEADING_FONT);
    expect(withFont(HEADING_FONT, { italic: true })).toEqual({
      bold: true,
      italic: true,
      heading: true,
    });
  });
});

describe('fontStyleFor', () => {
  it('leaves the face to the platform for a family name or the system font', () => {
    expect(fontStyleFor('Inter', { bold: true, italic: false })).toEqual({
      fontWeight: '700',
    });
    expect(fontStyleFor(undefined, { bold: false, italic: true })).toEqual({
      fontStyle: 'italic',
    });
    expect(fontStyleFor(undefined, { bold: false, italic: false })).toEqual({});
    expect(fontStyleFor('Inter', { bold: true, italic: false }, '600')).toEqual(
      {
        fontWeight: '600',
      }
    );
  });

  it('picks the face for each state, without weight or style props', () => {
    expect(fontStyleFor(inter, { bold: false, italic: false })).toEqual({
      fontFamily: 'Inter_400Regular',
    });
    expect(fontStyleFor(inter, { bold: true, italic: false })).toEqual({
      fontFamily: 'Inter_700Bold',
    });
    expect(fontStyleFor(inter, { bold: false, italic: true })).toEqual({
      fontFamily: 'Inter_400Regular_Italic',
    });
    expect(fontStyleFor(inter, { bold: true, italic: true })).toEqual({
      fontFamily: 'Inter_700Bold_Italic',
    });
  });

  it('falls back to fontWeight/fontStyle on the nearest face', () => {
    const partial = { regular: 'R', bold: 'B' };
    expect(fontStyleFor(partial, { bold: false, italic: true })).toEqual({
      fontFamily: 'R',
      fontStyle: 'italic',
    });
    expect(fontStyleFor(partial, { bold: true, italic: true })).toEqual({
      fontFamily: 'B',
      fontStyle: 'italic',
    });
    expect(
      fontStyleFor({ regular: 'R', italic: 'I' }, { bold: true, italic: true })
    ).toEqual({ fontFamily: 'I', fontWeight: '700' });
    expect(
      fontStyleFor({ regular: 'R' }, { bold: true, italic: true }, '600')
    ).toEqual({ fontFamily: 'R', fontWeight: '600', fontStyle: 'italic' });
  });
});

describe('fontDelta', () => {
  it('with a family name, always sets the weight or style it adds', () => {
    const f = fonts('Inter');
    expect(fontDelta(f, BODY_FONT, { bold: true })).toEqual({
      fontWeight: '700',
    });
    // Also inside a heading, whose h3–h6 weight is '600'.
    expect(fontDelta(f, HEADING_FONT, { bold: true })).toEqual({
      fontWeight: '700',
    });
    expect(fontDelta(f, BODY_FONT, { italic: true })).toEqual({
      fontStyle: 'italic',
    });
  });

  it('with a face map, switches family from the current state', () => {
    const f = fonts(inter);
    expect(fontDelta(f, BODY_FONT, { bold: true })).toEqual({
      fontFamily: 'Inter_700Bold',
    });
    expect(fontDelta(f, fontStateAt(2), { italic: true })).toEqual({
      fontFamily: 'Inter_700Bold_Italic',
    });
    expect(fontDelta(f, fontStateAt(1), { bold: true })).toEqual({
      fontFamily: 'Inter_700Bold_Italic',
    });
  });

  it('adds nothing when the face is unchanged (Strong in Strong or Heading)', () => {
    const f = fonts(inter);
    expect(fontDelta(f, fontStateAt(2), { bold: true })).toEqual({});
    expect(fontDelta(f, HEADING_FONT, { bold: true })).toEqual({});
  });

  it('uses the heading faces inside a heading', () => {
    const f = fonts(inter, display);
    expect(fontDelta(f, HEADING_FONT, { italic: true })).toEqual({
      fontFamily: 'Display_700_Italic',
    });
    // Body text keeps the body faces.
    expect(fontDelta(f, BODY_FONT, { italic: true })).toEqual({
      fontFamily: 'Inter_400Regular_Italic',
    });
  });

  it('with a missing face, keeps only the props that fall back', () => {
    const f = fonts({ regular: 'R' });
    expect(fontDelta(f, BODY_FONT, { bold: true })).toEqual({
      fontWeight: '700',
    });
    expect(fontDelta(f, fontStateAt(2), { italic: true })).toEqual({
      fontWeight: '700',
      fontStyle: 'italic',
    });
  });
});
