/**
 * v1 internals for the example app's lab screens.
 *
 * The package entry point is the v1 API since M5, but these screens
 * (bench, theme, fonts) still drive internals the public API hides
 * (tableOf, BlockList, render ctx), so they import the library sources
 * directly. Metro watches the monorepo root, so edits under src/ hot-reload
 * here. M6 migrates the example to the public API and deletes this file.
 */

export * from '../../src/api';
export { tableOf } from '../../src/api/document';
export {
  BlockList,
  createRenderCtx,
  defaultComponents,
  inlineView,
  inlineViewOffset,
  useRenderCtx,
  type RenderHandlers,
  type SoftBreak,
} from '../../src/render';
export {
  createTheme,
  darkTheme,
  lightTheme,
  resolveTheme,
  useMarkdownTheme,
  useResolvedTheme,
  type FontFaces,
  type HeadingLevel,
  type ThemeInput,
  type ThemeProp,
} from '../../src/theme';
export type { NodeTable } from '../../src/model';
