import { codeLineCount } from '../render/codeLines';
import type { SyntaxTokenType, Token, Tokenizer } from './types';
import { isDev } from './dev';
import { tokensMatchInput } from './validate';

/**
 * Incremental chunking of a code block for highlighting (P3-29, P3-30).
 * Pure and React-free: the highlighted CodeBlock renders one memoised `Text`
 * per {@link Chunk}, or one `Text` of {@link blockRuns} for a small closed
 * block.
 *
 * - A chunk holds 2 complete lines (each with its `\n`), extended line by
 *   line while its last line is blank (empty or whitespace only), so a
 *   chunk other than the last never ends in a blank line ({@link chunkEnd}).
 *   The last chunk holds the rest: an incomplete line, or a trailing run of
 *   blank lines. Boundaries depend only on the text before them, so ids are
 *   stable React keys, and `update` and {@link chunkAll} group alike.
 * - Tokens are final ("committed") up to the last newline that the tokenizer
 *   left in a neutral state (not inside a `string` or `comment` token). A
 *   chunk is frozen when it is complete (its last line ends in `\n` and is
 *   not blank), the line after it has begun, and it ends at or before the
 *   commit point. Its object is then reused by every later `update`, so
 *   `React.memo` skips it.
 * - Each `update` tokenizes only the uncommitted text, plus a short left
 *   context (see {@link contextStart}); tokenizers are stateless, so that
 *   context stands in for the state a resumable tokenizer would carry.
 *   That context can be too short (a TypeScript member key depends on the
 *   enclosing brace), so colours while streaming may be approximate; when
 *   the block closes, `finish` re-tokenizes it once in full (P3-30).
 */

/** Least lines per chunk (P3-30): internal, not an option. */
const LINES_PER_CHUNK = 2;

/**
 * Left context re-fed before the uncommitted text: this many non-blank
 * committed lines (blank lines between them and the new text come along).
 * Tokenizers classify by the previous significant token (an identifier after
 * `function`, a `:` after a key), so the last non-blank line is enough for
 * the built-ins; their tokens for it are discarded. One line keeps the work
 * per flush at about one line plus the open line (P3-29).
 */
const CONTEXT_LINES = 1;

/**
 * Upper bound on the left context, in characters. A longer context line is
 * dropped rather than cut (a cut could start inside a string), so a very
 * long single line never makes every flush re-tokenize it.
 */
const MAX_CONTEXT_CHARS = 1024;

/** Committed line starts remembered as context candidates. */
const MAX_SAFE_POINTS = 64;

/** One rendered piece of a code block: a few lines (see {@link chunkEnd}). */
export type Chunk = {
  /** Index of the chunk in the block; a stable React key. */
  readonly id: number;
  /** Source text; all chunk texts joined equal the code exactly. */
  readonly text: string;
  /** Tokens of `text`, adjacent tokens of the same type merged, none empty. */
  readonly tokens: readonly Token[];
  /** True once the chunk can never change while the code only grows. */
  readonly frozen: boolean;
  /**
   * True when the tokenizer threw or (dev builds only) its tokens did not
   * join to its input for (part of) this chunk; that part is one `plain`
   * token. The component warns in dev. The join check is O(n), so it runs
   * only when `__DEV__` is true (P3-29).
   */
  readonly invalid: boolean;
};

/** A run of text drawn in one colour. */
export type Run = {
  readonly type: SyntaxTokenType;
  readonly text: string;
};

/** Incremental chunker for one streaming code block. */
export type Chunker = {
  /**
   * Chunks for the full current code. Never throws. Text that extends the
   * previous code keeps every frozen chunk object; any other change keeps
   * the frozen chunks still covered by the common prefix and redoes the
   * rest. The same code returns the same array.
   */
  update(code: string): readonly Chunk[];
  /**
   * The authoritative chunks for `code` (a closed block): the same as
   * {@link chunkAll}, with one full tokenizer call, but every chunk equal to
   * one of the previous result keeps that object ({@link reconcile}), so
   * only chunks whose colours changed re-render. Afterwards the chunker
   * holds that result: `update` or `finish` with the same code returns the
   * same array without tokenizing. About 40 to 60 ms for 50 KB on Hermes.
   */
  finish(code: string): readonly Chunk[];
  /** Forgets all state; the next `update` starts from scratch. */
  reset(): void;
};

