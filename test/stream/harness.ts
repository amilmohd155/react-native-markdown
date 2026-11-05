/**
 * Stream equivalence harness (phase 2, S1.6).
 * Design: docs/rewrite/phase-2/testing-harness.md#equivalence-harness
 *
 * Invariant: after EVERY flush, the streamed table equals
 * `parse(source so far)`, compared as `documentToHtml` (exact string) and
 * column by column over `[0, count)`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAttrs, getText, type NodeTable } from '../../src/model';
import { parseWithMarkdownIt, type ParseOptions } from '../../src/parse';
import { createMarkdownStreamCoreWith } from '../../src/stream/createMarkdownStream';
import type { FlushStats } from '../../src/stream/types';
import { documentToHtml } from '../utils/documentToHtml';

// --- table comparison ---------------------------------------------------

const COLUMNS = [
  'type',
  'flags',
  'parent',
  'firstChild',
  'nextSibling',
] as const;
const BLOCK_COLUMNS = ['blocks', 'blockStart', 'blockEnd'] as const;

/** First structural difference between two tables, or null when equal. */
export function diffTables(
  actual: NodeTable,
  expected: NodeTable
): string | null {
  if (actual.count !== expected.count) {
    return `count: ${actual.count} !== ${expected.count}`;
  }
  if (actual.blockCount !== expected.blockCount) {
    return `blockCount: ${actual.blockCount} !== ${expected.blockCount}`;
  }
  if (actual.source !== expected.source) return 'source differs';
  if (actual.context !== expected.context) {
    return `context: ${JSON.stringify(actual.context)} !== ${JSON.stringify(expected.context)}`;
  }
  for (const col of COLUMNS) {
    const a = actual[col];
    const e = expected[col];
    for (let i = 0; i < expected.count; i++) {
      if (a[i] !== e[i]) return `${col}[${i}]: ${a[i]} !== ${e[i]}`;
    }
  }
  for (const col of BLOCK_COLUMNS) {
    const a = actual[col];
    const e = expected[col];
    for (let i = 0; i < expected.blockCount; i++) {
      if (a[i] !== e[i]) return `${col}[${i}]: ${a[i]} !== ${e[i]}`;
    }
  }
  for (let i = 0; i < expected.blockCount; i++) {
    if (actual.blockContext[i] !== expected.blockContext[i]) {
      return `blockContext[${i}]: ${JSON.stringify(actual.blockContext[i])} !== ${JSON.stringify(expected.blockContext[i])}`;
    }
  }
  // Text and attrs by value: their indexes into `strings`/`attrs` may
  // legitimately differ after a splice.
  for (let i = 0; i < expected.count; i++) {
    if (getText(actual, i) !== getText(expected, i)) {
      return `text of node ${i}: ${JSON.stringify(getText(actual, i))} !== ${JSON.stringify(getText(expected, i))}`;
    }
    const a = JSON.stringify(getAttrs(actual, i));
    const e = JSON.stringify(getAttrs(expected, i));
    if (a !== e) return `attrs of node ${i}: ${a} !== ${e}`;
  }
  return null;
}

/** Null when `actual` equals `expected` (HTML and columns), else a reason. */
export function diffDocuments(
  actual: NodeTable,
  expected: NodeTable
): string | null {
  const html = documentToHtml(actual);
  const expectedHtml = documentToHtml(expected);
  if (html !== expectedHtml) {
    return `html differs:\n  streamed: ${JSON.stringify(html)}\n  full:     ${JSON.stringify(expectedHtml)}`;
  }
  return diffTables(actual, expected);
}

// --- work counter ------------------------------------------------------

/**
 * Whether the work-counter assertions run. Off until the real core (S1.5)
 * lands; turn on with `STREAM_WORK=1`. With the stub, every flush reports
 * `fullReparse: true`, which the non-strict check allows anyway.
 */
export const WORK_ASSERTIONS = process.env.STREAM_WORK === '1';
/** Strict mode also rejects `fullReparse` outside done/reset/declared triggers. */
export const WORK_STRICT = process.env.STREAM_WORK_STRICT === '1';

