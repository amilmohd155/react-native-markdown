import { useState } from 'react';

const NONE: Readonly<Record<string, unknown>> = Object.freeze({});

/** Same keys, values `===`. `undefined` equals an empty object. */
export function shallowEqualObject(
  a: object | undefined,
  b: object | undefined
): boolean {
  if (a === b) return true;
  const x = (a ?? NONE) as Record<string, unknown>;
  const y = (b ?? NONE) as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(y, key) || x[key] !== y[key]) return false;
  }
  return true;
}

/** Same length, items `===`. `undefined` equals an empty array. */
export function shallowEqualArray(
  a: readonly unknown[] | undefined,
  b: readonly unknown[] | undefined
): boolean {
  if (a === b) return true;
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return false;
  }
  return true;
}

/**
 * Returns the previous `value` while `equal` says the new one is the same,
 * so an inline `plugins={[a]}` or `components={{ … }}` keeps a stable
 * identity for `useMemo` dependencies without the caller memoizing.
 *
 * Uses a render-phase state update (React re-renders at once) rather than a
 * ref write, which the rules of React forbid during render.
 */
export function useStable<T>(value: T, equal: (a: T, b: T) => boolean): T {
  const [stable, setStable] = useState(value);
  if (stable === value || equal(stable, value)) return stable;
  setStable(value);
  return value;
}
