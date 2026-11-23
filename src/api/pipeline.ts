import { useEffect, useMemo, useState } from 'react';
import type { NodeTable } from '../model';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import type { Preset } from '../plugins/presets';
import type { HtmlMode, ParserBackend } from '../parse';
import {
  createFootnoteFocusStore,
  useRenderCtx,
  type CodeBlockOptions,
  type CodeCopyInfo,
  type Components,
  type FootnoteBackLinkMark,
  type FootnoteA11yLabels,
  type FootnotePressInfo,
  type MentionPressInfo,
  type ImagePressInfo,
  type ImagesPolicy,
  type LinkPressInfo,
  type PluginComponents,
  type RenderHandlers,
  type ScriptFallback,
  type SoftBreak,
  type TaskToggleInfo,
} from '../render';
import type { ImageErrorInfo, RenderCtx } from '../render/context';
import type { ImageSize } from '../render/imageSize';
import {
  DEFAULT_FOOTNOTE_HIGHLIGHT_DURATION,
  type FootnoteFocusConfig,
  type FootnoteFocusStore,
} from '../render/footnoteFocus';
import { footnoteSectionIndex } from '../render/footnoteTargets';
import type { FadePlan } from '../render/fade';
import {
  useResolvedTheme,
  type FlatThemeBlock,
  type ThemeProp,
} from '../theme';
import { streamInfoOf, tableOf, type MarkdownDocument } from './document';
import { useFadePlan } from './fade';
import { mergeComponents } from './mergeComponents';
import { parse } from './parse';
import {
  presetEqual,
  shallowEqualArray,
  shallowEqualObject,
  useStable,
} from './stable';

/** Where the markdown comes from: raw text, or a document from `parse()`. */
export type MarkdownInput =
  | {
      /** Markdown text, parsed at render time (and memoized). */
      readonly source: string;
      readonly document?: never;
    }
  | {
      /**
       * Pre-parsed with `parse()`, or streamed with `useMarkdownStream()`:
       * no parsing during render.
       */
      readonly document: MarkdownDocument;
      readonly source?: never;
    };

/**
 * Everything that changes how blocks render, shared by `<Markdown>` and
 * `useMarkdownBlocks()`. Spec: docs/rewrite/04-api.md#markdown
 */
