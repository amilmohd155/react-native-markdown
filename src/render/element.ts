import {
  createElement,
  type Attributes,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { ElementName, ElementStyle } from '../theme';
import type { RenderCtx } from './context';
import type { ElementProps } from './elements';
import type { SemanticProps } from './props';

/**
 * Calls `component` for element `name`, keyed by node id. Leaf elements
 * (no `children` in the catalog) get no `children` key.
 */
export function createElementOf<K extends ElementName>(
  component: ComponentType<ElementProps<K>>,
  key: number,
  props: SemanticProps<K>,
  style: ElementStyle,
  children?: ReactNode
): ReactElement {
  const full =
    children === undefined
      ? { ...props, style, key }
      : { ...props, style, key, children };
  // TypeScript can't relate `SemanticProps<K>` (an Omit over a generic
  // key) back to `ElementProps<K>`; the shapes match by construction.
  return createElement(
    component,
    full as unknown as ElementProps<K> & Attributes
  );
}

/** The element's component from the merged map in `ctx`. */
export function componentOf<K extends ElementName>(
  ctx: RenderCtx,
  name: K
): ComponentType<ElementProps<K>> {
  return ctx.components[name] as ComponentType<ElementProps<K>>;
}

/** `createElementOf` with the component from `ctx`. */
export function element<K extends ElementName>(
  ctx: RenderCtx,
  name: K,
  key: number,
  props: SemanticProps<K>,
  style: ElementStyle,
  children?: ReactNode
): ReactElement {
  return createElementOf(componentOf(ctx, name), key, props, style, children);
}
