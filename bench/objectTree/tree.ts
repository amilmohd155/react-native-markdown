/**
 * Object-tree document model: option B in docs/rewrite/08-model-and-api.md.
 * TEST/BENCH ONLY (benchmark-protocol.md, "Table vs. object tree A/B"). Not
 * part of the library: nothing under src/ imports this folder, and nothing
 * here is exported from the package.
 *
 * Same content as the flat `NodeTable`, one JS object per node with a
 * `children` array. The tree is built from a parsed table, so the A/B
 * compares what the renderer retains and walks, not the parse (time
 * `buildObjectTree` separately and subtract it from `firstRender`).
 *
 * The tree keeps no reference to the table: only the source string (shared,
 * as in the table) plus the strings and attribute objects its nodes use.
 */
import {
  NONE,
  PLUGIN_NODE_TYPE_MIN,
  type NodeAttrs,
  type NodeTable,
  type PluginNodeInfo,
} from '../../src/model';

export interface TreeNode {
  /**
   * Node id in the table the tree was built from. Kept so React keys (and so
   * rendered output) match the flat-table renderer; a native object tree
   * would not need it.
   */
  readonly id: number;
  readonly type: number;
  readonly flags: number;
  readonly text: string | null;
  readonly attrs: NodeAttrs | null;
  readonly children: readonly TreeNode[];
  /** Plugin nodes only. */
  readonly plugin?: PluginNodeInfo;
}

/** One top-level block, with what `isSameBlock` compares. */
export interface TreeBlock {
  readonly root: TreeNode;
  readonly start: number;
  readonly end: number;
  readonly context: string;
}

export interface ObjectTree {
  readonly source: string;
  /** Document context (see `NodeTable.context`). */
  readonly context: string;
  readonly blocks: readonly TreeBlock[];
}

const NO_CHILDREN: readonly TreeNode[] = Object.freeze([]);

function buildNode(table: NodeTable, id: number): TreeNode {
  const type = table.type[id]!;
  let children = NO_CHILDREN;
  if (table.firstChild[id] !== NONE) {
    const list: TreeNode[] = [];
    for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
      list.push(buildNode(table, c));
    }
    children = list;
  }
  const text = table.text[id]!;
  const attr = table.attr[id]!;
  const node: TreeNode = {
    id,
    type,
    flags: table.flags[id]!,
    text: text === NONE ? null : table.strings[text]!,
    attrs: attr === NONE ? null : table.attrs[attr]!,
    children,
  };
  if (type >= PLUGIN_NODE_TYPE_MIN) {
    return { ...node, plugin: table.pluginNodes[type - PLUGIN_NODE_TYPE_MIN] };
  }
  return node;
}

/** Converts a node table to an object tree. */
export function buildObjectTree(table: NodeTable): ObjectTree {
  const blocks: TreeBlock[] = new Array(table.blockCount);
  for (let i = 0; i < table.blockCount; i++) {
    blocks[i] = {
      root: buildNode(table, table.blocks[i]!),
      start: table.blockStart[i]!,
      end: table.blockEnd[i]!,
      context: table.blockContext[i]!,
    };
  }
  return { source: table.source, context: table.context, blocks };
}

/** Same rule as `isSameBlock` (P1-9), over tree blocks. */
export function isSameTreeBlock(
  a: ObjectTree,
  i: number,
  b: ObjectTree,
  j: number
): boolean {
  if (a.context !== b.context) return false;
  const x = a.blocks[i]!;
  const y = b.blocks[j]!;
  if (x.context !== y.context) return false;
  if (x.end - x.start !== y.end - y.start) return false;
  if (a.source === b.source && x.start === y.start) return true;
  return (
    a.source.slice(x.start, x.end) ===
    b.source.slice(y.start, y.start + x.end - x.start)
  );
}
