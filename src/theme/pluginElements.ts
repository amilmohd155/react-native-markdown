/**
 * Props of the elements plugins add, by element name (without `children` and
 * `style`). Empty here: a plugin package augments it so `components`
 * type-checks its elements:
 *
 * ```ts
 * declare module '@docren/react-native-markdown' {
 *   interface PluginElementPropsMap {
 *     Mention: { userId: string };
 *   }
 * }
 * ```
 *
 * Declared in a file of its own that the public entry re-exports with
 * `export *`: TypeScript merges a `declare module` augmentation into the
 * package's exports only through that kind of re-export chain, not through
 * named re-exports (`export type { X } from`). Keep it that way
 * (src/__tests__/contract.test.tsx checks the by-name augmentation).
 */

export interface PluginElementPropsMap {}

/** Names of the elements plugins add (those declared in the map above). */
export type PluginElementName = keyof PluginElementPropsMap & string;

/**
 * Theme keys plugins add, with their prop types. Empty here: a plugin
 * augments it, like `PluginElementPropsMap` (same `export *` chain):
 *
 * ```ts
 * declare module '@docren/react-native-markdown' {
 *   interface PluginThemeMap {
 *     callout?: { color?: string };
 *   }
 * }
 * ```
 *
 * Keys must not be core keys, `dark` or `light`; a clash makes
 * `FlatThemeBlock` and `FlatThemeInput` resolve to `never`, so every use
 * fails to compile. Keep the `export *` re-export chain of
 * `PluginElementPropsMap` in mind: augmentation only merges through it.
 */
export interface PluginThemeMap {}
