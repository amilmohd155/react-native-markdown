import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { resolveThemeProp, type ColorScheme, type ThemeProp } from './cache';
import type { FlatThemeBlock, MarkdownTheme } from './flatTypes';
import type { ResolvedTheme } from './types';

/**
 * The resolved theme of the enclosing `<Markdown>` (provided by the block
 * list). A context of its own, apart from the render context, so a custom
 * component that reads the theme doesn't re-render when only handlers or
 * render options change.
 * Spec: docs/rewrite/phase-1/theme-resolution.md#caching
 */
export const MarkdownThemeContext = createContext<ResolvedTheme | null>(null);

/**
 * The merged flat theme of the active scheme, for custom components that want
 * to match the theme: the same vocabulary as the `theme` prop
 * (`useMarkdownTheme().link.color`, `.paragraph.fontSize`). Same reference
 * until the theme changes. Must be called inside a `<Markdown>` (it throws
 * outside one).
 */
export function useMarkdownTheme(): MarkdownTheme {
  const theme = useContext(MarkdownThemeContext);
  if (theme === null) {
    throw new Error(
      'useMarkdownTheme() must be called by a component rendered inside <Markdown>.'
    );
  }
  return theme.flat;
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
  plugins?: readonly FlatThemeBlock[]
): ResolvedTheme {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return resolveThemeProp(theme, scheme, plugins);
}
