import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { resolveThemeProp, type ColorScheme, type ThemeProp } from './cache';
import type { ElementOverrides, ResolvedTheme, ThemeTokens } from './types';

/**
 * The resolved theme of the enclosing `<Markdown>` (provided by the block
 * list). A context of its own, apart from the render context, so a custom
 * component that reads the theme doesn't re-render when only handlers or
 * render options change.
 * Spec: docs/rewrite/phase-1/theme-resolution.md#caching
 */
export const MarkdownThemeContext = createContext<ResolvedTheme | null>(null);

/** What `useMarkdownTheme()` returns. */
export interface MarkdownTheme {
  /** The merged tokens: colors, fonts, sizes and spacing. */
  readonly tokens: ThemeTokens;
  /**
   * The resolved style of every element, as `{ text, container }`. `Heading`
   * is empty here because it depends on the level: use `headings`.
   */
  readonly styles: ResolvedTheme['elements'];
  /** `Heading` style by level: index 0 is h1. */
  readonly headings: ResolvedTheme['headings'];
}

/**
 * The tokens and resolved element styles, for custom components that want
 * to match the theme. Same reference until the theme changes.
 * Must be called inside a `<Markdown>` (it throws outside one).
 */
export function useMarkdownTheme(): MarkdownTheme {
  const theme = useContext(MarkdownThemeContext);
  if (theme === null) {
    throw new Error(
      'useMarkdownTheme() must be called by a component rendered inside <Markdown>.'
    );
  }
  return useMemo(
    () => ({
      tokens: theme.tokens,
      styles: theme.elements,
      headings: theme.headings,
    }),
    [theme]
  );
}

/**
 * The resolved theme for a `theme` prop, following the device's color
 * scheme (`'auto'`, and the scheme a theme input merges onto). Cached: an
 * equal theme returns the same object, so nothing downstream re-renders;
 * a scheme change swaps to the other cached theme.
 * Spec: docs/rewrite/phase-1/theme-resolution.md#dark-mode
 */
export function useResolvedTheme(
  theme: ThemeProp = 'auto',
  plugins?: readonly ElementOverrides[]
): ResolvedTheme {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return resolveThemeProp(theme, scheme, plugins);
}
