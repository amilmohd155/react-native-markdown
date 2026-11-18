import { useInsertionEffect, useMemo, useRef } from 'react';
import { getDefaultTheme, type ResolvedTheme } from '../theme';
import type { Components } from './elements';
import type { FootnoteFocusConfig } from './footnoteFocus';
import type { ImagesPolicy } from './imagePolicy';

/** How soft line breaks render (P1-2). */
export type SoftBreak = 'space' | 'newline';

/**
 * Superscript/subscript content with no Unicode form (P1-17): `'smaller'`
 * renders smaller text on the baseline; `'raised'` an inline view raised or
 * lowered from the baseline (accessibility, copy and style inheritance
 * costs, see P1-17).
 */
export type ScriptFallback = 'smaller' | 'raised';

export interface LinkPressInfo {
  readonly title: string | null;
}
export interface ImagePressInfo {
  readonly alt: string;
  readonly title: string | null;
}
export interface TaskToggleInfo {
  /** Position of the item in its list. */
  readonly index: number;
}
/**
 * Where a footnote press should go (P1-15). The app scrolls; the renderer
 * doesn't own the scroll view.
 */
export interface FootnotePressInfo {
  /** The footnote's number (as shown). */
  readonly index: number;
  /**
   * `'definition'`: a reference was pressed, go to the definition.
   * `'reference'`: a back-link was pressed, go back to a reference.
   */
  readonly direction: 'reference' | 'definition';
  /** Which reference to the footnote, 1-based (matches the back-link marks). */
  readonly reference: number;
}

/**
 * Accessibility labels of footnote references and back-links (P3-11).
 * Keep the functions stable (module level): they are part of `ctx` identity.
 */
export interface FootnoteA11yLabels {
  /** A reference `[n]`; `index` is the footnote's number. */
  readonly reference: (index: number) => string;
  /**
   * A back-link; `reference` is which reference it returns to, 1-based
   * (the marks `↩`, `↩²`, ...).
   */
  readonly backLink: (index: number, reference: number) => string;
}

/** English labels, used unless `footnoteLabels` is set. */
export const DEFAULT_FOOTNOTE_LABELS: FootnoteA11yLabels = Object.freeze({
  reference: (index: number) => `Footnote ${index}`,
  backLink: (index: number, reference: number) =>
    reference > 1
      ? `Back to reference ${index} (${reference})`
      : `Back to reference ${index}`,
});

/**
 * The visible text of a footnote back-link (P3-13): `reference` is which
 * reference it returns to (1-based), `total` how many the footnote has.
 * Keep the function stable (module level): it is part of `ctx` identity.
 */
export type FootnoteBackLinkMark = (reference: number, total: number) => string;

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * The default text, GitHub's: "↩", then "↩²", "↩³"... for the next
 * references. U+FE0E asks for text presentation: iOS draws an emoji button
 * without it.
 */
export const DEFAULT_FOOTNOTE_BACK_LINK_MARK: FootnoteBackLinkMark = (
  reference
) =>
  reference > 1
    ? `↩\uFE0E${String(reference)
        .split('')
        .map((d) => SUPERSCRIPT_DIGITS[Number(d)])
        .join('')}`
    : '↩\uFE0E';

/** Event handlers. */
export interface RenderHandlers {
  /** Return `false` to cancel the default handling. */
  readonly onLinkPress?: (href: string, info: LinkPressInfo) => boolean | void;
  readonly onImagePress?: (src: string, info: ImagePressInfo) => void;
  /** Makes task list checkboxes interactive. */
  readonly onTaskToggle?: (checked: boolean, info: TaskToggleInfo) => void;
  /**
   * Makes footnote references and back-links pressable. Return `false` to
   * skip the built-in jump of an owned container (P3-9).
   */
  readonly onFootnotePress?: (
    label: string,
    info: FootnotePressInfo
  ) => void | false;
}

