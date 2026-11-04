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
 *
 * Planned contents:
 * - Default elements
 *
 * Design:
 * - docs/rewrite/03-architecture.md#3-rendering-layer
 * - docs/rewrite/phase-1/element-props.md
 */

export type {
  Components,
  ElementProps,
  ElementPropsMap,
  HeadingLevel,
} from './elements';
export {
  DEFAULT_RENDER_OPTIONS,
  createRenderCtx,
  useRenderCtx,
  type HandlersRef,
  type ImagePressInfo,
  type LinkPressInfo,
  type RenderCtx,
  type RenderCtxInput,
  type RenderHandlers,
  type RenderOptions,
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
export * from './props';
