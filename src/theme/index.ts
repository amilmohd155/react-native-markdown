/**
 * Theme tokens and resolution (Phase 1 · M4).
 *
 * Contents so far (minimal version for the M3 renderer):
 * - Element names, tokens and resolved-theme types (./types)
 * - Default light tokens (./tokens)
 * - Token → element style derivation, one StyleSheet.create (./resolve)
 *
 * Planned (M4): createTheme, darkTheme, 'auto', merge order, resolve cache,
 * MarkdownThemeContext and useMarkdownTheme().
 *
 * Design:
 * - docs/rewrite/04-api.md#theme
 * - docs/rewrite/phase-1/theme-resolution.md
 */

export {
  ELEMENT_NAMES,
  type ElementName,
  type ElementStyle,
  type ResolvedTheme,
  type ThemeTokens,
} from './types';
export { lightTokens } from './tokens';
export { getDefaultTheme, headingFontSize, resolveTheme } from './resolve';