export interface MarkdownRenderOptions {
  /**
   * Syntax set to parse. Default `'gfm'`. Ignored with `document`, which was
   * parsed with its own preset.
   */
  readonly preset?: Preset;
  /**
   * Added on top of the preset, in order. Their `components` and `theme`
   * also apply to a `document` (parse it with the same plugins).
   */
  readonly plugins?: readonly MarkdownPlugin[];
  /** Replaces single elements. Merged over the defaults and plugins. */
  readonly components?: Partial<Components> & PluginComponents;
  /** Tokens and element overrides, or `'light' | 'dark' | 'auto'`. */
  readonly theme?: ThemeProp;
  /** Called first for every link; return `false` to cancel the default. */
  readonly onLinkPress?: (href: string, info: LinkPressInfo) => boolean | void;
  readonly onImagePress?: (src: string, info: ImagePressInfo) => void;
  /** Called when an image fails to load; a press on it retries (P3-36). */
  readonly onImageError?: (info: ImageErrorInfo) => void;
  /**
   * Called for a press on a mention (the `mentions` plugin). When absent the
   * press goes to `onLinkPress` with the raw url.
   */
  readonly onMentionPress?: (info: MentionPressInfo) => void;
  /**
   * Which images load; the rest render as their alt text. Default
   * `'allow'`. Use `'deny'` or `{ allowHosts }` for untrusted content.
   */
  readonly images?: ImagesPolicy;
  /**
   * Known sizes by image `src`, `{ [src]: { width, height } }`: the image
   * reserves its box on the first render, with no layout shift (P3-36).
   * The object may be inline.
   */
  readonly imageSizes?: Readonly<Record<string, ImageSize>>;
  /**
   * Called after a task checkbox is toggled by a tap (P3-16). The library
   * flips the box itself; persist the state in your source if you need it.
   */
  readonly onTaskToggle?: (info: TaskToggleInfo) => void;
  /**
   * Task checkboxes toggle on tap. Default `true`; `false` is read-only: no
   * press, no callback. Boxes are also inert while a stream runs (P3-18).
   */
  readonly enableTaskListItemToggle?: boolean;
  /**
   * Makes footnote references and back-links pressable (P1-15).
   * `info.direction` says where to go. In `scroll` and `virtualize` the
   * container then jumps there; return `false` to skip the jump (P3-9).
   * Not called while a stream is running (P3-12). The third argument is
   * the definition's offset with `footnotes.target: 'definition'` (P3-15).
   */
  readonly onFootnotePress?: (
    label: string,
    info: FootnotePressInfo,
    scroll: FootnoteScrollOffset
  ) => void | false;
  /**
   * Footnote text: accessibility labels and the back-link mark (P3-11,
   * P3-13). The functions inside must be stable (module level): new ones on
   * every render rebuild the render context. The object itself may be inline.
   */
  readonly footnotes?: FootnotesOptions;
  /**
   * Code block parts: `header`, `lineNumbers`, `wrap`. All default `false`
   * (P3-35). The object may be inline.
   */
  readonly codeBlock?: CodeBlockOptions;
  /**
   * A press on a code block's Copy button (P3-35). The button shows only
   * when this is set; write `info.code` to the clipboard yourself.
   */
  readonly onCopyPress?: (info: CodeCopyInfo) => void;
  /** Raw HTML handling. Default `'safe'`. Ignored with `document`. */
  readonly html?: HtmlMode;
  /** How soft line breaks render. Default `'space'` (P1-2). */
  readonly softBreak?: SoftBreak;
  /** Superscript/subscript with no Unicode form. Default `'smaller'`. */
  readonly scriptFallback?: ScriptFallback;
  /** Text selection within each block. Default `false`. */
  readonly selectable?: boolean;
  /** Accessibility cap on font scaling. Default unset. */
  readonly maxFontSizeMultiplier?: number;
  /** Parser backend. Default: JS (markdown-it). Ignored with `document`. */
  readonly backend?: ParserBackend;
}

/** The `footnotes` prop of `<Markdown>`. */
export interface FootnotesOptions {
  /**
   * Accessibility labels of references and back-links, e.g. to translate
   * them. Default English.
   */
  readonly labels?: FootnoteA11yLabels;
  /**
   * The visible text of a back-link: `(reference, total)` to a string, e.g.
   * `() => '↑'`. Default `↩`, then `↩²`, `↩³`...
   */
  readonly backLinkMark?: FootnoteBackLinkMark;
  /**
   * Where a reference press lands (P3-15). `'section'` (default): the
   * footnote section. `'definition'`: its own definition; `onFootnotePress`
   * and `onFootnoteScrollTo` get the definition's offset in the section.
   */
  readonly target?: 'section' | 'definition';
  /**
   * Flash the definition a reference press went to, and the reference a
   * back-link press returned to. Default off; `true` uses the theme's
   * `footnoteHighlight` colour and a 1500 ms flash (P3-15).
   */
  readonly highlight?:
    | boolean
    | {
        /** Default: the theme's. */
        readonly color?: string;
        /** Milliseconds of the whole flash. Default 1500. */
        readonly duration?: number;
      };
}

/**
 * Where the footnote definition sits, for `onFootnotePress` and
 * `onFootnoteScrollTo` (P3-15).
 */
export interface FootnoteScrollOffset {
  /**
   * y of the definition inside the footnote section block, to add to the
   * section's own position. Defined only for a reference press with
   * `footnotes.target: 'definition'`, once the definition has been measured.
   */
  readonly offset: number | undefined;
}

/** The markdown input plus how it renders. */
export type MarkdownPipelineProps = MarkdownInput & MarkdownRenderOptions;

/**
 * The built-in footnote jump (P3-8): an owned container sets `current` to a
 * function that scrolls to the target of a press, and `Markdown` passes the
 * ref to the pipeline. Internal.
 */
