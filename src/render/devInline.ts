import {
  isValidElement,
  memo,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

/**
 * Dev-only check (D8): an inline element that isn't declared as an inline
 * view must return Text-compatible output, so its paragraph stays a single
 * text layout. When one returns a View (or another non-text host component)
 * directly, warn once per element name.
 *
 * Checks plain function components and `memo()` of one; class and
 * `forwardRef` components pass through unchecked. Only the component's own
 * return value is inspected, not what it renders further down.
 */

const NON_TEXT: ReadonlyMap<unknown, string> = new Map<unknown, string>([
  [View, 'View'],
  [Image, 'Image'],
  [ScrollView, 'ScrollView'],
  [Pressable, 'Pressable'],
]);

const REACT_MEMO = Symbol.for('react.memo');

type FunctionComponent<P> = ((props: P) => ReactNode) & {
  displayName?: string;
};

interface MemoComponent<P> {
  readonly $$typeof: symbol;
  readonly type: unknown;
  readonly compare: ((a: P, b: P) => boolean) | null;
}

const warned = new Set<string>();
const wrappers = new WeakMap<object, unknown>();

/** `__DEV__` as React Native and Jest define it; false when absent. */
export function isDev(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}

/** Test hook: forget which element names already warned. */
export function resetInlineViewWarnings(): void {
  warned.clear();
}

function isFunctionComponent<P>(c: unknown): c is FunctionComponent<P> {
  if (typeof c !== 'function') return false;
  const proto = (c as { prototype?: { isReactComponent?: unknown } }).prototype;
  return !proto?.isReactComponent;
}

function isMemo<P>(c: unknown): c is MemoComponent<P> {
  return (
    typeof c === 'object' &&
    c !== null &&
    (c as { $$typeof?: unknown }).$$typeof === REACT_MEMO
  );
}

function check(name: string, out: ReactNode): void {
  if (!isValidElement(out)) return;
  const host = NON_TEXT.get(out.type);
  if (host === undefined || warned.has(name)) return;
  warned.add(name);
  console.warn(
    `[react-native-markdown] The inline element "${name}" returned a <${host}>. ` +
      'Inline elements must return Text-compatible output (<Text>, strings), ' +
      'so the paragraph stays one text layout. Declare it with inlineView() ' +
      'to render a View as an inline attachment.'
  );
}

function wrapFunction<P>(
  name: string,
  fn: FunctionComponent<P>
): FunctionComponent<P> {
  const Checked: FunctionComponent<P> = (props: P) => {
    const out = fn(props);
    check(name, out);
    return out;
  };
  Checked.displayName = fn.displayName ?? fn.name;
  return Checked;
}

/**
 * `component`, wrapped with the inline View check. Wrappers are cached per
 * component, so their identity is stable and React never remounts them.
 */
export function checkedInline<P extends object>(
  name: string,
  component: ComponentType<P>
): ComponentType<P> {
  const cached = wrappers.get(component);
  if (cached !== undefined) return cached as ComponentType<P>;

  let wrapped: unknown = component;
  if (isFunctionComponent<P>(component)) {
    wrapped = wrapFunction(name, component);
  } else if (isMemo<P>(component) && isFunctionComponent<P>(component.type)) {
    wrapped = memo(
      wrapFunction(name, component.type),
      component.compare ?? undefined
    );
  }
  wrappers.set(component, wrapped);
  return wrapped as ComponentType<P>;
}
