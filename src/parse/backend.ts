import type { NodeTable } from '../model';
import type { CarriedContext, ParseFromResult } from '../stream/types';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import type { Preset } from '../plugins/presets';

export type { Preset };

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
 * A parser backend, as the public API sees it: an opaque handle for the
 * `backend` option. Backends are first-party (the JS markdown-it one by
 * default, `nativeBackend` in phase 4), so users pass one around but never
 * implement or call it, and the private node table stays out of the public
 * types. `parse()` rejects objects that aren't real backends.
 */
export interface ParserBackend {
  readonly name: string;
}

/**
 * What a parser backend implements: it turns markdown source into the
 * private node table. The JS backend wraps markdown-it; a native backend
 * (phase 4) must emit the same table layout.
 * Spec: docs/rewrite/03-architecture.md#1-parser-layer
 */
export interface ParserBackendImpl extends ParserBackend {
  /** Parse a whole document. */
  parse(source: string, options?: ParseOptions): NodeTable;
  /**
   * Parse `source` from `offset`, which must be a top-level block boundary.
   * Offsets in the result are absolute. Used for streaming (phase 2).
   */
  parseFrom?(
    source: string,
    offset: number,
    carried: CarriedContext | undefined,
    options?: ParseOptions
  ): ParseFromResult;
}