export interface WorkContext {
  /** Start offset of the open (last) block BEFORE this append; source length when none. */
  openBlockStart: number;
  /** Length of the source after the append. */
  sourceLength: number;
  chunkLength: number;
  /** Case declares full-reparse triggers (ref defs, footnotes), so fullReparse is fine. */
  allowFullReparse: boolean;
}

/**
 * Returns a violation message, or null. A non-full flush may re-parse at
 * most the open block plus the new chunk; the fence fast path at most the
 * chunk (it appends without parsing).
 */
export function checkWork(stats: FlushStats, ctx: WorkContext): string | null {
  if (stats.fullReparse) {
    if (stats.path !== 'full') return `fullReparse with path '${stats.path}'`;
    if (WORK_STRICT && !ctx.allowFullReparse) {
      return 'unexpected full re-parse (no trigger declared for this case)';
    }
    return null;
  }
  if (stats.path === 'full') return "path 'full' without fullReparse";
  const bound =
    stats.path === 'fence-fast-path'
      ? ctx.chunkLength
      : ctx.sourceLength - ctx.openBlockStart;
  // A tail parse whose prefix defines footnotes re-tokenizes the whole source
  // (accepted, stream-algorithm.md; revisit at S5): fine in declared cases.
  if (
    stats.charsReparsed > bound &&
    !(ctx.allowFullReparse && stats.path === 'tail')
  ) {
    return `charsReparsed ${stats.charsReparsed} exceeds bound ${bound} (path ${stats.path})`;
  }
  return null;
}

/**
 * Start of the region an append may legitimately re-parse: the open (last)
 * block, widened by the lines before it that the open block can still change
 * (definitions in the gap, a predecessor that could absorb it by lazy
 * continuation). With no blocks: the last (partial) line.
 */
export function openRegionStart(table: NodeTable, source: string): number {
  const n = table.blockCount;
  if (n === 0) return source.lastIndexOf('\n') + 1;
  const open = n - 1;
  if (open === 0) return 0;
  const gapStart = table.blockEnd[open - 1]!;
  return gapStart === table.blockStart[open]
    ? table.blockStart[open - 1]!
    : gapStart;
}

// --- chunkers ----------------------------------------------------------

export type Chunker = (source: string) => string[];

export function fixed(size: number): Chunker {
  return (source) => {
    const out: string[] = [];
    for (let i = 0; i < source.length; i += size)
      out.push(source.slice(i, i + size));
    return out;
  };
}

/* eslint-disable no-bitwise -- PRNG arithmetic */
/** mulberry32: small seeded PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random split sizes in [1, maxSize], deterministic per seed. */
export function seeded(seed: number, maxSize = 40): Chunker {
  return (source) => {
    const next = rng(seed);
    const out: string[] = [];
    let i = 0;
    while (i < source.length) {
      const n = 1 + Math.floor(next() * maxSize);
      out.push(source.slice(i, i + n));
      i += n;
    }
    return out;
  };
}

/** A two-chunk split at `at`. */
export function splitAt(at: number): Chunker {
  return (source) =>
    at <= 0 || at >= source.length
      ? [source]
      : [source.slice(0, at), source.slice(at)];
}

/** Every two-chunk split of a (short) source. */
export function everyPosition(
  source: string
): { name: string; chunks: string[] }[] {
  const out: { name: string; chunks: string[] }[] = [];
  for (let at = 1; at < source.length; at++) {
    out.push({ name: `split@${at}`, chunks: splitAt(at)(source) });
  }
  return out;
}

/**
 * Splits at awkward points, as three-chunk splits around each point
 * (point-1, point, point+1 boundaries are covered by two chunkers each):
 * inside a surrogate pair, between `\r` and `\n`, and inside a fence marker
 * (a run of 3+ backticks or tildes at the start of a line).
 */
