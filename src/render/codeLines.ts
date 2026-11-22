/**
 * Plain-text lines and 2-line chunks of a code block, for line numbers
 * (P3-35). Pure and React-free: the caller passes the platform
 * (`Platform.OS === 'web'`), so this runs in Node tests.
 *
 * - A line is the text between `\n`s, without the `\n`. A final `\n` ends the
 *   last line and opens no new numbered line, so `'a\n'` and `'a'` both hold
 *   one line, and `''` holds none. Input is expected with `\n` line endings
 *   (the parser normalises CRLF and CR); a stray `\r` stays in its line's text.
 * - Chunks group lines as the highlighted layout does (P3-30): 2 complete
 *   lines, extended line by line while the last one is blank (empty or
 *   whitespace only), so a chunk other than the last never ends in a blank
 *   line. The last chunk holds the rest: an incomplete line, or a trailing
 *   run of blank lines.
 * - Chunk text follows the platform rule of the highlighted block: on native
 *   each chunk but the last drops its final `\n` (the next chunk's `Text`
 *   starts the next line); on web every chunk keeps its text whole, so the
 *   chunks concatenate back to `code`.
 */

/** Least lines per chunk (P3-30), as in the highlight chunker. */
const LINES_PER_CHUNK = 2;

export interface CodeChunk {
  /** The chunk's code, per the platform rule above. */
  readonly text: string;
  /** 1-based number of the chunk's first line. */
  readonly firstLine: number;
  /** Logical lines in the chunk (at least 1). */
  readonly lineCount: number;
}

/** The logical lines of `code`, without their `\n`. */
export function codeLines(code: string): string[] {
  if (code === '') return [];
  const lines = code.split('\n');
  if (code.endsWith('\n')) lines.pop();
  return lines;
}

/** Number of logical lines in `code`: the last line number (gutter width). */
export function codeLineCount(code: string): number {
  if (code === '') return 0;
  let count = 0;
  let at = code.indexOf('\n');
  while (at !== -1) {
    count++;
    at = code.indexOf('\n', at + 1);
  }
  return code.endsWith('\n') ? count : count + 1;
}

/** `code` in chunks of 2 or more lines (P3-30); `web` picks the text rule. */
export function codeChunks(code: string, web: boolean): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let from = 0;
  let firstLine = 1;
  while (from < code.length) {
    const { end, lines } = chunkEnd(code, from);
    const last = end === code.length;
    const text =
      !web && !last && code.charCodeAt(end - 1) === 10
        ? code.slice(from, end - 1)
        : code.slice(from, end);
    chunks.push({ text, firstLine, lineCount: lines });
    firstLine += lines;
    from = end;
  }
  return chunks;
}

/** The gutter text of a chunk: its line numbers, one per line. */
export function gutterText(chunk: CodeChunk): string {
  const numbers: number[] = [];
  for (let n = 0; n < chunk.lineCount; n++) numbers.push(chunk.firstLine + n);
  return numbers.join('\n');
}

/**
 * End offset and line count of the chunk starting at `from`: just after the
 * first complete line that is at least the {@link LINES_PER_CHUNK}th and not
 * blank, or the end of `code`.
 */
function chunkEnd(code: string, from: number): { end: number; lines: number } {
  let at = from;
  let lines = 0;
  for (;;) {
    const nl = code.indexOf('\n', at);
    // An incomplete final line counts as a line.
    if (nl === -1) {
      return { end: code.length, lines: at < code.length ? lines + 1 : lines };
    }
    lines++;
    const blank = code.slice(at, nl).trim() === '';
    at = nl + 1;
    if (lines >= LINES_PER_CHUNK && !blank) return { end: at, lines };
  }
}

/**
 * The code text of one row in the numbered wrap layout (P3-35): `line`
 * without its `\n`; `newline` says the code has a `\n` after it.
 *
 * - Native: the line as is; a blank (empty) line holds `' '`, because an
 *   empty `Text` is about 2 px short on Android at font scale 2.0.
 * - Web: the line plus its own `\n` when the code has one, so the rows
 *   concatenate back to the code and selection keeps blank lines (a `' '`
 *   would leak spaces into a copy).
 */
export function rowText(line: string, newline: boolean, web: boolean): string {
  if (web) return newline ? `${line}\n` : line;
  return line === '' ? ' ' : line;
}
