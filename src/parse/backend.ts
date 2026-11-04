import type { NodeTable } from '../model';
import type { MarkdownPlugin } from '../plugins/definePlugin';

/** Which syntax set to parse. GFM is a set of built-in plugins (M2). */
export type Preset = 'commonmark' | 'gfm';

/**
 * How raw HTML is handled (D3). HTML is always tokenized; this decides how
 * the converter maps it. Spec: docs/rewrite/04-api.md#raw-html
 */
export type HtmlMode =
  | 'safe'
  | 'text'
  | 'strip'
  | { readonly allow: readonly string[] };

export interface ParseOptions {
  /** Default `'gfm'`. */
  readonly preset?: Preset;
  /** Default `'safe'`. */
  readonly html?: HtmlMode;
  /**
   * Extra plugins, applied after the preset's, in array order. Reuse the
   * same plugin objects across parses: the parser is cached per plugin list.
   */
  readonly plugins?: readonly MarkdownPlugin[];
}

/**
 * A parser backend turns markdown source into the private node table.
 * The JS backend wraps markdown-it; a native backend (phase 4) must emit
 * the same table layout. Spec: docs/rewrite/03-architecture.md#1-parser-layer
 */
export interface ParserBackend {
  readonly name: string;
  /** Parse a whole document. */
  parse(source: string, options?: ParseOptions): NodeTable;
  /**
   * Parse `source` from `offset`, which must be a top-level block boundary.
   * Offsets in the result are absolute. Used for streaming (phase 2).
   */
  parseFrom?(source: string, offset: number, options?: ParseOptions): NodeTable;
}
