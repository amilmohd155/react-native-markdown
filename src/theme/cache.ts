import type { FlatThemeBlock, FlatThemeInput } from './flatTypes';
import { getDefaultTheme, resolveTheme } from './resolve';
import type { ColorScheme, ResolvedTheme } from './types';

export type { ColorScheme };

/**
 * The `theme` prop: a built-in theme by name, `'auto'` (the built-in for the
 * current color scheme), or a flat theme merged onto the built-in theme for
 * the current scheme. `createTheme` results qualify.
 */
export type ThemeProp = FlatThemeInput | 'light' | 'dark' | 'auto';

const NO_PLUGINS: readonly FlatThemeBlock[] = Object.freeze([]);
const NO_INPUT: FlatThemeInput = Object.freeze({});
const EMPTY: Readonly<Record<string, unknown>> = Object.freeze({});

/** User themes kept before the least recently used is dropped. */
const MAX_ENTRIES = 16;

// -- equality ---------------------------------------------------------------

/** Same keys, values `===`. `undefined` equals an empty object. */
export function shallowEqual(
  a: object | undefined,
  b: object | undefined
): boolean {
  if (a === b) return true;
  const x = (a ?? EMPTY) as Record<string, unknown>;
  const y = (b ?? EMPTY) as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((key) => Object.hasOwn(y, key) && x[key] === y[key]);
}

/** Deepest nesting compared: block, key, prop, `syntax`/`variants`, kind. */
const MAX_DEPTH = 6;

/**
 * Theme inputs are plain data, so compare them by value: objects and arrays
 * key by key (equal key counts), everything else by `===` (a function by
 * identity). The deepest real nesting is `variants[pattern]` inside a key's
 * props inside a `dark`/`light` block.
 */
function dataEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (depth >= MAX_DEPTH) return false;
  if (typeof a !== 'object' || a === null) return false;
  if (typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(y, key) || !dataEqual(x[key], y[key], depth + 1)) {
      return false;
    }
  }
  return true;
}

function pluginsEqual(
  a: readonly FlatThemeBlock[],
  b: readonly FlatThemeBlock[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((layer, i) => layer === b[i]);
}

// -- cache ------------------------------------------------------------------

interface Entry {
  readonly scheme: ColorScheme;
  readonly input: FlatThemeInput;
  readonly plugins: readonly FlatThemeBlock[];
  readonly resolved: ResolvedTheme;
}

/** Most recently used first. */
let entries: Entry[] = [];

let darkResolved: ResolvedTheme | null = null;

/**
 * The built-in theme for a scheme: resolved on first use, kept for the
 * app's lifetime.
 */
function builtIn(scheme: ColorScheme): ResolvedTheme {
  if (scheme === 'light') return getDefaultTheme();
  darkResolved ??= resolveTheme({}, 'dark');
  return darkResolved;
}

function lookup(
  scheme: ColorScheme,
  input: FlatThemeInput,
  plugins: readonly FlatThemeBlock[]
): ResolvedTheme {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (
      entry.scheme === scheme &&
      pluginsEqual(entry.plugins, plugins) &&
      dataEqual(entry.input, input)
    ) {
      if (i > 0) {
        entries.splice(i, 1);
        entries.unshift(entry);
      }
      return entry.resolved;
    }
  }

  const resolved = resolveTheme(input, scheme, plugins);
  entries.unshift({ scheme, input, plugins, resolved });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return resolved;
}

/**
 * The resolved theme for a `theme` prop, a color scheme and the plugin
 * default blocks, from the cache when an equal one was resolved before.
 * Spec: docs/rewrite/phase-1/theme-resolution.md#caching
 *
 * - Key: `[scheme, input, plugins]`. The input (top-level keys and the
 *   `dark`/`light` blocks) is compared by value, per key and per prop, so an
 *   inline object literal with equal values hits. Plugin layers compare by
 *   identity.
 * - Built-in themes (`'light'`, `'dark'`, `'auto'`, without plugins) are
 *   resolved once per scheme and kept for the app's lifetime.
 * - Other themes sit in a small least-recently-used cache, so themes that
 *   change often can't grow it without bound.
 *
 * Inputs are treated as immutable: mutating one after it was cached is not
 * seen. `createTheme` returns frozen copies for that reason.
 */
export function resolveThemeProp(
  prop: ThemeProp,
  scheme: ColorScheme,
  plugins: readonly FlatThemeBlock[] = NO_PLUGINS
): ResolvedTheme {
  if (typeof prop === 'string') {
    const resolvedScheme = prop === 'auto' ? scheme : prop;
    return plugins.length === 0
      ? builtIn(resolvedScheme)
      : lookup(resolvedScheme, NO_INPUT, plugins);
  }
  return lookup(scheme, prop, plugins);
}

/** Empties the cache of user themes (built-ins stay). For tests. */
export function clearThemeCache(): void {
  entries = [];
}
