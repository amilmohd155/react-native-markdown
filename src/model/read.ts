import type { NodeTable } from './nodeTable';
import type { NodeAttrs } from './types';

const NONE = -1;

/** A node's text, or `null`. */
export function getText(table: NodeTable, id: number): string | null {
  const index = table.text[id]!;
  return index === NONE ? null : table.strings[index]!;
}

/** A node's attributes, or `null`. Callers narrow by node type. */
export function getAttrs(table: NodeTable, id: number): NodeAttrs | null {
  const index = table.attr[id]!;
  return index === NONE ? null : table.attrs[index]!;
}

/** Calls `fn` for each child of `id`, in order. Allocates nothing. */
export function forEachChild(
  table: NodeTable,
  id: number,
  fn: (child: number) => void
): void {
  for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
    fn(c);
  }
}

/** Child ids of `id`, in order. Allocates an array: prefer `forEachChild` in hot paths. */
export function childIds(table: NodeTable, id: number): number[] {
  const ids: number[] = [];
  forEachChild(table, id, (c) => ids.push(c));
  return ids;
}
