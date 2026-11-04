import { useMemo, useRef } from 'react';
import { getDefaultTheme, type ResolvedTheme } from '../theme';
import type { Components } from './elements';

/** How soft line breaks render (P1-2). */
export type SoftBreak = 'space' | 'newline';

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

/** Event handlers. URL policy and the default `Linking` call arrive in M5. */
export interface RenderHandlers {
  /** Return `false` to cancel the default handling. */
  readonly onLinkPress?: (href: string, info: LinkPressInfo) => boolean | void;
  readonly onImagePress?: (src: string, info: ImagePressInfo) => void;
  /** Makes task list checkboxes interactive. */
  readonly onTaskToggle?: (checked: boolean, info: TaskToggleInfo) => void;
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
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = Object.freeze({
  softBreak: 'space',
  selectable: false,
  maxFontSizeMultiplier: null,
  interactiveTasks: false,
  interactiveImages: false,
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
  const handlers = useRef<RenderHandlers>({});
  handlers.current = input.handlers ?? {};

  const theme = input.theme ?? getDefaultTheme();
  const options = optionsOf(input);
  const {
    softBreak,
    selectable,
    maxFontSizeMultiplier,
    interactiveTasks,
    interactiveImages,
  } = options;

  return useMemo(
    () =>
      Object.freeze({
        theme,
        components: input.components,
        handlers,
        options,
      }),
    // `options` is rebuilt each render; its fields are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      theme,
      input.components,
      softBreak,
      selectable,
      maxFontSizeMultiplier,
      interactiveTasks,
      interactiveImages,
    ]
  );
}
