import type { NodeTable } from './nodeTable';
import type { BlockIndex } from './tableBuilder';

/**
 * Start offset of every line in `source`, plus a final sentinel equal to
 * `source.length`. Line breaks are `\n`, `\r\n` and `\r`: the same breaks
 * markdown-it normalizes before tokenizing, so its `token.map` line numbers
 * index this table while offsets stay in the *original* source.
 */
export function computeLineOffsets(source: string): Int32Array {
  const offsets: number[] = [0];
  const length = source.length;

  // Fast path: no `\r` anywhere, so jump between `\n`s with native indexOf
  // instead of reading every character (much faster without a JIT).
  if (source.indexOf('\r') === -1) {
    for (
      let i = source.indexOf('\n');
      i !== -1;
      i = source.indexOf('\n', i + 1)
    ) {
      offsets.push(i + 1);
    }
    offsets.push(length);
    return Int32Array.from(offsets);
  }

  for (let i = 0; i < length; i++) {
    const code = source.charCodeAt(i);
    if (code === 10 /* \n */) {
      offsets.push(i + 1);
    } else if (code === 13 /* \r */) {
      if (source.charCodeAt(i + 1) === 10) i++;
      offsets.push(i + 1);
    }
  }
  offsets.push(length);
  return Int32Array.from(offsets);
}

/** Source offset where `line` starts; lines past the end clamp to `source.length`. */
export function lineToOffset(lineOffsets: Int32Array, line: number): number {
  return lineOffsets[Math.min(line, lineOffsets.length - 1)]!;
}

/**
 * Stable React key of a top-level block: its position.
 *
 * Index only, not the source offset: editing a block moves the offsets of
 * every later block, and offset-based keys would remount all of them. With
 * index keys they stay mounted and `isSameBlock` skips re-rendering them.
 * Inserting a block still shifts later keys (they re-render, not remount).
 */
export function blockKey(block: number): string {
  return String(block);
}

/**
 * Whether block `i` of `a` renders exactly like block `j` of `b` (P1-9).
 * The renderer uses this to skip unchanged blocks.
 *
 * Source text alone isn't enough: reference definitions, heading slugs and
 * parse options come from outside a block. So a block is the same only if:
 * 1. the document contexts match (options, definitions; see NodeTable.context),
 * 2. the block contexts match (values derived from other blocks),
 * 3. the block's source text matches (lengths first, then a native compare).
 */
export function isSameBlock(
  a: NodeTable,
  i: number,
  b: NodeTable,
  j: number
): boolean {
  // Stream fast path: both blocks sit in the stable prefix of the same
  // stream (prefixId changes on every full re-parse), so they are the same
  // by construction (phase 2, table-splicing.md).
  if (
    a.prefixId !== undefined &&
    a.prefixId === b.prefixId &&
    i < a.stableCount! &&
    j < b.stableCount! &&
    i === j
  ) {
    return true;
  }
  if (a.context !== b.context) return false;
  if (a.blockContext[i] !== b.blockContext[j]) return false;

  const aStart = a.blockStart[i]!;
  const aEnd = a.blockEnd[i]!;
  const bStart = b.blockStart[j]!;
  if (aEnd - aStart !== b.blockEnd[j]! - bStart) return false;
  if (a.source === b.source && aStart === bStart) return true;
  return (
    a.source.slice(aStart, aEnd) ===
    b.source.slice(bStart, bStart + aEnd - aStart)
  );
}

/** Collects top-level blocks in document order while the converter runs. */
export class BlockIndexBuilder {
  private readonly nodes: number[] = [];
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];
  private readonly contexts: string[] = [];

  constructor(
    source: string,
    private readonly lineOffsets: Int32Array = computeLineOffsets(source)
  ) {}

  get count(): number {
    return this.nodes.length;
  }

  /** Adds a block from a markdown-it `token.map` line range `[startLine, endLine)`. */
  addLines(node: number, startLine: number, endLine: number): void {
    this.add(
      node,
      lineToOffset(this.lineOffsets, startLine),
      lineToOffset(this.lineOffsets, endLine),
      ''
    );
  }

  /**
   * Adds a block with explicit offsets and a block context. For synthesized
   * blocks with no source range, such as the footnote section (P1-4), the
   * context must carry everything they render.
   */
  addRange(node: number, start: number, end: number, context = ''): void {
    this.add(node, start, end, context);
  }

  /**
   * Appends to the current (last) block's context: a value it renders that
   * comes from outside its source text, e.g. a de-duplicated heading slug.
   */
  appendContext(value: string): void {
    const last = this.contexts.length - 1;
    if (last < 0) return;
    this.contexts[last] += `${value}\u0000`;
  }

  finish(): BlockIndex {
    return {
      blockCount: this.nodes.length,
      blocks: Int32Array.from(this.nodes),
      blockStart: Int32Array.from(this.starts),
      blockEnd: Int32Array.from(this.ends),
      blockContext: this.contexts,
    };
  }

  private add(node: number, start: number, end: number, context: string): void {
    if (start > end) {
      throw new RangeError(`Block range [${start}, ${end}) is reversed`);
    }
    this.nodes.push(node);
    this.starts.push(start);
    this.ends.push(end);
    this.contexts.push(context);
  }
}
