import { createContext, useContext } from 'react';
import type { TextStyle } from 'react-native';
import type { RenderCtx } from './context';

/**
 * React contexts the default elements read. Values are stable references
 * or primitives, so consumers only re-render when something real changed.
 */

/** The render context, provided by `BlockList`. */
export const RenderCtxContext = createContext<RenderCtx | null>(null);

/** The render context for a default element; throws outside `BlockList`. */
export function useRenderContext(): RenderCtx {
  const ctx = useContext(RenderCtxContext);
  if (ctx === null) {
    throw new Error(
      'Markdown elements must render inside <BlockList> (or <Markdown>).'
    );
  }
  return ctx;
}

/**
 * A text style that cascades into nested block text, e.g. a blockquote's
 * muted colour into its paragraphs. Applied after the element's own style.
 */
export const InheritedTextContext = createContext<TextStyle | null>(null);

/**
 * Characters in the longest marker of the enclosing list ("10." → 3), so
 * every item's marker column has the same width and ordered markers align.
 */
export const ListMarkerContext = createContext(1);
