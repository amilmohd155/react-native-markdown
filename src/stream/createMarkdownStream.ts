/**
 * React-free stream core (phase 2, S1.2 / S1.4 / S1.5).
 * Design: docs/rewrite/phase-2/stream-algorithm.md
 *
 * Each `append` re-parses only the open (last real) block onward, using
 * `parseFrom` with the context the closed prefix carries, then splices the
 * result onto the untouched prefix. No timers: every call parses now.
 *
 * Footnotes: when the document has definitions its last block is the
 * synthetic footnote section (empty source range, always rebuilt). It is
 * never part of the stable prefix, and the open block is the last REAL block.
 */
import type { NodeTable } from '../model';
import { NodeType } from '../model';
import {
  markdownItBackend,
  parseWithMarkdownIt,
  type ParseOptions,
} from '../parse';
import { spliceTables } from './splice';
import type {
  CarriedContext,
  CreateMarkdownStreamCore,
  FlushStats,
  MarkdownStreamCore,
} from './types';

/** Internal knobs, for tests (equivalence with and without the fence fast path). */
export interface StreamCoreInternals {
  /** Default true (S1.4). When false, every append takes the tail re-parse. */
  readonly fenceFastPath?: boolean;
}

/** Default for the open-fence fast path (S1.4, P2-5). */
export const FENCE_FAST_PATH_DEFAULT = true;

const parseFrom = markdownItBackend.parseFrom!;

/** An open, top-level, unindented fenced code block that the last flush ended inside. */
interface OpenFence {
  readonly char: string;
  readonly length: number;
  /** Text after the last line break of the whole source (a partial line). */
  lastLine: string;
}

