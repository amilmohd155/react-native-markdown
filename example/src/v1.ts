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
  defaultComponents,
  inlineView,
  inlineViewOffset,
  useRenderCtx,
  type RenderHandlers,
  type SoftBreak,
} from '../../src/render';
export { lightTokens, resolveTheme } from '../../src/theme';