export function awkwardSplits(
  source: string
): { name: string; chunks: string[] }[] {
  const points = new Map<number, string>();
  for (let i = 0; i < source.length - 1; i++) {
    const c = source.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) points.set(i + 1, 'surrogate');
    if (c === 13 && source.charCodeAt(i + 1) === 10) points.set(i + 1, 'crlf');
  }
  const fence = /^ {0,3}(`{3,}|~{3,})/gm;
  for (let m = fence.exec(source); m; m = fence.exec(source)) {
    const start = m.index + m[0].length - m[1]!.length;
    for (let k = 1; k < m[1]!.length; k++)
      points.set(start + k, 'fence-marker');
  }
  return [...points].map(([at, kind]) => ({
    name: `${kind}@${at}`,
    chunks: splitAt(at)(source),
  }));
}

// --- the equivalence run ----------------------------------------------

export interface RunOptions {
  parse?: ParseOptions;
  allowFullReparse?: boolean;
}

export interface Failure {
  message: string;
}

/**
 * Streams `chunks`, comparing against a full parse after every flush and
 * once more after `done()`. Throws an Error describing the first failure,
 * with the chunk index and the source so far.
 */
export function streamAndCompare(
  chunks: readonly string[],
  label: string,
  { parse, allowFullReparse = false }: RunOptions = {}
): void {
  const core = createMarkdownStreamCoreWith(parse, {
    fenceFastPath: process.env.STREAM_NO_FENCE_FAST !== '1',
  });
  const fail = (what: string, at: number): never => {
    throw new Error(
      `[${label}] ${what}\n  after chunk ${at} of ${chunks.length}` +
        `\n  chunk: ${JSON.stringify(chunks[at]?.slice(0, 200))}` +
        `\n  source so far (tail): ${JSON.stringify(core.source.slice(-200))}`
    );
  };

  for (let i = 0; i < chunks.length; i++) {
    const before = core.table;
    const openBlockStart = openRegionStart(before, core.source);
    const chunk = chunks[i]!;
    const table = core.append(chunk);

    const expected = parseWithMarkdownIt(core.source, parse).table;
    const diff = diffDocuments(table, expected);
    if (diff) fail(`streamed != parse(source): ${diff}`, i);
    if (core.table !== table) fail('core.table is not the returned table', i);

    if (WORK_ASSERTIONS) {
      const violation = checkWork(core.lastFlush, {
        openBlockStart,
        sourceLength: core.source.length,
        chunkLength: chunk.length,
        allowFullReparse,
      });
      if (violation) fail(`work counter: ${violation}`, i);
    }
  }

  // Guard: done() equals a full parse of everything.
  const last = chunks.length - 1;
  const done = core.done();
  const diff = diffDocuments(
    done,
    parseWithMarkdownIt(chunks.join(''), parse).table
  );
  if (diff) fail(`done() != parse(source): ${diff}`, last);
  if (core.source !== chunks.join(''))
    fail('source differs from the joined chunks', last);
}

// --- allowlist ---------------------------------------------------------

export interface StreamAllowlistEntry {
  /** `<group>:<name>`, e.g. `commonmark:19` or `targeted:setext late`. */
  key: string;
  reason: string;
  issue: string;
}

/** Loads test/fixtures/stream-allowlist.json (shrink-only, like allowlist.json). */
export function loadStreamAllowlist(): Map<string, StreamAllowlistEntry> {
  const raw: unknown = JSON.parse(
    readFileSync(
      join(__dirname, '..', 'fixtures', 'stream-allowlist.json'),
      'utf8'
    )
  );
  if (!Array.isArray(raw)) {
    throw new Error('test/fixtures/stream-allowlist.json must be a JSON array');
  }
  const entries = new Map<string, StreamAllowlistEntry>();
  for (const entry of raw as StreamAllowlistEntry[]) {
    if (!entry.key || !entry.reason || !entry.issue) {
      throw new Error(
        `Stream allowlist entry ${entry.key} needs a key, reason and issue`
      );
    }
    entries.set(entry.key, entry);
  }
  return entries;
}
