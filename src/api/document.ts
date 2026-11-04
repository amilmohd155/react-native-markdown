import type { NodeTable } from '../model';

/**
 * A parsed markdown document: an opaque, immutable handle.
 *
 * Create it with `parse()`, pass it to `<Markdown document>` (M5), cache it,
 * or parse ahead of render time. The node table inside is private: it is
 * never reachable from the public API, so its layout can change (or come
 * from a native backend) without breaking anyone.
 */
export interface MarkdownDocument {
  /** Number of top-level blocks. */
  readonly blockCount: number;
}

/** Internal: the table behind each handle. Not exported from the package. */
const tables = new WeakMap<MarkdownDocument, NodeTable>();

/** Internal: wraps a table in a new opaque handle. */
export function createDocument(table: NodeTable): MarkdownDocument {
  const document: MarkdownDocument = Object.freeze({
    blockCount: table.blockCount,
  });
  tables.set(document, table);
  return document;
}

/**
 * Internal: the node table behind a handle, for the renderer and `visit`.
 * Throws for objects that weren't created by `parse()`.
 */
export function tableOf(document: MarkdownDocument): NodeTable {
  const table = tables.get(document);
  if (!table) {
    throw new TypeError(
      'Expected a MarkdownDocument created by parse(); got another object.'
    );
  }
  return table;
}
