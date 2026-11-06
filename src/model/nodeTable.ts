import type { NodeAttrs, PluginNodeInfo } from './types';

/**
 * The private, flat, struct-of-arrays document representation.
 * Spec: docs/rewrite/03-architecture.md#2-document-model
 *
 * Node `i` is described by index `i` of every per-node column. Node ids come
 * out in document order, and each top-level block occupies a contiguous id
 * range, which is what makes streaming splices cheap.
 *
 * Built by `TableBuilder` (M1 task 2); this file only fixes the shape.
 */
export interface NodeTable {
  /** Number of nodes. Columns may be longer (capacity); read only `[0, count)`. */
  readonly count: number;

  // Per-node columns
  /** `NodeType` id (built-in or plugin). */
  readonly type: Uint8Array;
  /** `Flag` bits. */
  readonly flags: Uint8Array;
  /** Parent node id; -1 for the root. */
  readonly parent: Int32Array;
  /** First child node id; -1 if none. */
  readonly firstChild: Int32Array;
  /** Next sibling node id; -1 if none. */
  readonly nextSibling: Int32Array;
  /** Index into `strings`; -1 if the node has no text. */
  readonly text: Int32Array;
  /** Index into `attrs`; -1 if the node has no attributes. */
  readonly attr: Int32Array;

  readonly strings: readonly string[];
  readonly attrs: readonly NodeAttrs[];
  /**
   * Plugin node types used by this table's parse configuration, indexed by
   * `type - PLUGIN_NODE_TYPE_MIN`. Empty without plugin nodes.
   */
  readonly pluginNodes: readonly PluginNodeInfo[];

  // Block index: one entry per top-level block, in document order
  /** Number of top-level blocks. */
  readonly blockCount: number;
  /** Node id of each top-level block. */
  readonly blocks: Int32Array;
  /** Source offset (UTF-16) where each block starts. */
  readonly blockStart: Int32Array;
  /** Source offset (UTF-16, exclusive) where each block ends. */
  readonly blockEnd: Int32Array;
  /**
   * Per block: values it renders that come from outside its source text
   * (heading slugs; footnote numbers in M2). '' for most blocks.
   */
  readonly blockContext: readonly string[];

  // Block identity (P1-9, see `isSameBlock`)
  /** The parsed source. Referenced, not copied. */
  readonly source: string;
  /**
   * Document context: everything outside the source text that changes the
   * tree (preset, html mode, plugins, link reference definitions). Backends
   * must fill it; if it differs, every block counts as changed.
   */
  readonly context: string;

  // Stream identity (phase 2, table-splicing.md#issameblock-fast-path).
  // Set only by the stream core's splice; absent on ordinary parses.
  /** Identity token of the stable prefix; changes on every full re-parse. */
  readonly prefixId?: object;
  /** Blocks [0, stableCount) came from the prefix identified by `prefixId`. */
  readonly stableCount?: number;
}
