import {
  getAttrs,
  NodeType,
  NONE,
  type NodeAttrsMap,
  type NodeTable,
} from '../model';
import type { FootnotePressInfo } from './context';

/**
 * Where a footnote press scrolls to (P3-10): top-level block indexes in a
 * node table. Used by the owned containers' footnote jump.
 */

/** Index of the footnote section (always the last block), or -1. */
export function footnoteSectionIndex(table: NodeTable): number {
  const last = table.blockCount - 1;
  return last >= 0 &&
    table.type[table.blocks[last]!] === NodeType.FootnoteSection
    ? last
    : -1;
}

/**
 * Per label, the top-level block of each reference, by `subId`. Built on
 * the first back-link press and kept for that table: a table is immutable
 * and every stream flush makes a new one, so nothing else invalidates it.
 */
const lookups = new WeakMap<NodeTable, Map<string, number[]>>();

function buildLookup(table: NodeTable): Map<string, number[]> {
  const blockOf = new Map<number, number>();
  for (let i = 0; i < table.blockCount; i++) blockOf.set(table.blocks[i]!, i);
  const byLabel = new Map<string, number[]>();
  for (let id = 0; id < table.count; id++) {
    if (table.type[id] !== NodeType.FootnoteReference) continue;
    const attrs = getAttrs(table, id) as
      | NodeAttrsMap[typeof NodeType.FootnoteReference]
      | null;
    if (attrs === null) continue;
    let block: number | undefined;
    for (let n = id; n !== NONE && block === undefined; n = table.parent[n]!) {
      block = blockOf.get(n);
    }
    if (block === undefined) continue;
    let blocks = byLabel.get(attrs.label);
    if (blocks === undefined) byLabel.set(attrs.label, (blocks = []));
    blocks[attrs.subId] = block;
  }
  return byLabel;
}

/**
 * The block to scroll to for a footnote press, or `undefined` when there is
 * none (no section, or no such reference). A reference (`'definition'`) goes
 * to the section; a back-link (`'reference'`) to the block holding that
 * label's Nth reference (`info.reference`, 1-based).
 */
export function footnoteTarget(
  table: NodeTable,
  label: string,
  info: FootnotePressInfo
): number | undefined {
  if (info.direction === 'definition') {
    const section = footnoteSectionIndex(table);
    return section < 0 ? undefined : section;
  }
  let lookup = lookups.get(table);
  if (lookup === undefined) {
    lookup = buildLookup(table);
    lookups.set(table, lookup);
  }
  return lookup.get(label)?.[info.reference - 1];
}
