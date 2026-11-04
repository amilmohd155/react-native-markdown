import type { MarkdownIt, Token } from 'markdown-it';
import type { ComponentType, ReactNode } from 'react';
import type { PluginNodeAttrs } from '../model';
import type { Components } from '../render/elements';
import type { ElementOverride, ElementOverrides, ElementStyle } from '../theme';

/**
 * How a plugin maps one markdown-it token to a node.
 * Spec: docs/rewrite/04-api.md#plugins,
 * docs/rewrite/phase-1/token-mapping.md#plugin-tokens
 */
export interface PluginNodeSpec<
  Attrs extends PluginNodeAttrs = PluginNodeAttrs,
> {
  /** Where the node may appear. Tokens of the other kind are ignored. */
  readonly kind: 'block' | 'inline';
  /**
   * Token type. A self-contained token matches exactly (`math_inline`); an
   * `*_open`/`*_close` pair is registered by its base name
   * (`container_note`) and becomes a container node.
   */
  readonly token: string;
  /** Inline only: may render a View as an inline attachment (D8). */
  readonly inlineView?: boolean;
  /**
   * The node's props, from its token (the `_open` token for containers).
   * Stored in the node table, so values must be plain and serializable
   * (`string | number | boolean | null`).
   */
  readonly from: (token: Token) => Attrs;
}

/** What a plugin component receives for node `Attrs`. */
export type PluginElementComponentProps<Attrs> = Attrs & {
  /** Rendered children, for container nodes. Absent on leaf nodes. */
  readonly children?: ReactNode;
  /** The resolved theme style for this element. */
  readonly style: ElementStyle;
  /**
   * Declared inline views (`inlineView: true`) only: where the text
   * baseline sits, to align the attachment. See `InlineViewProps`.
   */
  readonly baseline?: number;
};

/**
 * A markdown plugin: syntax for the parser backend, the nodes it emits, and
 * the components and theme that render them.
 * Spec: docs/rewrite/04-api.md#plugins
 *
 * `N` maps each node (element) name to its props. Declare it by writing
 * `nodes`; `definePlugin` infers it, so `components` are type-checked.
 */
export interface MarkdownPlugin<
  N extends Record<string, PluginNodeAttrs> = {},
> {
  /** Unique per parse. Part of the document context (P1-9). */
  readonly name: string;
  readonly syntax?: {
    /** JS backend: called once on a fresh markdown-it instance. */
    readonly markdownIt?: (md: MarkdownIt) => void;
  };
  /** Node names (the element names) → token mapping. */
  readonly nodes?: { readonly [K in keyof N]: PluginNodeSpec<N[K]> };
  /**
   * Components for this plugin's nodes, or replacements for built-in
   * elements. Merge order: defaults → plugins (in order) → `components`
   * prop.
   */
  readonly components?: Partial<Components> & {
    readonly [K in keyof NoInfer<N>]?: ComponentType<
      PluginElementComponentProps<N[K]>
    >;
  };
  /**
   * Theme overrides for this plugin's elements and built-in ones. Later
   * plugins win, then the `theme` prop.
   */
  readonly theme?: ElementOverrides & {
    readonly [K in keyof NoInfer<N>]?: ElementOverride;
  };
}

/**
 * Declares a plugin. An identity function that exists for type inference:
 * the plugin's node props (`N`) come from the `from` functions in `nodes`,
 * and the name stays a literal type (e.g. for preset exclusions).
 *
 * ```ts
 * const mentions = definePlugin({
 *   name: 'mentions',
 *   syntax: { markdownIt: mentionSyntax },
 *   nodes: {
 *     Mention: { kind: 'inline', token: 'mention', from: (t) => ({ userId: t.content }) },
 *   },
 *   components: { Mention: ({ userId }) => <Text>@{userId}</Text> }, // userId: string
 * });
 * ```
 */
export function definePlugin<
  const Name extends string,
  N extends Record<string, PluginNodeAttrs> = {},
>(
  plugin: MarkdownPlugin<N> & { readonly name: Name }
): MarkdownPlugin<N> & { readonly name: Name } {
  return plugin;
}
