import { useState } from 'react';
import type { Preset } from '../plugins/presets';
import { shallowEqual } from '../theme/cache';

export const shallowEqualObject = shallowEqual;

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

/** Same preset: equal names, or the same base with the same `exclude` list. */
export function presetEqual(
  a: Preset | undefined,
  b: Preset | undefined
): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return a.base === b.base && shallowEqualArray(a.exclude, b.exclude);
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
