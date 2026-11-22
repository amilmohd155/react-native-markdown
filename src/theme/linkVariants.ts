import type { ElementStyle, ResolvedTheme } from './types';

/**
 * Link variants (P3a-4): `link.variants` keys are regular expression sources
 * tested against the href. Compiled once per theme resolve (the theme cache
 * keeps the result), never at render. An invalid source is skipped.
 */

/** A variant's compiled pattern and props, before the style sheet. */
export interface CompiledVariant {
  readonly test: RegExp;
  readonly props: object;
}

/**
 * The variants of the merged `link` props, in object order. `onInvalid` gets
 * each source that does not compile (the resolver warns in development).
 */
export function compileLinkVariants(
  variants: Readonly<Record<string, object | undefined>> | undefined,
  onInvalid: (source: string) => void
): CompiledVariant[] {
  const out: CompiledVariant[] = [];
  if (variants === undefined) return out;
  for (const [source, props] of Object.entries(variants)) {
    if (typeof props !== 'object' || props === null) continue;
    try {
      out.push({ test: new RegExp(source), props });
    } catch {
      onInvalid(source);
    }
  }
  return out;
}

/**
 * The style of a link with this href: the first matching variant's, else
 * plain `Link`. `href` is matched as written (with or without a scheme).
 */
export function linkStyleFor(
  theme: Pick<ResolvedTheme, 'elements' | 'linkVariants'>,
  href: string
): ElementStyle {
  for (const variant of theme.linkVariants) {
    if (variant.test.test(href)) return variant.style;
  }
  return theme.elements.Link;
}