/** Options that change what blocks render. Part of `ctx` identity. */
export interface RenderOptions {
  readonly softBreak: SoftBreak;
  readonly selectable: boolean;
  readonly maxFontSizeMultiplier: number | null;
  /** True when `onTaskToggle` is set: task checkboxes are pressable. */
  readonly interactiveTasks: boolean;
  /** True when `onImagePress` is set: block images are pressable. */
  readonly interactiveImages: boolean;
  /**
   * True when `onFootnotePress` is set (or an owned container jumps) and no
   * stream is running (P3-12): references and back-links are pressable.
   */
  readonly interactiveFootnotes: boolean;
  readonly footnoteLabels: FootnoteA11yLabels;
  readonly footnoteBackLinkMark: FootnoteBackLinkMark;
  /** P3-15; `null` unless `footnotes.target` or `highlight` is set. */
  readonly footnoteFocus: FootnoteFocusConfig | null;
  readonly scriptFallback: ScriptFallback;
  /** Which images load; the rest render as their alt text. */
  readonly images: ImagesPolicy;
}

const NO_HANDLERS: RenderHandlers = Object.freeze({});

const DEFAULT_RENDER_OPTIONS: RenderOptions = Object.freeze({
  softBreak: 'space',
  selectable: false,
  maxFontSizeMultiplier: null,
  interactiveTasks: false,
  interactiveImages: false,
  interactiveFootnotes: false,
  footnoteLabels: DEFAULT_FOOTNOTE_LABELS,
  footnoteBackLinkMark: DEFAULT_FOOTNOTE_BACK_LINK_MARK,
  footnoteFocus: null,
  scriptFallback: 'smaller',
  images: 'allow',
});

/**
 * Handlers behind a stable reference. Elements call through `current`, so
 * passing a new inline handler on every render doesn't change `ctx` and
 * doesn't re-render any block.
 */
export interface HandlersRef {
  readonly current: RenderHandlers;
}

/**
 * Everything a block needs besides its own node table rows.
 * Spec: docs/rewrite/03-architecture.md#block-memoized
 *
 * `Block`'s memo comparator checks `ctx` by identity, so a new `ctx` means
 * every block re-renders: it must only change when the theme, the component
 * map or a render option changes.
 */
export interface RenderCtx {
  readonly theme: ResolvedTheme;
  readonly components: Components;
  readonly handlers: HandlersRef;
  readonly options: RenderOptions;
}

export interface RenderCtxInput {
  /** Default: the built-in light theme. */
  readonly theme?: ResolvedTheme;
  /** Already merged (defaults → plugins → `components` prop, M5). */
  readonly components: Components;
  readonly handlers?: RenderHandlers;
  readonly softBreak?: SoftBreak;
  readonly selectable?: boolean;
  readonly maxFontSizeMultiplier?: number | null;
  readonly scriptFallback?: ScriptFallback;
  /** Default `'allow'`. Keep the reference stable: it is part of `ctx` identity. */
  readonly images?: ImagesPolicy;
  /** Default English. Keep the reference stable: it is part of `ctx` identity. */
  readonly footnoteLabels?: FootnoteA11yLabels;
  /** Default `↩`, `↩²`... Keep the reference stable: it is part of `ctx` identity. */
  readonly footnoteBackLinkMark?: FootnoteBackLinkMark;
  /** P3-15. Keep the reference stable: it is part of `ctx` identity. */
  readonly footnoteFocus?: FootnoteFocusConfig | null;
  /** A stream is running: footnote links are inert (P3-12). Default `false`. */
  readonly footnotesInert?: boolean;
}

