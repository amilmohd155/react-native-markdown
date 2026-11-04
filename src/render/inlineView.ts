import type { ComponentType } from 'react';
import type { TextStyle } from 'react-native';
import type { ThemeTokens } from '../theme';
import type { ElementProps, InlineElementName } from './elements';

/**
 * Declared inline views (D8). Spec: docs/rewrite/03-architecture.md#inline-views
 *
 * An inline element declared as an inline view may render a View, which
 * React Native lays out as an inline attachment inside the paragraph's
 * <Text>. Undeclared inline elements must return Text-compatible output;
 * the dev check in ./devInline warns otherwise.
 *
 * Declaration is a mark on the component, checked when its element renders:
 * nothing is detected up front, and paragraphs without declared elements
 * take the plain path.
 */

/**
 * The font metrics of the block an inline view sits in. Inline attachments
 * don't align to the text baseline by themselves; use these (or
 * `inlineViewOffset`) to place the view.
 */
export interface InlineBaseline {
  readonly fontSize: number;
  readonly lineHeight: number;
}

/** Props of a declared inline view for element `K`: its props plus `baseline`. */
export type InlineViewProps<K extends InlineElementName> = ElementProps<K> & {
  readonly baseline: InlineBaseline;
};

const declared = new WeakSet<object>();

/** Marks `component` as a declared inline view. Internal. */
export function markInlineView<C extends object>(component: C): C {
  declared.add(component);
  return component;
}

/** Whether `component` was declared with `inlineView()` (or by a default). */
export function isInlineView(component: unknown): boolean {
  return typeof component === 'object' || typeof component === 'function'
    ? component !== null && declared.has(component as object)
    : false;
}

/**
 * Declares a component for a built-in inline element as an inline view, so
 * it may return a View: `components={{ Link: inlineView(LinkChip) }}`.
 * The component receives `baseline` in addition to the element's props.
 */
export function inlineView<K extends InlineElementName>(
  component: ComponentType<InlineViewProps<K>>
): ComponentType<ElementProps<K>> {
  // A declared component always receives `baseline` from the renderer.
  return markInlineView(component) as ComponentType<ElementProps<K>>;
}

/** Cap height as a fraction of the font size, for typical UI fonts. */
const CAP_HEIGHT = 0.7;

/**
 * `translateY` that centres a view of `height` on the capital letters of
 * the surrounding text, given that inline attachments sit on the baseline.
 * Positive moves down.
 */
export function inlineViewOffset(
  baseline: InlineBaseline,
  height: number
): number {
  return (height - baseline.fontSize * CAP_HEIGHT) / 2;
}

const baselines = new WeakMap<object, InlineBaseline>();

/**
 * The baseline metrics of a block text style, cached per style object so a
 * declared `memo` component sees the same `baseline` on every render.
 */
export function baselineOf(
  text: TextStyle | undefined,
  tokens: ThemeTokens
): InlineBaseline {
  const key: object = text ?? tokens;
  let baseline = baselines.get(key);
  if (baseline === undefined) {
    const fontSize = text?.fontSize ?? tokens.fontSize.base;
    const lineHeight =
      text?.lineHeight ?? Math.round(fontSize * tokens.lineHeight);
    baseline = Object.freeze({ fontSize, lineHeight });
    baselines.set(key, baseline);
  }
  return baseline;
}
