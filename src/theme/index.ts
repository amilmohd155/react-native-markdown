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
 * Planned (M4): 'auto', full merge order in the resolver, resolve cache,
 * MarkdownThemeContext and useMarkdownTheme().
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
  type HeadingLevel,
  type ResolvedTheme,
  type Theme,
  type ThemeInput,
  type ThemeTokens,
} from './types';
export { darkTheme, lightTheme } from './tokens';
export { createTheme, mergeElements, mergeTokens } from './create';
export { getDefaultTheme, headingFontSize, resolveTheme } from './resolve';
