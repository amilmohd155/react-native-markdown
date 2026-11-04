import { mergeTokens } from './create';
import { getDefaultTheme, resolveTheme } from './resolve';
import { darkTheme, lightTheme } from './tokens';
import type {
  ElementOverrides,
  ResolvedTheme,
  Theme,
  ThemeInput,
} from './types';

/** The color scheme a theme is resolved for. */
export type ColorScheme = 'light' | 'dark';

/**
 * The `theme` prop: a built-in theme by name, `'auto'` (the built-in for the
 * current color scheme), or tokens and element overrides merged onto the
 * built-in theme for the current scheme. `createTheme` results qualify.
 */
export type ThemeProp = ThemeInput | 'light' | 'dark' | 'auto';

const NO_PLUGINS: readonly ElementOverrides[] = Object.freeze([]);
const NO_INPUT: ThemeInput = Object.freeze({});
const EMPTY: Readonly<Record<string, unknown>> = Object.freeze({});

/** User themes kept before the least recently used is dropped. */
const MAX_ENTRIES = 16;

// -- equality ---------------------------------------------------------------

/** Same keys, values `===`. `undefined` equals an empty object. */
function shallowEqual(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true;
  const x = (a ?? EMPTY) as Record<string, unknown>;
  const y = (b ?? EMPTY) as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(y, key) || x[key] !== y[key]) return false;
  }
  return true;
}

/** `===`, or both objects (a face map) with `===` values. */
function valueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null &&
    shallowEqual(a, b)
  );
}

/** A token group: same keys, values equal one level down (face maps). */
function groupEqual(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true;
  const x = (a ?? EMPTY) as Record<string, unknown>;
  const y = (b ?? EMPTY) as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(y, key) || !valueEqual(x[key], y[key])) return false;
  }
  return true;
}

/**
 * Element overrides: per element, `text` and `container` shallowly. A
 * `Heading` function is compared by identity, so an inline one never hits.
 */
function elementsEqual(
  a: ElementOverrides | undefined,
  b: ElementOverrides | undefined
): boolean {
  if (a === b) return true;
  const x = (a ?? EMPTY) as Record<string, unknown>;
  const y = (b ?? EMPTY) as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(y, key)) return false;
    const p = x[key];
    const q = y[key];
    if (p === q) continue;
    if (typeof p !== 'object' || p === null) return false;
    if (typeof q !== 'object' || q === null) return false;
    const po = p as { text?: object; container?: object };
    const qo = q as { text?: object; container?: object };
    if (!shallowEqual(po.text, qo.text)) return false;
    if (!shallowEqual(po.container, qo.container)) return false;
  }
  return true;
}

/** Theme inputs are equal when every group is, shallowly. */
function inputEqual(a: ThemeInput, b: ThemeInput): boolean {
  return (
    a === b ||
    (groupEqual(a.colors, b.colors) &&
      groupEqual(a.fonts, b.fonts) &&
      groupEqual(a.fontSize, b.fontSize) &&
      a.lineHeight === b.lineHeight &&
      groupEqual(a.spacing, b.spacing) &&
      groupEqual(a.radius, b.radius) &&
      shallowEqual(a.listBullets, b.listBullets) &&
      elementsEqual(a.elements, b.elements))
  );
}

function pluginsEqual(
  a: readonly ElementOverrides[],
  b: readonly ElementOverrides[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((layer, i) => layer === b[i]);
}

// -- cache ------------------------------------------------------------------

interface Entry {
  readonly scheme: ColorScheme;
  readonly input: ThemeInput;
  readonly plugins: readonly ElementOverrides[];
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
  darkResolved ??= resolveTheme(darkTheme);
  return darkResolved;
}

function lookup(
  scheme: ColorScheme,
  input: ThemeInput,
  plugins: readonly ElementOverrides[]
): ResolvedTheme {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (
      entry.scheme === scheme &&
      pluginsEqual(entry.plugins, plugins) &&
      inputEqual(entry.input, input)
    ) {
      if (i > 0) {
        entries.splice(i, 1);
        entries.unshift(entry);
      }
      return entry.resolved;
    }
  }

  const base = scheme === 'dark' ? darkTheme : lightTheme;
  const theme: Theme = {
    ...mergeTokens(base, input),
    elements: input.elements ?? {},
  };
  const resolved = resolveTheme(theme, plugins);
  entries.unshift({ scheme, input, plugins, resolved });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return resolved;
}

/**
 * The resolved theme for a `theme` prop, a color scheme and the plugin
 * element themes, from the cache when an equal one was resolved before.
 * Spec: docs/rewrite/phase-1/theme-resolution.md#caching
 *
 * - Key: `[scheme, input, plugins]`. The input is compared shallowly per
 *   group (`colors`, `fonts`, …, `elements`), so an inline object literal
 *   with equal values hits; so does one level of nesting (face maps, an
 *   element's `text` and `container`). Plugin layers compare by identity.
 * - Built-in themes (`'light'`, `'dark'`, `'auto'`, without plugins) are
 *   resolved once per scheme and kept for the app's lifetime.
 * - Other themes sit in a small least-recently-used cache, so themes that
 *   change often can't grow it without bound.
 *
 * Inputs are treated as immutable: mutating one after it was cached is not
 * seen. `createTheme` returns frozen objects for that reason.
 */
export function resolveThemeProp(
  prop: ThemeProp,
  scheme: ColorScheme,
  plugins: readonly ElementOverrides[] = NO_PLUGINS
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
