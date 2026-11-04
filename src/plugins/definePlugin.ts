import type { MarkdownIt, Token } from 'markdown-it';
import type { PluginNodeAttrs } from '../model';

/**
 * How a plugin maps one markdown-it token to a node.
 * Spec: docs/rewrite/04-api.md#plugins,
 * docs/rewrite/phase-1/token-mapping.md#plugin-tokens
 */
export interface PluginNodeSpec {
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
   * Stored in the node table, so values must be plain and serializable.
   */
  readonly from: (token: Token) => PluginNodeAttrs;
}

/**
 * A markdown plugin: syntax for the parser backend plus the nodes it emits.
 * Internal for now; the public typing (with `components` and `theme`) comes
 * in M5. Spec: docs/rewrite/04-api.md#plugins
 */
export interface MarkdownPlugin {
  /** Unique per parse. Part of the document context (P1-9). */
  readonly name: string;
  readonly syntax?: {
    /** JS backend: called once on a fresh markdown-it instance. */
    readonly markdownIt?: (md: MarkdownIt) => void;
  };
  /** Node names (the future element names) → token mapping. */
  readonly nodes?: Readonly<Record<string, PluginNodeSpec>>;
}

/** Declares a plugin. An identity function that exists for type inference. */
export function definePlugin<P extends MarkdownPlugin>(plugin: P): P {
  return plugin;
}
