import { lightTheme } from './tokens';
import type {
  ElementOverride,
  ElementOverrides,
  HeadingLevel,
  Theme,
  ThemeInput,
  ThemeTokens,
} from './types';

/**
 * Shallow per-key merge of one token group. `undefined` values in the patch
 * are skipped, except where `allowUndefined` is set (`fonts.body` and
 * `fonts.heading`, where `undefined` means "the system font").
 */
function mergeGroup<T extends object>(
  base: T,
  patch: Partial<T> | undefined,
  allowUndefined = false
): T {
  if (patch === undefined) return base;
  const out = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== undefined || allowUndefined) out[key] = value as T[keyof T];
  }
  return Object.freeze(out);
}

/**
 * Merges user tokens onto a base token set (layers 1 and 2 of the merge
 * order). Groups merge key by key, scalars and `listBullets` replace.
 * Spec: docs/rewrite/phase-1/theme-resolution.md#merge-order
 */
export function mergeTokens(
  base: ThemeTokens,
  input: ThemeInput | undefined
): ThemeTokens {
  if (input === undefined) return base;
  return Object.freeze({
    colors: mergeGroup(base.colors, input.colors),
    fonts: mergeGroup(base.fonts, input.fonts, true),
    fontSize: mergeGroup(base.fontSize, input.fontSize),
    lineHeight: input.lineHeight ?? base.lineHeight,
    spacing: mergeGroup(base.spacing, input.spacing),
    radius: mergeGroup(base.radius, input.radius),
    listBullets:
      input.listBullets === undefined
        ? base.listBullets
        : Object.freeze([...input.listBullets]),
  });
}

function mergeOverride(
  a: ElementOverride | undefined,
  b: ElementOverride | undefined
): ElementOverride | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Object.freeze({
    ...(a.text !== undefined || b.text !== undefined
      ? { text: { ...a.text, ...b.text } }
      : null),
    ...(a.container !== undefined || b.container !== undefined
      ? { container: { ...a.container, ...b.container } }
      : null),
  });
}

type HeadingOverride = NonNullable<ElementOverrides['Heading']>;

function mergeHeading(
  a: HeadingOverride | undefined,
  b: HeadingOverride
): HeadingOverride {
  if (a === undefined) return b;
  if (typeof a !== 'function' && typeof b !== 'function') {
    return mergeOverride(a, b) ?? {};
  }
  // A function on either side: compose, so `b` still wins at every level.
  const at = (o: HeadingOverride, level: HeadingLevel) =>
    typeof o === 'function' ? o(level) : o;
  return (level) => mergeOverride(at(a, level), at(b, level)) ?? {};
}

/**
 * Merges element overrides per element, `text` and `container` separately.
 * `b` wins over `a`.
 */
export function mergeElements(
  a: ElementOverrides | undefined,
  b: ElementOverrides | undefined
): ElementOverrides {
  if (a === undefined) return b ?? {};
  if (b === undefined) return a;
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (value === undefined) continue;
    out[key] =
      key === 'Heading'
        ? mergeHeading(a.Heading, value as HeadingOverride)
        : mergeOverride(
            (a as Record<string, ElementOverride | undefined>)[key],
            value as ElementOverride
          );
  }
  return Object.freeze(out) as ElementOverrides;
}

/**
 * Builds a theme: `input` merged onto `base` (the light theme by default).
 * Pass `darkTheme`, or another created theme, as `base` to build on it.
 *
 * Tokens merge per group, key by key. Element overrides merge per element,
 * `text` and `container` separately, with `input` winning. The result is
 * frozen and also a valid `ThemeInput`, so it can go straight to
 * `<Markdown theme>`.
 * Spec: docs/rewrite/04-api.md#theme
 */
export function createTheme(
  input: ThemeInput,
  base: ThemeTokens | Theme = lightTheme
): Theme {
  const baseElements = 'elements' in base ? base.elements : undefined;
  return Object.freeze({
    ...mergeTokens(base, input),
    // Copy, so the user's own `elements` object is never frozen.
    elements: Object.freeze({
      ...mergeElements(baseElements, input.elements),
    }),
  });
}