// A token plus whether it came from a failed tokenizer call.
type Piece = {
  readonly type: SyntaxTokenType;
  readonly text: string;
  readonly bad: boolean;
};

const NOT_NEUTRAL: ReadonlySet<SyntaxTokenType> = new Set<SyntaxTokenType>([
  'string',
  'comment',
]);

/**
 * Pieces for `text`: the tokenizer's, or one bad `plain` piece when it
 * throws, returns a non-array or (dev only) tokens that do not join to the
 * input.
 */
function tokenizeSafely(
  tokenize: Tokenizer,
  language: string,
  context: string,
  text: string
): Piece[] {
  const input = context + text;
  let tokens: readonly Token[];
  try {
    tokens = tokenize(input, language);
  } catch {
    return [{ type: 'plain', text, bad: true }];
  }
  if (!Array.isArray(tokens) || (isDev() && !tokensMatchInput(tokens, input))) {
    return text === '' ? [] : [{ type: 'plain', text, bad: true }];
  }
  // Drop the context's tokens, cutting one that straddles the seam.
  const out: Piece[] = [];
  let at = 0;
  const skip = context.length;
  for (const token of tokens) {
    const end = at + token.text.length;
    if (end > skip && token.text !== '') {
      const piece = at >= skip ? token.text : token.text.slice(skip - at);
      out.push({ type: token.type, text: piece, bad: false });
    }
    at = end;
  }
  return out;
}

/**
 * Offset in `text` just after the last newline that ends in a neutral state
 * and is not the last character (the line after it must have begun), or 0.
 * Every neutral newline offset (absolute, `base + offset`) goes to `points`.
 */
function lastNeutralNewline(
  pieces: readonly Piece[],
  textLength: number,
  base: number,
  points: number[]
): number {
  let at = 0;
  let best = 0;
  for (const piece of pieces) {
    if (!NOT_NEUTRAL.has(piece.type)) {
      let i = piece.text.indexOf('\n');
      while (i !== -1) {
        const after = at + i + 1;
        if (after < textLength) {
          best = after;
          points.push(base + after);
        }
        i = piece.text.indexOf('\n', i + 1);
      }
    }
    at += piece.text.length;
  }
  return best;
}

/** Consumes a piece list front to back in slices of given lengths. */
class PieceCursor {
  private index = 0;
  private offset = 0;
  constructor(private readonly pieces: readonly Piece[]) {}

  take(length: number): Piece[] {
    const out: Piece[] = [];
    let left = length;
    while (left > 0 && this.index < this.pieces.length) {
      const piece = this.pieces[this.index]!;
      const available = piece.text.length - this.offset;
      if (available <= left) {
        out.push(
          this.offset === 0
            ? piece
            : { ...piece, text: piece.text.slice(this.offset) }
        );
        left -= available;
        this.index++;
        this.offset = 0;
      } else {
        const text = piece.text.slice(this.offset, this.offset + left);
        out.push({ ...piece, text });
        this.offset += left;
        left = 0;
      }
    }
    return out;
  }

  rest(): Piece[] {
    return this.take(Number.POSITIVE_INFINITY);
  }
}

/** Merges adjacent same-type pieces into tokens. */
function mergePieces(pieces: readonly Piece[]): Token[] {
  const out: Token[] = [];
  let type: SyntaxTokenType | null = null;
  let text = '';
  for (const piece of pieces) {
    if (piece.text === '') continue;
    if (piece.type === type) {
      text += piece.text;
    } else {
      if (type !== null) out.push({ type, text });
      type = piece.type;
      text = piece.text;
    }
  }
  if (type !== null) out.push({ type, text });
  return out;
}