export interface FootnoteJumpRef {
  current:
    | ((
        label: string,
        info: FootnotePressInfo,
        scroll: FootnoteScrollOffset
      ) => void)
    | null;
}

/** What every block container renders from. */
export interface MarkdownPipeline {
  readonly table: NodeTable;
  readonly ctx: RenderCtx;
  /** Which new blocks fade in (P2b-5); null unless a stream asks for it. */
  readonly fade: FadePlan | null;
  /**
   * The document has footnotes and none is hidden: a container's footnote
   * jump has a target (false while a stream runs, P3-12).
   */
  readonly footnotes: boolean;
  /** The footnote focus config (P3-15), or null; same as in `ctx.options`. */
  readonly focus: FootnoteFocusConfig | null;
}

const NO_PLUGINS: readonly MarkdownPlugin[] = Object.freeze([]);

function imagesEqual(
  a: ImagesPolicy | undefined,
  b: ImagesPolicy | undefined
): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return shallowEqualArray(a.allowHosts, b.allowHosts);
}

function imageSizesEqual(
  a: Readonly<Record<string, ImageSize>> | undefined,
  b: Readonly<Record<string, ImageSize>> | undefined
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (y === undefined || x === undefined) return false;
    if (x.width !== y.width || x.height !== y.height) return false;
  }
  return true;
}

function htmlEqual(a: HtmlMode | undefined, b: HtmlMode | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return shallowEqualArray(a.allow, b.allow);
}

/**
 * The footnote focus (P3-15): one store per instance, a stable config while
 * `target` and the highlight don't change (the `footnotes` object may be
 * inline), and none while a stream runs (P3-12), when the store is cleared.
 */
function useFootnoteFocus(
  footnotes: FootnotesOptions | undefined,
  streaming: boolean
): FootnoteFocusConfig | null {
  const [store] = useState<FootnoteFocusStore>(createFootnoteFocusStore);
  const target = footnotes?.target ?? 'section';
  const highlight = footnotes?.highlight;
  const on = highlight !== undefined && highlight !== false;
  const color = typeof highlight === 'object' ? highlight.color : undefined;
  const duration =
    typeof highlight === 'object' ? highlight.duration : undefined;
  useEffect(() => {
    if (streaming) store.clear();
  }, [store, streaming]);
  return useMemo(() => {
    if (streaming || (target === 'section' && !on)) return null;
    return {
      store,
      target,
      highlight: on
        ? {
            color: color ?? null,
            duration: duration ?? DEFAULT_FOOTNOTE_HIGHLIGHT_DURATION,
          }
        : null,
    };
  }, [store, streaming, target, on, color, duration]);
}

/**
 * The handler of the render context. With a container's jump the handler
 * always exists, so links are pressable without one; it runs first and
 * `false` skips the jump and the flash (P3-9, P3-15).
 */
function footnotePressOf(
  onFootnotePress: MarkdownRenderOptions['onFootnotePress'],
  jump: FootnoteJumpRef | undefined,
  focus: FootnoteFocusConfig | null
): RenderHandlers['onFootnotePress'] {
  if (jump === undefined && onFootnotePress === undefined) return undefined;
  return (label, info) => {
    const y =
      focus?.target === 'definition' && info.direction === 'definition'
        ? focus.store.getDefinitionY(label)
        : undefined;
    const scroll: FootnoteScrollOffset = { offset: y };
    if (onFootnotePress?.(label, info, scroll) === false) return;
    if (jump === undefined) return;
    if (focus?.highlight) {
      focus.store.flash(
        info.direction === 'definition'
          ? { kind: 'definition', label }
          : { kind: 'reference', label, reference: info.reference }
      );
    }
    jump.current?.(label, info, scroll);
  };
}

/**
 * The one block pipeline behind `<Markdown>` (every container) and
 * `useMarkdownBlocks()`: stabilizes the props, parses `source` (or unwraps
 * `document`) and builds the render context.
 *
 * Memoization is internal: `theme`, `components`, `plugins`, `preset`,
 * `html`, `images` and `imageSizes` are compared shallowly, key by key, so inline objects
 * and arrays don't rebuild the render context. Handlers are read through a
 * ref, so inline callbacks never re-render a block.
 *
 * `caller` names the API in the missing-input error.
 */