function optionsOf(input: RenderCtxInput): RenderOptions {
  return Object.freeze({
    softBreak: input.softBreak ?? DEFAULT_RENDER_OPTIONS.softBreak,
    selectable: input.selectable ?? DEFAULT_RENDER_OPTIONS.selectable,
    maxFontSizeMultiplier:
      input.maxFontSizeMultiplier ??
      DEFAULT_RENDER_OPTIONS.maxFontSizeMultiplier,
    interactiveTasks: input.handlers?.onTaskToggle !== undefined,
    interactiveImages: input.handlers?.onImagePress !== undefined,
    interactiveFootnotes:
      input.handlers?.onFootnotePress !== undefined &&
      input.footnotesInert !== true,
    footnoteLabels:
      input.footnoteLabels ?? DEFAULT_RENDER_OPTIONS.footnoteLabels,
    footnoteBackLinkMark:
      input.footnoteBackLinkMark ?? DEFAULT_RENDER_OPTIONS.footnoteBackLinkMark,
    footnoteFocus: input.footnoteFocus ?? null,
    scriptFallback:
      input.scriptFallback ?? DEFAULT_RENDER_OPTIONS.scriptFallback,
    images: input.images ?? DEFAULT_RENDER_OPTIONS.images,
  });
}

/** Builds a frozen `ctx` (outside React: tests, `visit`, benchmarks). */
export function createRenderCtx(input: RenderCtxInput): RenderCtx {
  return Object.freeze({
    theme: input.theme ?? getDefaultTheme(),
    components: input.components,
    handlers: Object.freeze({ current: input.handlers ?? {} }),
    options: optionsOf(input),
  });
}

/**
 * `ctx` for a render. Its identity changes only when the theme, the
 * component map or an option changes; handlers are read through a ref.
 */
export function useRenderCtx(input: RenderCtxInput): RenderCtx {
  // Latest handlers, read by elements on press (always after commit).
  // Updated in an effect, not during render (rules of React).
  const handlers = useRef<RenderHandlers>(NO_HANDLERS);
  const latest = input.handlers ?? NO_HANDLERS;
  useInsertionEffect(() => {
    handlers.current = latest;
  });

  const theme = input.theme ?? getDefaultTheme();
  const softBreak = input.softBreak ?? DEFAULT_RENDER_OPTIONS.softBreak;
  const selectable = input.selectable ?? DEFAULT_RENDER_OPTIONS.selectable;
  const maxFontSizeMultiplier =
    input.maxFontSizeMultiplier ?? DEFAULT_RENDER_OPTIONS.maxFontSizeMultiplier;
  const interactiveTasks = latest.onTaskToggle !== undefined;
  const interactiveImages = latest.onImagePress !== undefined;
  const interactiveFootnotes =
    latest.onFootnotePress !== undefined && input.footnotesInert !== true;
  const footnoteLabels =
    input.footnoteLabels ?? DEFAULT_RENDER_OPTIONS.footnoteLabels;
  const footnoteBackLinkMark =
    input.footnoteBackLinkMark ?? DEFAULT_RENDER_OPTIONS.footnoteBackLinkMark;
  const footnoteFocus = input.footnoteFocus ?? null;
  const scriptFallback =
    input.scriptFallback ?? DEFAULT_RENDER_OPTIONS.scriptFallback;
  const images = input.images ?? DEFAULT_RENDER_OPTIONS.images;

  const options = useMemo<RenderOptions>(
    () =>
      Object.freeze({
        softBreak,
        selectable,
        maxFontSizeMultiplier,
        interactiveTasks,
        interactiveImages,
        interactiveFootnotes,
        footnoteLabels,
        footnoteBackLinkMark,
        footnoteFocus,
        scriptFallback,
        images,
      }),
    [
      softBreak,
      selectable,
      maxFontSizeMultiplier,
      interactiveTasks,
      interactiveImages,
      interactiveFootnotes,
      footnoteLabels,
      footnoteBackLinkMark,
      footnoteFocus,
      scriptFallback,
      images,
    ]
  );

  const { components } = input;
  // Not frozen: passing the ref into a call during render counts as reading
  // it for the React Compiler. The object is internal (reached through
  // context only) and never mutated.
  return useMemo(
    () => ({ theme, components, handlers, options }),
    [theme, components, options]
  );
}
