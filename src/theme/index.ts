/**
 * Theme tokens and resolution (Phase 1 · M4).
 *
 * Internal: only what src/api/index.ts re-exports is public.
 * - Element names, tokens and resolved-theme types (./types)
 * - Built-in light and dark flat themes (./tokens)
 * - Flat theme → element style derivation, one StyleSheet.create (./resolve)
 * - createTheme, the typed flat theme helper (./create), and the flat merge
 *   (./merge)
 *
 * - Resolve cache keyed on scheme, flat theme input and plugin layers (./cache)
 *
 * - MarkdownThemeContext, useMarkdownTheme() (the merged flat values) and
 *   useResolvedTheme(), which follows the color scheme for 'auto' (./context)
 *
 * Design:
 * - docs/rewrite/04-api.md#theme
 * - docs/rewrite/phase-1/theme-resolution.md
 */

export {
  ELEMENT_NAMES,
  SYNTAX_TOKEN_TYPES,
  type ElementName,
  type ElementStyle,
  type FontFaces,
  type FontFamily,
  type ResolvedTheme,
  type SyntaxTokenType,
  type ThemeTokens,
} from './types';
export type { PluginElementPropsMap } from './pluginElements';
export type {
  AdmonitionKind,
  FlatThemeBlock,
  FlatThemeInput,
  MarkdownTheme,
} from './flatTypes';
export { darkTheme, lightTheme } from './tokens';
export { createTheme } from './create';
export { clearThemeCache, resolveThemeProp, type ThemeProp } from './cache';
export {
  MarkdownThemeContext,
  useMarkdownTheme,
  useResolvedTheme,
} from './context';
export {
  BODY_FONT,
  HEADING_FONT,
  TABLE_HEAD_FONT,
  fontStateIndex,
  regularFamily,
  withFont,
  type FontState,
} from './fonts';
export { getDefaultTheme, headingFontSize, resolveTheme } from './resolve';
