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

/**
 * Internal: where a streamed document stands, set by `useMarkdownStream` on
 * every document it publishes (P2b-5, P2b-6). Absent on `parse()` results.
 */
export interface StreamInfo {
  /** Identity of the hook instance that published the document. */
  readonly stream: object;
  /** Increments on every `reset()`: a new stream. */
  readonly epoch: number;
  /** `done()` published this epoch's exact parse. Stays set until `reset()`. */
  readonly ended: boolean;
  /** Fade-in duration in ms for new blocks, or `null` for no animation. */
  readonly fade: number | null;
}

/** Internal: the table behind each handle. Not exported from the package. */
const tables = new WeakMap<MarkdownDocument, NodeTable>();
const streams = new WeakMap<MarkdownDocument, StreamInfo>();

/** Internal: wraps a table in a new opaque handle. */
export function createDocument(
  table: NodeTable,
  stream?: StreamInfo
): MarkdownDocument {
  const document: MarkdownDocument = Object.freeze({
    blockCount: table.blockCount,
  });
  tables.set(document, table);
  if (stream !== undefined) streams.set(document, stream);
  return document;
}

/** Internal: the stream state of a document from `useMarkdownStream`. */
export function streamInfoOf(
  document: MarkdownDocument
): StreamInfo | undefined {
  return streams.get(document);
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
