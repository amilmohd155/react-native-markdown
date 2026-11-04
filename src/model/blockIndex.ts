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

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * 32-bit FNV-1a over the UTF-16 code units of `source[start, end)`, without
 * slicing. For ASCII this equals byte-wise FNV-1a. Used to detect unchanged
 * blocks, not for security.
 */
export function fnv1a(source: string, start = 0, end = source.length): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = start; i < end; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** Stable React key of a top-level block: position plus source offset. */
export function blockKey(index: BlockIndex, block: number): string {
  return `${block}:${index.blockStart[block]}`;
}

/**
 * Collects top-level blocks in document order while the converter runs,
 * then hashes their source ranges.
 */
export class BlockIndexBuilder {
  private readonly nodes: number[] = [];
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];
  /** Precomputed hash, or -1 to hash the source range in `finish`. */
  private readonly hashes: number[] = [];

  constructor(
    private readonly source: string,
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
      -1
    );
  }

  /**
   * Adds a block with explicit offsets and, optionally, a precomputed hash.
   * For synthesized blocks with no source range, such as the footnote
   * section (P1-4).
   */
  addRange(node: number, start: number, end: number, hash?: number): void {
    this.add(node, start, end, hash === undefined ? -1 : hash >>> 0);
  }

  finish(): BlockIndex {
    const blockCount = this.nodes.length;
    const blockHash = new Uint32Array(blockCount);
    for (let i = 0; i < blockCount; i++) {
      const precomputed = this.hashes[i]!;
      blockHash[i] =
        precomputed === -1
          ? fnv1a(this.source, this.starts[i], this.ends[i])
          : precomputed;
    }
    return {
      blockCount,
      blocks: Int32Array.from(this.nodes),
      blockStart: Int32Array.from(this.starts),
      blockEnd: Int32Array.from(this.ends),
      blockHash,
    };
  }

  private add(node: number, start: number, end: number, hash: number): void {
    if (start > end) {
      throw new RangeError(`Block range [${start}, ${end}) is reversed`);
    }
    this.nodes.push(node);
    this.starts.push(start);
    this.ends.push(end);
    this.hashes.push(hash);
  }
}