function sameTokens(a: readonly Token[], b: readonly Token[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.type !== b[i]!.type || a[i]!.text !== b[i]!.text) return false;
  }
  return true;
}

/**
 * End offset of the chunk starting at `from` (the grouping rule, P3-30): just
 * after the first complete line that is at least the
 * {@link LINES_PER_CHUNK}th and not blank, or the end of `code`. It reads no
 * text past that line, so text appended later never moves it.
 */
function chunkEnd(code: string, from: number): number {
  let at = from;
  let lines = 0;
  for (;;) {
    const nl = code.indexOf('\n', at);
    if (nl === -1) return code.length;
    lines++;
    const blank = isBlank(code.slice(at, nl));
    at = nl + 1;
    if (lines >= LINES_PER_CHUNK && !blank) return at;
  }
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/**
 * Creates the incremental chunker for one block. `language` is passed to
 * `tokenize` as is (normalise it with `normalizeTag` first).
 */
export function createChunker(tokenize: Tokenizer, language: string): Chunker {
  // Frozen chunks, a prefix of the result; their text covers [0, frozenLen).
  let frozen: Chunk[] = [];
  let frozenLen = 0;
  // Final pieces for [frozenLen, committedLen); committedLen is 0 or just
  // after a neutral newline.
  let pending: Piece[] = [];
  let committedLen = 0;
  // Neutral line starts <= committedLen, ascending (0 is implicit).
  let points: number[] = [];
  let lastCode = '';
  let last: readonly Chunk[] = [];

  const reset = () => {
    frozen = [];
    frozenLen = 0;
    pending = [];
    committedLen = 0;
    points = [];
    lastCode = '';
    last = [];
  };

  /**
   * Rolls state back to the latest neutral line start in `code[0, keep)`:
   * frozen chunks before it stay (same objects), the rest is redone.
   */
  const truncate = (keep: number) => {
    let point = 0;
    for (const p of points) if (p <= keep && p <= committedLen) point = p;
    let n = frozen.length;
    let end = frozenLen;
    while (n > 0 && end > point) {
      n--;
      end -= frozen[n]!.text.length;
    }
    // Pending pieces for [end, point), from the frozen chunks being dropped
    // and the old pending pieces (whose tokens were already final).
    const dropped: Piece[] = [];
    for (let i = n; i < frozen.length; i++) {
      const chunk = frozen[i]!;
      for (const t of chunk.tokens) dropped.push({ ...t, bad: chunk.invalid });
    }
    pending = new PieceCursor(dropped.concat(pending)).take(point - end);
    frozen = frozen.slice(0, n);
    frozenLen = end;
    committedLen = point;
    points = points.filter((p) => p <= point);
    last = last.slice(0, n);
  };

  /**
   * Start of the left context for text at `committedLen`: the latest neutral
   * line start that has {@link CONTEXT_LINES} non-blank lines between it and
   * `committedLen`, within {@link MAX_CONTEXT_CHARS}.
   */
  const contextStart = (code: string): number => {
    let start = committedLen;
    let found = 0;
    let lineEnd = committedLen;
    for (let i = points.length - 1; i >= -1 && found < CONTEXT_LINES; i--) {
      const p = i >= 0 ? points[i]! : 0;
      if (p >= committedLen) continue;
      if (committedLen - p > MAX_CONTEXT_CHARS) break;
      start = p;
      if (!isBlank(code.slice(p, lineEnd))) found++;
      lineEnd = p;
      if (p === 0) break;
    }
    return start;
  };

  const update = (code: string): readonly Chunk[] => {
    if (code === lastCode) return last;
    if (!code.startsWith(lastCode)) {
      // A kept line start must still have text after it, as when committing.
      truncate(Math.min(commonPrefixLength(lastCode, code), code.length - 1));
    }
    lastCode = code;

    const ctxStart = contextStart(code);
    const context = code.slice(ctxStart, committedLen);
    const rest = code.slice(committedLen);
    const fresh = tokenizeSafely(tokenize, language, context, rest);
    const commitAt = lastNeutralNewline(
      fresh,
      rest.length,
      committedLen,
      points
    );
    if (points.length > MAX_SAFE_POINTS) {
      points = points.slice(points.length - MAX_SAFE_POINTS);
    }
    const newCommitted = committedLen + commitAt;

    // Split the fresh pieces at the new commit point.
    const freshCursor = new PieceCursor(fresh);
    const committed = pending.concat(freshCursor.take(commitAt));
    const uncommitted = freshCursor.rest();

    // Freeze every complete chunk inside the committed text.
    const committedCursor = new PieceCursor(committed);
    let at = frozenLen;
    for (;;) {
      const end = chunkEnd(code, at);
      if (end > newCommitted || end === at || code[end - 1] !== '\n') break;
      const pieces = committedCursor.take(end - at);
      frozen.push({
        id: frozen.length,
        text: code.slice(at, end),
        tokens: mergePieces(pieces),
        frozen: true,
        invalid: pieces.some((p) => p.bad),
      });
      at = end;
    }
    frozenLen = at;
    pending = committedCursor.rest();
    committedLen = newCommitted;

    // The remaining chunks, reusing an unchanged previous object.
    const out: Chunk[] = frozen.slice();
    const liveCursor = new PieceCursor(pending.concat(uncommitted));
    while (at < code.length) {
      const end = chunkEnd(code, at);
      const pieces = liveCursor.take(end - at);
      const id = out.length;
      const text = code.slice(at, end);
      const tokens = mergePieces(pieces);
      const invalid = pieces.some((p) => p.bad);
      const previous = last[id];
      out.push(
        previous !== undefined &&
          !previous.frozen &&
          previous.text === text &&
          previous.invalid === invalid &&
          sameTokens(previous.tokens, tokens)
          ? previous
          : { id, text, tokens, frozen: false, invalid }
      );
      at = end;
    }
    last = out;
    return out;
  };

  let finished = false;

  const finish = (code: string): readonly Chunk[] => {
    if (finished && code === lastCode) return last;
    const previous = last;
    reset();
    const fresh = update(code);
    const out = reconcile(previous, fresh);
    // Same texts at the same positions, so the frozen prefix maps 1:1.
    frozen = out.slice(0, frozen.length);
    last = out;
    finished = true;
    return out;
  };

  return {
    update: (code) => {
      if (code !== lastCode) finished = false;
      return update(code);
    },
    finish,
    reset: () => {
      finished = false;
      reset();
    },
  };
}

/**
 * `next`, with every chunk equal to the previous chunk of the same id (same
 * text, tokens, `frozen` and `invalid`) replaced by that previous object, so
 * `React.memo` skips it. Returns `previous` itself when nothing changed.
 */
export function reconcile(
  previous: readonly Chunk[],
  next: readonly Chunk[]
): readonly Chunk[] {
  if (previous.length === 0) return next;
  let unchanged = previous.length === next.length;
  const out = next.map((chunk, i) => {
    const old = previous[i];
    if (
      old !== undefined &&
      old.id === chunk.id &&
      old.text === chunk.text &&
      old.frozen === chunk.frozen &&
      old.invalid === chunk.invalid &&
      sameTokens(old.tokens, chunk.tokens)
    ) {
      return old;
    }
    unchanged = false;
    return chunk;
  });
  return unchanged ? previous : out;
}

/**
 * Chunks for a whole block at once (closed fences, `open === false`): the
 * same chunks as one `update(code)` on a fresh {@link createChunker}, with a
 * single tokenizer call.
 */
export function chunkAll(
  code: string,
  tokenize: Tokenizer,
  language: string
): readonly Chunk[] {
  return createChunker(tokenize, language).update(code);
}

const runCache = new WeakMap<
  Chunk,
  { colorOf: ((type: SyntaxTokenType) => unknown) | undefined; runs: Run[] }
>();

/**
 * The runs to render for a chunk: one span per run. Without `colorOf` these
 * are the chunk's tokens (already merged by type). With it, adjacent tokens
 * that resolve to the same colour are merged too, and whitespace-only tokens
 * join the run before them (or after, at the start), since their colour is
 * invisible. A merged run takes the type of its first non-whitespace token.
 * Cached per chunk and `colorOf`, so a frozen chunk returns the same array.
 */
export function runsOf(
  chunk: Chunk,
  colorOf?: (type: SyntaxTokenType) => unknown
): readonly Run[] {
  const cached = runCache.get(chunk);
  if (cached && cached.colorOf === colorOf) return cached.runs;
  const runs =
    colorOf === undefined
      ? chunk.tokens.slice()
      : mergeRuns(chunk.tokens, colorOf);
  runCache.set(chunk, { colorOf, runs });
  return runs;
}

const lineCountCache = new WeakMap<Chunk, number>();

/**
 * Logical lines in a chunk, as `codeLineCount` counts them (a final `\n`
 * opens no new line). Every chunk but the last ends in `\n`, so the counts
 * of a block's chunks sum to the code's line count. Cached per chunk.
 */
export function lineCountOf(chunk: Chunk): number {
  let count = lineCountCache.get(chunk);
  if (count === undefined) {
    count = codeLineCount(chunk.text);
    lineCountCache.set(chunk, count);
  }
  return count;
}

const lineRunCache = new WeakMap<
  Chunk,
  {
    colorOf: ((type: SyntaxTokenType) => unknown) | undefined;
    lines: Run[][];
  }
>();

/**
 * The {@link runsOf} runs of a chunk split into its lines (one entry per
 * {@link lineCountOf} line), without the `\n`s: a run that spans lines is
 * cut at each `\n`, and a blank line has no runs. For the numbered wrap
 * layout (P3-35), one row per line. Cached per chunk and `colorOf`, so a
 * frozen chunk returns the same arrays.
 */
export function lineRunsOf(
  chunk: Chunk,
  colorOf?: (type: SyntaxTokenType) => unknown
): readonly (readonly Run[])[] {
  const cached = lineRunCache.get(chunk);
  if (cached && cached.colorOf === colorOf) return cached.lines;
  const lines: Run[][] = [];
  if (chunk.text !== '') {
    let line: Run[] = [];
    lines.push(line);
    for (const run of runsOf(chunk, colorOf)) {
      const parts = run.text.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          line = [];
          lines.push(line);
        }
        const text = parts[i]!;
        if (text !== '') line.push({ type: run.type, text });
      }
    }
    // A final `\n` opens no new line.
    if (chunk.text.endsWith('\n')) lines.pop();
  }
  lineRunCache.set(chunk, { colorOf, lines });
  return lines;
}

