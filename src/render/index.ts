/**
 * Renderer (Phase 1 · M3).
 *
 * Contents so far:
 * - Element names → semantic props and the component map type (./elements)
 * - Render context: theme, components, handlers, options (./context)
 *
 * Planned contents:
 * - BlockList and memoized Block
 * - Inline flattener (one <Text> per block)
 * - Node table → semantic element props
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