/** Whether `line` could close a fence of `length` `char`s (conservative: also true for a prefix that is already a closer). */
function couldClose(line: string, char: string, length: number): boolean {
  let i = 0;
  while (i < 3 && line.charCodeAt(i) === 32) i++;
  let run = 0;
  while (line[i + run] === char) run++;
  if (run < length) return false;
  for (let k = i + run; k < line.length; k++) {
    const c = line.charCodeAt(k);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

/** Whether any line of `text` could close the fence. */
function anyCloser(text: string, char: string, length: number): boolean {
  let from = 0;
  for (;;) {
    const nl = text.indexOf('\n', from);
    const line = nl === -1 ? text.slice(from) : text.slice(from, nl);
    if (couldClose(line, char, length)) return true;
    if (nl === -1) return false;
    from = nl + 1;
  }
}

/**
 * The open fence at the end of `table`, or null. Requires: no user plugins
 * (they may own fences), last block is a plain CodeBlock that starts with a
 * fence marker at column 0, runs to the end of the source, has a complete
 * opening line, no `\r`/`\0`, and no closing line yet.
 */
function findOpenFence(table: NodeTable): OpenFence | null {
  const last = table.blockCount - 1;
  if (last < 0) return null;
  const node = table.blocks[last]!;
  if (table.type[node] !== NodeType.CodeBlock) return null;
  const { source } = table;
  const start = table.blockStart[last]!;
  if (table.blockEnd[last] !== source.length) return null;
  const char = source[start];
  if (char !== '`' && char !== '~') return null;
  const block = source.slice(start);
  if (block.includes('\r') || block.includes('\0')) return null;
  let length = 0;
  while (block[length] === char) length++;
  if (length < 3) return null;
  const firstEnd = block.indexOf('\n');
  if (firstEnd === -1) return null; // info string may still be arriving
  if (anyCloser(block.slice(firstEnd + 1), char, length)) return null;
  const lastLine = block.slice(block.lastIndexOf('\n') + 1);
  // markdown-it drops a whitespace-only last line: the node text is then not
  // the raw source, so appending to it would be wrong.
  if (lastLine.length > 0 && lastLine.trim().length === 0) return null;
  return { char, length, lastLine };
}

export const createMarkdownStreamCoreWith = (
  options?: ParseOptions,
  internals: StreamCoreInternals = {}
): MarkdownStreamCore => {
  const fastPathEnabled =
    (internals.fenceFastPath ?? FENCE_FAST_PATH_DEFAULT) &&
    !options?.plugins?.length;

  let source = '';
  let table: NodeTable = parseWithMarkdownIt('', options).table;
  let prefixId: object = {};
  /** Blocks [0, stableCount) are closed; block `stableCount` is the open one. */
  let stableCount = 0;
  /**
   * Where the next tail parse starts and the context it is seeded with. Block
   * `stableCount` starts there, or earlier when definitions sit in the gap
   * before it (see `settle`).
   */
  let resumeOffset = 0;
  let resumeSeed: CarriedContext | undefined;
  let fence: OpenFence | null = null;
  /** Extra characters parsed this flush to find the seed of a re-opened region. */
  let probeChars = 0;
  let lastFlush: FlushStats = {
    charsReparsed: 0,
    fullReparse: true,
    path: 'full',
  };

  const hasSection = (t: NodeTable): boolean =>
    t.blockCount > 0 &&
    t.type[t.blocks[t.blockCount - 1]!] === NodeType.FootnoteSection;

  /**
   * Whether block `index - 1` (a paragraph, list, quote or table) directly
   * followed by block `index` could still absorb it: the first line of the
   * open block may stop being a block start (`</p` becoming `</pr`, `*`
   * becoming `**`), which makes it a lazy continuation.
   */
  const absorbs = (t: NodeTable, index: number): boolean => {
    if (index < 1 || t.blockEnd[index - 1] !== t.blockStart[index]) {
      return false;
    }
    const type = t.type[t.blocks[index - 1]!];
    return (
      type !== NodeType.Heading &&
      type !== NodeType.CodeBlock &&
      type !== NodeType.Divider &&
      type !== NodeType.HtmlBlock
    );
  };

  /**
   * Whether the lines between block `index - 1` and block `index` end in
   * something other than a blank line (a link reference or footnote
   * definition, which the open block may yet extend: a title on the next
   * line).
   */
  const gapOpen = (t: NodeTable, index: number): boolean => {
    const from = index > 0 ? t.blockEnd[index - 1]! : 0;
    const to = t.blockStart[index]!;
    if (to <= from) return false;
    const lineStart = Math.max(t.source.lastIndexOf('\n', to - 2) + 1, from);
    return t.source.slice(lineStart, to).trim().length > 0;
  };

  /**
   * Decides, for the table just built, which blocks are closed and where the
   * next tail parse resumes. The table was parsed from `baseOffset` with
   * `baseSeed`; `blockSeed` is the context before the last real block.
   * Closed blocks are never re-read, except:
   * - an absorbing predecessor (see `absorbs`) is re-opened;
   * - a definition in the gap before the open block moves the resume point
   *   to the gap start.
   * Returns false when the resume point is before `baseOffset` (the seed is
   * not at hand: full re-parse).
   */
  const settle = (
    t: NodeTable,
    baseOffset: number,
    baseSeed: CarriedContext | undefined,
    blockSeed: CarriedContext | undefined
  ): boolean => {
    const real = t.blockCount - (hasSection(t) ? 1 : 0);
    fence = fastPathEnabled ? findOpenFence(t) : null;
    let open = Math.max(real - 1, 0);
    let offset = 0;
    let seed: CarriedContext | undefined;
    if (open > 0) {
      const last = open;
      if (absorbs(t, open)) open--;
      if (open > 0) {
        offset = gapOpen(t, open) ? t.blockEnd[open - 1]! : t.blockStart[open]!;
        if (open === last && offset === t.blockStart[open]) {
          seed = blockSeed;
        } else if (offset < baseOffset) {
          return false;
        } else if (offset === baseOffset) {
          seed = baseSeed;
        } else {
          seed = parseFrom(
            t.source.slice(0, offset),
            baseOffset,
            baseSeed,
            options
          ).carried;
          probeChars += offset - baseOffset;
        }
      }
    }
    stableCount = open;
    resumeOffset = offset;
    resumeSeed = seed;
    return true;
  };

  const fullReparse = (): NodeTable => {
    probeChars = 0;
    const result = parseFrom(source, 0, undefined, options);
    prefixId = {};
    table = { ...result.table, prefixId, stableCount: 0 };
    settle(table, 0, undefined, result.prefixCarried);
    lastFlush = {
      charsReparsed: source.length + probeChars,
      fullReparse: true,
      path: 'full',
    };
    return table;
  };

  /** Appends `chunk` to the open fence's code text without parsing. */
  const tryFence = (chunk: string): NodeTable | null => {
    if (!fence) return null;
    if (chunk.includes('\r') || chunk.includes('\0')) return null;
    if (anyCloser(fence.lastLine + chunk, fence.char, fence.length)) {
      return null;
    }
    const nl = chunk.lastIndexOf('\n');
    const lastLine = nl === -1 ? fence.lastLine + chunk : chunk.slice(nl + 1);
    if (lastLine.length > 0 && lastLine.trim().length === 0) return null;
    const last = table.blockCount - 1;
    const node = table.blocks[last]!;
    const strings = table.strings.slice();
    const at = table.text[node]!;
    if (at < 0) return null;
    strings[at] = strings[at]! + chunk;
    const blockEnd = table.blockEnd.slice();
    blockEnd[last] = source.length;
    fence.lastLine = lastLine;
    table = { ...table, strings, blockEnd, source };
    lastFlush = {
      charsReparsed: chunk.length,
      fullReparse: false,
      path: 'fence-fast-path',
    };
    return table;
  };

  return {
    append(chunk: string): NodeTable {
      if (chunk.length === 0) {
        lastFlush = { charsReparsed: 0, fullReparse: false, path: 'tail' };
        return table;
      }
      const wholeSourceTail = hasSection(table);
      const before = table;
      const blockless = table.blockCount === 0;
      // Only blank lines so far: resume at the last line start instead of
      // re-reading all of it (a blockless source can also hold definitions).
      const blankOffset =
        blockless && source.trim().length === 0
          ? source.lastIndexOf('\n') + 1
          : 0;
      source += chunk;
      const fast = tryFence(chunk);
      if (fast) return fast;

      const offset = blockless ? blankOffset : resumeOffset;
      const seed = blockless ? undefined : resumeSeed;
      const tail = parseFrom(source, offset, seed, options);
      // Earlier blocks depend on definitions: if the set changed, re-parse all.
      if (tail.table.context !== before.context || tail.hasFootnoteDefinition) {
        return fullReparse();
      }
      table = spliceTables(table, stableCount, tail.table, prefixId);
      probeChars = 0;
      if (!settle(table, offset, seed, tail.prefixCarried)) {
        return fullReparse();
      }
      lastFlush = {
        charsReparsed: wholeSourceTail
          ? source.length
          : source.length - offset + probeChars,
        fullReparse: false,
        path: 'tail',
      };
      return table;
    },
    done: fullReparse,
    reset(next = ''): NodeTable {
      source = next;
      return fullReparse();
    },
    get table() {
      return table;
    },
    get source() {
      return source;
    },
    get lastFlush() {
      return lastFlush;
    },
  };
};

export const createMarkdownStreamCore: CreateMarkdownStreamCore = (options) =>
  createMarkdownStreamCoreWith(options);

export const createMarkdownStream = createMarkdownStreamCore;
