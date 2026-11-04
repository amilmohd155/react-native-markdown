import type { TextStyle } from 'react-native';
import type { FontFamily, ThemeTokens } from './types';

/**
 * The font a run of inline text is in: which family it comes from and
 * whether it is already bold or italic. The inline flattener passes it down
 * and picks `boldItalic` when both apply.
 * Spec: docs/rewrite/phase-1/theme-resolution.md#font-faces
 */
export interface FontState {
  readonly bold: boolean;
  readonly italic: boolean;
  /** `fonts.heading ?? fonts.body` instead of `fonts.body`. */
  readonly heading: boolean;
}

export const BODY_FONT: FontState = Object.freeze({
  bold: false,
  italic: false,
  heading: false,
});
/** A heading starts bold, so `Strong` inside it adds nothing. */
export const HEADING_FONT: FontState = Object.freeze({
  bold: true,
  italic: false,
  heading: true,
});
/** A table head cell starts bold. */
export const TABLE_HEAD_FONT: FontState = Object.freeze({
  bold: true,
  italic: false,
  heading: false,
});

/** Number of distinct font states. */
export const FONT_STATE_COUNT = 8;

/** Index of a state, `0 <= i < FONT_STATE_COUNT`. */
export function fontStateIndex(s: FontState): number {
  return (s.heading ? 4 : 0) | (s.bold ? 2 : 0) | (s.italic ? 1 : 0);
}

/** The state after entering a `Strong` and/or `Emphasis`. */
export function withFont(
  s: FontState,
  change: { bold?: true; italic?: true }
): FontState {
  const bold = s.bold || change.bold === true;
  const italic = s.italic || change.italic === true;
  if (bold === s.bold && italic === s.italic) return s;
  return { bold, italic, heading: s.heading };
}

/** The state at index `i` (inverse of `fontStateIndex`). */
export function fontStateAt(i: number): FontState {
  return { bold: (i & 2) !== 0, italic: (i & 1) !== 0, heading: (i & 4) !== 0 };
}

/** `true` for a face map, `false` for a family name or `undefined`. */
function isFaceMap(
  f: FontFamily | undefined
): f is Exclude<FontFamily, string> {
  return typeof f === 'object';
}

/** `true` when body or heading fonts are face maps. */
export function hasFaceMap(fonts: ThemeTokens['fonts']): boolean {
  return isFaceMap(fonts.body) || isFaceMap(fonts.heading);
}

/** The family text is set in when it is neither bold nor italic. */
export function regularFamily(f: FontFamily | undefined): string | undefined {
  return isFaceMap(f) ? f.regular : f;
}

/** The family for code, from a name or a `{ regular }` map. */
export function monoFamily(mono: ThemeTokens['fonts']['mono']): string {
  return typeof mono === 'string' ? mono : mono.regular;
}

/**
 * The font part of a style (`fontFamily`, `fontWeight`, `fontStyle`) for
 * text in `state`, set in `family`.
 *
 * - Family name or system font: only `fontWeight`/`fontStyle`, for the
 *   platform to resolve. `fontFamily` is set by the block's base style.
 * - Face map: the face for the state, as `fontFamily`. `fontWeight` and
 *   `fontStyle` are left out when the face exists, because Android would
 *   synthesize bold or italic on top of a real one. A missing face falls
 *   back to `fontWeight`/`fontStyle` on the nearest face.
 *
 * `boldWeight` is the weight used when bold has to come from `fontWeight`.
 */
export function fontStyleFor(
  family: FontFamily | undefined,
  state: Pick<FontState, 'bold' | 'italic'>,
  boldWeight: '600' | '700' = '700'
): TextStyle {
  const { bold, italic } = state;
  if (!isFaceMap(family)) {
    return {
      ...(bold ? { fontWeight: boldWeight } : null),
      ...(italic ? { fontStyle: 'italic' } : null),
    };
  }
  if (bold && italic) {
    if (family.boldItalic !== undefined) {
      return { fontFamily: family.boldItalic };
    }
    // Nearest face, then the missing axis from the style props.
    if (family.bold !== undefined) {
      return { fontFamily: family.bold, fontStyle: 'italic' };
    }
    if (family.italic !== undefined) {
      return { fontFamily: family.italic, fontWeight: boldWeight };
    }
    return {
      fontFamily: family.regular,
      fontWeight: boldWeight,
      fontStyle: 'italic',
    };
  }
  if (bold) {
    return family.bold !== undefined
      ? { fontFamily: family.bold }
      : { fontFamily: family.regular, fontWeight: boldWeight };
  }
  if (italic) {
    return family.italic !== undefined
      ? { fontFamily: family.italic }
      : { fontFamily: family.regular, fontStyle: 'italic' };
  }
  return { fontFamily: family.regular };
}

/**
 * What `Strong`/`Emphasis` adds when entered from `parent`: the font style
 * of the new state, without a `fontFamily` the parent already has. The
 * element sets only what it changes, so nested `<Text>` inherits the rest.
 */
export function fontDelta(
  fonts: ThemeTokens['fonts'],
  parent: FontState,
  change: { bold?: true; italic?: true }
): TextStyle {
  const family = parent.heading ? (fonts.heading ?? fonts.body) : fonts.body;
  if (!isFaceMap(family)) {
    // The platform resolves the face. `Strong` always sets its weight (also
    // inside a heading, whose h3–h6 weight is '600'), so the result never
    // depends on the parent.
    return fontStyleFor(family, {
      bold: change.bold === true,
      italic: change.italic === true,
    });
  }
  const { fontFamily, ...rest } = fontStyleFor(
    family,
    withFont(parent, change)
  );
  const parentFamily = fontStyleFor(family, parent).fontFamily;
  return fontFamily === parentFamily ? rest : { fontFamily, ...rest };
}
