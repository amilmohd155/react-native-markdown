/**
 * Theme tokens and resolution (Phase 1 · M4).
 *
 * Contents so far (minimal version for the M3 renderer):
 * - Element names, tokens and resolved-theme types (./types)
 * - Built-in light and dark themes (./tokens)
 * - Token → element style derivation, one StyleSheet.create (./resolve)
 *
 * - createTheme and the token/element merge helpers (./create)
 *
 * - Resolve cache keyed on scheme, theme input and plugin layers (./cache)
 *
 * - MarkdownThemeContext, useMarkdownTheme() and useResolvedTheme(), which
 *   follows the color scheme for 'auto' (./context)
 *
 * Design:
 * - docs/rewrite/04-api.md#theme
 * - docs/rewrite/phase-1/theme-resolution.md
 */

export {
  ELEMENT_NAMES,
  type ElementName,
  type ElementOverride,
  type ElementOverrides,
  type ElementStyle,
  type FontFaces,
  type FontFamily,
  type HeadingLevel,
  type PluginElementName,
  type PluginElementPropsMap,
  type ResolvedTheme,
  type Theme,
  type ThemeInput,
  type ThemeTokens,
} from './types';
export { darkTheme, lightTheme } from './tokens';
export { createTheme, mergeElements, mergeTokens } from './create';
export {
  clearThemeCache,
  resolveThemeProp,
  type ColorScheme,
  type ThemeProp,
} from './cache';
export {
  MarkdownThemeContext,
  useMarkdownTheme,
  useResolvedTheme,
  type MarkdownTheme,
} from './context';
export {
  BODY_FONT,
  HEADING_FONT,
  TABLE_HEAD_FONT,
  fontStateIndex,
  monoFamily,
  regularFamily,
  withFont,
  type FontState,
} from './fonts';
export { getDefaultTheme, headingFontSize, resolveTheme } from './resolve';
