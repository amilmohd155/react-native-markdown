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
  PluginComponents,
} from './elements';
export {
  createRenderCtx,
  useRenderCtx,
  type FootnoteBackLinkMark,
  type FootnoteA11yLabels,
  type FootnotePressInfo,
  type ImagePressInfo,
  type LinkPressInfo,
  type RenderHandlers,
  type ScriptFallback,
  type SoftBreak,
  type TaskToggleInfo,
} from './context';
export { BlockList } from './Block';
export { renderBlock } from './renderBlock';
export {
  inlineView,
  type InlineBaseline,
  type InlineViewProps,
} from './inlineView';
export { defaultComponents, defaults } from './defaults';
export { type ImagesPolicy } from './imagePolicy';
export * from './props';