export function useMarkdownPipeline(
  props: MarkdownPipelineProps,
  caller: string,
  jump?: FootnoteJumpRef
): MarkdownPipeline {
  const {
    source,
    document,
    onLinkPress,
    onImagePress,
    onImageError,
    onMentionPress,
    onTaskToggle,
    onCopyPress,
    enableTaskListItemToggle,
    onFootnotePress,
    softBreak,
    scriptFallback,
    selectable,
    maxFontSizeMultiplier,
    backend,
  } = props;

  const plugins = useStable(props.plugins ?? NO_PLUGINS, shallowEqualArray);
  const preset = useStable(props.preset, presetEqual);
  const html = useStable(props.html, htmlEqual);
  const components = useStable(props.components, shallowEqualObject);
  const images = useStable(props.images, imagesEqual);
  const imageSizes = useStable(props.imageSizes, imageSizesEqual);
  const codeBlock = useStable(props.codeBlock, shallowEqualObject);

  const parsed = useMemo(() => {
    if (document !== undefined) return document;
    if (source === undefined) {
      throw new TypeError(`${caller} needs a \`source\` or a \`document\`.`);
    }
    return parse(source, { preset, html, plugins, backend });
  }, [document, source, preset, html, plugins, backend, caller]);

  // While a stream runs, the footnote section is not rendered and footnote
  // links are inert (P3-12). The parse is unchanged: the view is the same
  // table one block shorter, kept per `parsed`, so unchanged blocks still
  // match by content.
  const full = tableOf(parsed);
  const streamInfo = streamInfoOf(parsed);
  const streaming = streamInfo !== undefined && !streamInfo.ended;
  const hasSection = footnoteSectionIndex(full) >= 0;
  const hidden = streaming && hasSection ? 1 : 0;
  const table = useMemo(
    () =>
      hidden === 0
        ? full
        : Object.freeze({ ...full, blockCount: full.blockCount - hidden }),
    [full, hidden]
  );

  const fade = useFadePlan(parsed, hidden);

  const mergedComponents = useMemo(
    () => mergeComponents(plugins, components),
    [plugins, components]
  );

  const themeLayers = useMemo(() => {
    const layers: FlatThemeBlock[] = [];
    for (const plugin of plugins) {
      if (plugin.theme) layers.push(plugin.theme);
    }
    return layers;
  }, [plugins]);
  const theme = useResolvedTheme(props.theme, themeLayers);

  // With a container's jump the handler always exists, so links are
  // pressable without one; it runs first and `false` skips the jump (P3-9).
  const footnoteLabels = useStable(props.footnotes?.labels, shallowEqualObject);
  const focus = useFootnoteFocus(props.footnotes, streaming);
  const footnotePress = footnotePressOf(onFootnotePress, jump, focus);
  const handlers: RenderHandlers = {
    onLinkPress,
    onImagePress,
    onImageError,
    onMentionPress,
    onTaskToggle,
    onCopyPress,
    onFootnotePress: footnotePress,
  };
  const ctx = useRenderCtx({
    theme,
    components: mergedComponents,
    handlers,
    softBreak,
    scriptFallback,
    images,
    imageSizes,
    selectable,
    maxFontSizeMultiplier,
    footnoteLabels,
    footnoteBackLinkMark: props.footnotes?.backLinkMark,
    footnoteFocus: focus,
    codeBlock,
    footnotesInert: streaming,
    interactiveTasks: enableTaskListItemToggle !== false && !streaming,
    // P3-19: the source text, or the stream's prefix (not `document`
    // identity, which changes on every flush). A pre-parsed document keys on
    // its text, so a re-parse of the same text keeps the overrides.
    taskResetKey:
      document === undefined
        ? source
        : (tableOf(parsed).prefixId ?? tableOf(parsed).source),
  });

  return { table, ctx, fade, footnotes: hasSection && !streaming, focus };
}
