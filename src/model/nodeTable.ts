import type { NodeAttrs } from './types';

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

  // Block index: one entry per top-level block, in document order
  /** Number of top-level blocks. */
  readonly blockCount: number;
  /** Node id of each top-level block. */
  readonly blocks: Int32Array;
  /** Source offset (UTF-16) where each block starts. */
  readonly blockStart: Int32Array;
  /** Source offset (UTF-16, exclusive) where each block ends. */
  readonly blockEnd: Int32Array;
  /** FNV-1a hash of each block's source slice. */
  readonly blockHash: Uint32Array;
}
