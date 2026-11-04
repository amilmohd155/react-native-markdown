import { useMemo } from 'react';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import type { Preset } from '../plugins/presets';
import type { HtmlMode, ParserBackend } from '../parse';
import {
  BlockList,
  useRenderCtx,
  type Components,
  type FootnotePressInfo,
  type ImagePressInfo,
  type LinkPressInfo,
  type PluginComponents,
  type RenderHandlers,
  type ScriptFallback,
  type SoftBreak,
  type TaskToggleInfo,
} from '../render';
import {
  useResolvedTheme,
  type ElementOverrides,
  type ThemeProp,
} from '../theme';
import { tableOf, type MarkdownDocument } from './document';
import { mergeComponents } from './mergeComponents';
import { parse } from './parse';
import { shallowEqualArray, shallowEqualObject, useStable } from './stable';

/** Where the markdown comes from: raw text, or a document from `parse()`. */
type MarkdownInput =
  | {
      /** Markdown text, parsed at render time (and memoized). */
      readonly source: string;
      readonly document?: never;
    }
  | {
      /** Pre-parsed with `parse()`: no parsing during render. */
      readonly document: MarkdownDocument;
      readonly source?: never;
    };

/**
 * Props of `<Markdown>`. Spec: docs/rewrite/04-api.md#markdown
 */
export type MarkdownProps = MarkdownInput & {
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
};

const NO_PLUGINS: readonly MarkdownPlugin[] = Object.freeze([]);

function presetEqual(a: Preset | undefined, b: Preset | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return a.base === b.base && shallowEqualArray(a.exclude, b.exclude);
}

function htmlEqual(a: HtmlMode | undefined, b: HtmlMode | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return shallowEqualArray(a.allow, b.allow);
}

/**
 * Renders markdown as native components.
 * Spec: docs/rewrite/04-api.md#markdown
 *
 * Memoization is internal: `theme`, `components`, `plugins`, `preset` and
 * `html` are compared shallowly, key by key, so inline objects and arrays
 * don't rebuild the render context. Handlers are read through a ref, so
 * inline callbacks never re-render a block.
 */
export function Markdown(props: MarkdownProps) {
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

  const parsed = useMemo(() => {
    if (document !== undefined) return document;
    if (source === undefined) {
      throw new TypeError('<Markdown> needs a `source` or a `document`.');
    }
    return parse(source, { preset, html, plugins, backend });
  }, [document, source, preset, html, plugins, backend]);

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
    selectable,
    maxFontSizeMultiplier,
  });

  return <BlockList table={tableOf(parsed)} ctx={ctx} />;
}
