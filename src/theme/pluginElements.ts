/**
 * Props of the elements plugins add, by element name (without `children` and
 * `style`). Empty here: a plugin package augments it so `components` and
 * `theme.elements` type-check its elements:
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
 * Lives with the theme because `theme.elements` is keyed by it.
 */

export interface PluginElementPropsMap {}

/** Names of the elements plugins add (those declared in the map above). */
export type PluginElementName = keyof PluginElementPropsMap & string;
