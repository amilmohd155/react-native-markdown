/**
 * v1 preview for the example app.
 *
 * The v1 API isn't exported from the package until M5, so the example
 * imports it from the library sources directly, including internals the
 * future <Markdown> component will hide (tableOf, BlockList, render ctx).
 * Metro watches the monorepo root, so edits under src/ hot-reload here.
 * Delete this file in M5, when the package entry point switches to v1.
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
