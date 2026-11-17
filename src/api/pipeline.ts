import { useMemo } from 'react';
import type { NodeTable } from '../model';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import type { Preset } from '../plugins/presets';
import type { HtmlMode, ParserBackend } from '../parse';
import {
  useRenderCtx,
  type Components,
  type FootnotePressInfo,
  type ImagePressInfo,
  type ImagesPolicy,
  type LinkPressInfo,
  type PluginComponents,
  type RenderHandlers,
  type ScriptFallback,
  type SoftBreak,
  type TaskToggleInfo,
} from '../render';
import type { RenderCtx } from '../render/context';
import {
  useResolvedTheme,
  type ElementOverrides,
  type ThemeProp,
} from '../theme';
import { tableOf, type MarkdownDocument } from './document';
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
  /**
   * Which images load; the rest render as their alt text. Default
   * `'allow'`. Use `'deny'` or `{ allowHosts }` for untrusted content.
   */
  readonly images?: ImagesPolicy;
  /** Makes task list checkboxes interactive. */
  readonly onTaskToggle?: (checked: boolean, info: TaskToggleInfo) => void;
  /**
   * Makes footnote references and back-links pressable. The app scrolls:
   * `info.direction` says where to go (P1-15).
   */
  readonly onFootnotePress?: (label: string, info: FootnotePressInfo) => void;
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

/** The markdown input plus how it renders. */
export type MarkdownPipelineProps = MarkdownInput & MarkdownRenderOptions;

/** What every block container renders from. */
export interface MarkdownPipeline {
  readonly table: NodeTable;
  readonly ctx: RenderCtx;
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

function htmlEqual(a: HtmlMode | undefined, b: HtmlMode | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return shallowEqualArray(a.allow, b.allow);
}

/**
 * The one block pipeline behind `<Markdown>` (every container) and
 * `useMarkdownBlocks()`: stabilizes the props, parses `source` (or unwraps
 * `document`) and builds the render context.
 *
 * Memoization is internal: `theme`, `components`, `plugins`, `preset`,
 * `html` and `images` are compared shallowly, key by key, so inline objects
 * and arrays don't rebuild the render context. Handlers are read through a
 * ref, so inline callbacks never re-render a block.
 *
 * `caller` names the API in the missing-input error.
 */
export function useMarkdownPipeline(
  props: MarkdownPipelineProps,
  caller: string
): MarkdownPipeline {
  const {
    source,
    document,
    onLinkPress,
    onImagePress,
    onTaskToggle,
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

  const parsed = useMemo(() => {
    if (document !== undefined) return document;
    if (source === undefined) {
      throw new TypeError(`${caller} needs a \`source\` or a \`document\`.`);
    }
    return parse(source, { preset, html, plugins, backend });
  }, [document, source, preset, html, plugins, backend, caller]);

  const mergedComponents = useMemo(
    () => mergeComponents(plugins, components),
    [plugins, components]
  );

  const themeLayers = useMemo(() => {
    const layers: ElementOverrides[] = [];
    for (const plugin of plugins) {
      if (plugin.theme) layers.push(plugin.theme);
    }
    return layers;
  }, [plugins]);
  const theme = useResolvedTheme(props.theme, themeLayers);

  const handlers: RenderHandlers = {
    onLinkPress,
    onImagePress,
    onTaskToggle,
    onFootnotePress,
  };
  const ctx = useRenderCtx({
    theme,
    components: mergedComponents,
    handlers,
    softBreak,
    scriptFallback,
    images,
    selectable,
    maxFontSizeMultiplier,
  });

  return { table: tableOf(parsed), ctx };
}