/**
 * The runs of a whole block drawn as one `Text` (a small closed block): the
 * {@link runsOf} merge over every chunk's tokens at once, so runs of one
 * colour merge across chunk boundaries too. Their texts join to the code.
 */
export function blockRuns(
  chunks: readonly Chunk[],
  colorOf: (type: SyntaxTokenType) => unknown
): Run[] {
  const tokens: Token[] = [];
  for (const chunk of chunks) for (const t of chunk.tokens) tokens.push(t);
  return mergeRuns(tokens, colorOf);
}

function mergeRuns(
  tokens: readonly Token[],
  colorOf: (type: SyntaxTokenType) => unknown
): Run[] {
  const types: SyntaxTokenType[] = [];
  const texts: string[] = [];
  let color: unknown;
  let leading = '';
  for (const token of tokens) {
    const top = texts.length - 1;
    if (isBlank(token.text)) {
      if (top >= 0) texts[top] += token.text;
      else leading += token.text;
      continue;
    }
    const c = colorOf(token.type);
    if (top >= 0 && c === color) {
      texts[top] += token.text;
    } else {
      types.push(token.type);
      texts.push(leading + token.text);
      leading = '';
      color = c;
    }
  }
  if (leading !== '') {
    types.push('plain');
    texts.push(leading);
  }
  return types.map((type, i) => ({ type, text: texts[i]! }));
}
