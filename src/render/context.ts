import { useInsertionEffect, useMemo, useRef } from 'react';
import { getDefaultTheme, type ResolvedTheme } from '../theme';
import type { Components } from './elements';

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

/** Event handlers. */
export interface RenderHandlers {
  /** Return `false` to cancel the default handling. */
  readonly onLinkPress?: (href: string, info: LinkPressInfo) => boolean | void;
  readonly onImagePress?: (src: string, info: ImagePressInfo) => void;
  /** Makes task list checkboxes interactive. */
  readonly onTaskToggle?: (checked: boolean, info: TaskToggleInfo) => void;
  /** Makes footnote references and back-links pressable. */
  readonly onFootnotePress?: (label: string, info: FootnotePressInfo) => void;
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
  /** True when `onFootnotePress` is set: references and back-links are pressable. */
  readonly interactiveFootnotes: boolean;
  readonly scriptFallback: ScriptFallback;
}

const NO_HANDLERS: RenderHandlers = Object.freeze({});

export const DEFAULT_RENDER_OPTIONS: RenderOptions = Object.freeze({
  softBreak: 'space',
  selectable: false,
  maxFontSizeMultiplier: null,
  interactiveTasks: false,
  interactiveImages: false,
  interactiveFootnotes: false,
  scriptFallback: 'smaller',
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
    interactiveFootnotes: input.handlers?.onFootnotePress !== undefined,
    scriptFallback:
      input.scriptFallback ?? DEFAULT_RENDER_OPTIONS.scriptFallback,
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
  const interactiveFootnotes = latest.onFootnotePress !== undefined;
  const scriptFallback =
    input.scriptFallback ?? DEFAULT_RENDER_OPTIONS.scriptFallback;

  const options = useMemo<RenderOptions>(
    () =>
      Object.freeze({
        softBreak,
        selectable,
        maxFontSizeMultiplier,
        interactiveTasks,
        interactiveImages,
        interactiveFootnotes,
        scriptFallback,
      }),
    [
      softBreak,
      selectable,
      maxFontSizeMultiplier,
      interactiveTasks,
      interactiveImages,
      interactiveFootnotes,
      scriptFallback,
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
