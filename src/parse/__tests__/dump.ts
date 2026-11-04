import {
  childIds,
  Flag,
  getAttrs,
  getText,
  nodeTypeName,
  ROOT,
  type NodeTable,
} from '../../model';

export interface Dumped {
  type: string;
  flags?: string[];
  text?: string;
  attrs?: unknown;
  children?: Dumped[];
}

const FLAG_NAMES = Object.entries(Flag) as [string, number][];

/** Readable nested view of a node table, for assertions. */
export function dump(table: NodeTable, id = ROOT): Dumped {
  const node: Dumped = { type: nodeTypeName(table.type[id]!) };
  const flags = FLAG_NAMES.filter(([, bit]) => table.flags[id]! & bit).map(
    ([name]) => name
  );
  if (flags.length) node.flags = flags;
  const text = getText(table, id);
  if (text !== null) node.text = text;
  const attrs = getAttrs(table, id);
  if (attrs !== null) node.attrs = attrs;
  const children = childIds(table, id).map((c) => dump(table, c));
  if (children.length) node.children = children;
  return node;
}

/** Root's children only. */
export const dumpBlocks = (table: NodeTable): Dumped[] =>
  dump(table).children ?? [];
