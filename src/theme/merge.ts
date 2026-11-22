import type { FlatThemeBlock, FlatThemeInput } from './flatTypes';
import type { ColorScheme } from './types';
import { darkTheme, lightTheme } from './tokens';

/**
 * Merges flat theme blocks (P3a-2). Per key, per prop, shallowly; the maps
 * in `NESTED` and the child groups in `CHILDREN` merge one level deeper, and `variants` two (per pattern, prop
 * by prop). `undefined` values are skipped.
 * Spec: docs/rewrite/phase-3a/theme-props.md
 */

type Props = Record<string, unknown>;
type Block = Record<string, Props | undefined>;

/**
 * Props whose value is itself a map that merges key by key: the syntax
 * palette, link variants, admonition kinds, and a checked item's text style
 * (so `{ opacity: 1 }` keeps the line-through).
 */
const NESTED: ReadonlySet<string> = new Set([
  'syntax',
  'variants',
  'admonitions',
  'checkedText',
]);

/**
 * Child groups of a family key (`codeBlock.header`,
 * `footnote.*`): each merges prop by prop, so a layer that sets one prop of a
 * child keeps the child's others and the family's other children.
 */
const CHILDREN: Readonly<Record<string, ReadonlySet<string>>> = {
  codeBlock: new Set(['header']),
  footnote: new Set(['reference', 'backLink', 'definition']),
};

function isMap(value: unknown): value is Props {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `link.variants`: the same pattern merges prop by prop (`over` wins) and
 * keeps its original position; new patterns append in `over` order.
 */
function mergeVariants(base: Props, over: Props): Props {
  const out: Props = { ...base };
  for (const pattern of Object.keys(over)) {
    const value = over[pattern];
    if (value === undefined) continue;
    const prev = out[pattern];
    out[pattern] =
      isMap(prev) && isMap(value) ? mergeProps(prev, value) : value;
  }
  return out;
}

function mergeProps(
  a: Props | undefined,
  b: Props | undefined,
  children?: ReadonlySet<string>
) {
  const out: Props = { ...a };
  if (b === undefined) return out;
  for (const key of Object.keys(b)) {
    const value = b[key];
    if (value === undefined) continue;
    const prev = out[key];
    if (children?.has(key) && isMap(prev) && isMap(value)) {
      out[key] = mergeProps(prev, value);
    } else if (NESTED.has(key) && isMap(prev) && isMap(value)) {
      out[key] =
        key === 'variants' ? mergeVariants(prev, value) : { ...prev, ...value };
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** `over` merged onto `base`, key by key. Neither is modified. */
function mergeBlock(base: Block, over: Block | undefined): Block {
  if (over === undefined) return base;
  const out: Block = { ...base };
  for (const key of Object.keys(over)) {
    const props = over[key];
    if (props === undefined) continue;
    out[key] = mergeProps(out[key], props, CHILDREN[key]);
  }
  return out;
}

/**
 * The flat block a theme resolves from. Merge order: the built-in theme of
 * `scheme`, plugin default blocks (in plugin order), the user's top-level
 * keys, the user's `dark`/`light` block for `scheme`.
 */
export function mergeFlat(
  scheme: ColorScheme,
  layers: readonly FlatThemeBlock[],
  input: FlatThemeInput
): FlatThemeBlock {
  let out = (scheme === 'dark' ? darkTheme : lightTheme) as Block;
  for (const layer of layers) out = mergeBlock(out, layer as Block);
  const { dark, light, ...top } = input;
  out = mergeBlock(out, top as Block);
  out = mergeBlock(
    out,
    (scheme === 'dark' ? dark : light) as Block | undefined
  );
  return out as FlatThemeBlock;
}
