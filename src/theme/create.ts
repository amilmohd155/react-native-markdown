import type { FlatThemeInput } from './flatTypes';

/** A deep copy of plain data (objects and arrays), frozen. */
function freezeCopy<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  const copy: unknown = Array.isArray(value)
    ? value.map(freezeCopy)
    : Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, freezeCopy(v)])
      );
  return Object.freeze(copy) as T;
}

/**
 * Types a flat theme (P3a-2): an identity helper, so a theme defined outside
 * JSX gets the per-element prop whitelist checked, and "define once, hoist"
 * is the obvious pattern. Returns a frozen copy (the input is never frozen),
 * which is also a valid `<Markdown theme>`. It merges onto the built-in theme
 * of the active scheme at resolve time; there is no `base`. Compose with a
 * spread: `createTheme({ ...brand, link: { color } })`.
 * Spec: docs/rewrite/phase-3a/decisions.md#p3a-2-flat-per-element-theme-tokens-become-internal
 */
export function createTheme(input: FlatThemeInput): FlatThemeInput {
  return freezeCopy(input);
}
