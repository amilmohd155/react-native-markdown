/**
 * Private document model (Phase 1 · M1).
 *
 * Contents:
 * - Node types, flag bits and per-type attributes (./types)
 * - NodeTable shape (./nodeTable), TableBuilder (./tableBuilder)
 * - Allocation-free readers (./read)
 * - Line offsets, block index, FNV-1a block hashing, block keys (./blockIndex)
 *
 * Design:
 * - docs/rewrite/03-architecture.md#2-document-model
 * - docs/rewrite/phase-1/token-mapping.md#node-types
 *
 * Never exported from the public entry point.
 */

export * from './types';
export type { NodeTable } from './nodeTable';
export {
  EMPTY_BLOCK_INDEX,
  NONE,
  ROOT,
  TableBuilder,
  type BlockIndex,
} from './tableBuilder';
export { childIds, forEachChild, getAttrs, getText } from './read';
export {
  BlockIndexBuilder,
  blockKey,
  computeLineOffsets,
  fnv1a,
  lineToOffset,
} from './blockIndex';
