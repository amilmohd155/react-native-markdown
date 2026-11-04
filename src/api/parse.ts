import type { NodeTable } from '../model';
import {
  markdownItBackend,
  parseWithMarkdownIt,
  type ParseOptions as BackendParseOptions,
  type ParserBackend,
  type ParserBackendImpl,
} from '../parse';
import { createDocument, type MarkdownDocument } from './document';

export interface ParseOptions extends BackendParseOptions {
  /** Parser backend. Default: the pure-JS markdown-it backend. */
  readonly backend?: ParserBackend;
  /**
   * Receives dev-mode warnings (e.g. unknown token types). Default: in dev,
   * `console.warn`; in production, nothing.
   */
  readonly onWarning?: (message: string) => void;
}

/**
 * Parses markdown into an opaque, immutable `MarkdownDocument`.
 * Spec: docs/rewrite/04-api.md#lower-level-api
 *
 * Pure and cacheable: the same source and options always produce an
 * equivalent document. Parse ahead of time (e.g. when a message arrives) and
 * render with `<Markdown document>` to keep parsing out of render.
 */
export function parse(
  source: string,
  options: ParseOptions = {}
): MarkdownDocument {
  const { backend = markdownItBackend, onWarning, ...parseOptions } = options;

  let table: NodeTable;
  if (backend === markdownItBackend) {
    const result = parseWithMarkdownIt(source, parseOptions);
    table = result.table;
    const report = onWarning ?? (isDev() ? defaultWarn : null);
    if (report) {
      for (const message of result.warnings) report(message);
    }
  } else {
    table = implOf(backend).parse(source, parseOptions);
  }

  if (isDev()) freezeTable(table);
  return createDocument(table);
}

/** The implementation behind a public backend handle. */
function implOf(backend: ParserBackend): ParserBackendImpl {
  if (typeof (backend as Partial<ParserBackendImpl>).parse !== 'function') {
    throw new TypeError(
      `Unsupported parser backend "${String(backend.name)}": expected one provided by the library.`
    );
  }
  return backend as ParserBackendImpl;
}

function defaultWarn(message: string): void {
  console.warn(`[react-native-markdown] ${message}`);
}

/** `__DEV__` as React Native and Jest define it; false when absent. */
function isDev(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}

/**
 * Dev-only guard against accidental mutation. Typed-array columns can't be
 * frozen (`Object.freeze` throws on non-empty views); they stay protected by
 * being unreachable from the public API.
 */
function freezeTable(table: NodeTable): void {
  for (const attrs of table.attrs) {
    for (const value of Object.values(attrs)) {
      if (Array.isArray(value)) Object.freeze(value);
    }
    Object.freeze(attrs);
  }
  Object.freeze(table.strings);
  Object.freeze(table.attrs);
  Object.freeze(table);
}
