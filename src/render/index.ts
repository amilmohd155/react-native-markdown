/**
 * Renderer (Phase 1 · M3).
 *
 * Contents so far:
 * - Element names → semantic props and the component map type (./elements)
 * - Render context: theme, components, handlers, options (./context)
 * - Node table → semantic element props (./props)
 * - Block-level rendering (./renderBlock), BlockList and memoized Block
 *   (./Block)
 * - Inline flattener: merged text runs, one component call per inline
 *   element (./inline), and the dev check for undeclared inline Views
 *   (./devInline)
 * - Declared inline views: inlineView(), baseline metrics (./inlineView)
 * - Image size cache (./imageSize), table column width cache (./tableLayout)
 * - Default block and inline elements (./defaults), link handling (./links)
 *
 * Design:
 * - docs/rewrite/03-architecture.md#3-rendering-layer
 * - docs/rewrite/phase-1/element-props.md
 */

export type {
  AnyElementName,
  Components,
  ElementProps,
  ElementPropsMap,
  HeadingLevel,
  InlineElementName,
  PluginComponents,
} from './elements';
export {
  DEFAULT_RENDER_OPTIONS,
  createRenderCtx,
  useRenderCtx,
  type FootnotePressInfo,
  type HandlersRef,
  type ImagePressInfo,
  type LinkPressInfo,
  type RenderCtx,
  type RenderCtxInput,
  type RenderHandlers,
  type RenderOptions,
  type ScriptFallback,
  type SoftBreak,
  type TaskToggleInfo,
} from './context';
export {
  Block,
  BlockList,
  blockPropsEqual,
  type BlockListProps,
  type BlockProps,
} from './Block';
export { renderBlock } from './renderBlock';
export { renderInline } from './inline';
export {
  baselineOf,
  inlineView,
  inlineViewOffset,
  isInlineView,
  type InlineBaseline,
  type InlineViewProps,
} from './inlineView';
export { defaultComponents, defaults } from './defaults';
export {
  cachedImageSize,
  loadImageSize,
  useImageSize,
  type ImageSize,
} from './imageSize';
export {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  cachedColumnWidths,
  columnWidths,
} from './tableLayout';
export { isOpenableUrl, pressLink } from './links';
export { toSubscript, toSuperscript } from './scripts';
export {
  InheritedTextContext,
  ListMarkerContext,
  RenderCtxContext,
  TableKeyContext,
  TableLayoutContext,
  useRenderContext,
  type TableLayout,
} from './contexts';
export * from './props';
