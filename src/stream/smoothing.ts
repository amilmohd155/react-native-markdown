/**
 * `hide-incomplete` smoothing (phase 2 S3, P2-6). See
 * `docs/rewrite/phase-2/smoothing.md`.
 *
 * `hideIncomplete` takes the open block's source and returns the text to
 * display: the same text minus a trailing fragment that has not completed
 * (a dangling marker and its unclosed run, an unclosed backtick, a link or
 * image in progress, an incomplete tag). It never changes `source`; callers
 * parse the result for the view only.
 *
 * One forward pass over the last inline scope, no regexes. A scope starts at
 * the open block's start and restarts after each blank line and after the
 * marker of each list item / quote / heading line, because inline runs do
 * not cross those. Text inside an unclosed fence is returned unchanged.
 *
 * Tables (P2b-3), for rows that start with `|`: a header shows nothing until
 * its delimiter row has ended with a newline, then the table shows up to its
 * last `\n`, so a partial trailing row never shows.
 */

const BACKSLASH = 92;
const BACKTICK = 96;
const LBRACKET = 91;
const RBRACKET = 93;
const LT = 60;
const STAR = 42;
const UNDERSCORE = 95;
const TILDE = 126;
const PIPE = 124;
const DASH = 45;
const COLON = 58;

/**
 * Where the visible text ends or the inline scan starts. `tableCut >= 0`:
 * the text is cut there and nothing else is scanned for tables (`rows`
 * true: a table with its delimiter row, cut after its last `\n`; false: a
 * table header still waiting for its delimiter row, cut before it).
 */
interface Scope {
  readonly start: number;
  readonly tableCut: number;
  readonly rows: boolean;
}

interface Opener {
  readonly ch: number;
  len: number;
  readonly pos: number;
}

function isWhitespace(code: number): boolean {
  return code <= 32 || code === 0xa0;
}

function isAlphanumeric(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code > 127
  );
}

function isTagStart(code: number): boolean {
  // letter, `/`, `!`, `?`
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 47 ||
    code === 33 ||
    code === 63
  );
}

function skipSpaces(text: string, from: number, end: number): number {
  let i = from;
  while (i < end && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) {
    i++;
  }
  return i;
}

/** Length of the run of `code` starting at `from`. */
function runLength(text: string, from: number, code: number): number {
  let i = from;
  while (i < text.length && text.charCodeAt(i) === code) i++;
  return i - from;
}

/**
 * Length of the block-marker prefix of a line (list item, quote, heading),
 * starting at `from` (after indentation); 0 when the line has none.
 */
function markerPrefix(text: string, from: number, end: number): number {
  let j = from;
  for (;;) {
    const c = text.charCodeAt(j);
    if (c === 35) {
      const k = runLength(text, j, 35);
      const after = j + k;
      if (k <= 6 && (after >= end || text.charCodeAt(after) === 32)) {
        return skipSpaces(text, after, end) - from;
      }
      return j - from;
    }
    if (c === 62) {
      j++;
      if (text.charCodeAt(j) === 32) j++;
      continue;
    }
    if (c === 45 || c === 43 || c === STAR) {
      const next = text.charCodeAt(j + 1);
      if (j + 1 < end && (next === 32 || next === 9)) {
        j = skipSpaces(text, j + 1, end);
        continue;
      }
      return j - from;
    }
    if (c >= 48 && c <= 57) {
      let k = j;
      while (k < end && k - j < 9) {
        const d = text.charCodeAt(k);
        if (d < 48 || d > 57) break;
        k++;
      }
      const delim = text.charCodeAt(k);
      const after = text.charCodeAt(k + 1);
      if (
        k > j &&
        k + 1 < end &&
        (delim === 46 || delim === 41) &&
        (after === 32 || after === 9)
      ) {
        j = skipSpaces(text, k + 1, end);
        continue;
      }
      return j - from;
    }
    return j - from;
  }
}

function isSpaceOrTab(code: number): boolean {
  return code === 32 || code === 9;
}

/**
 * Column count of a table header line `[from, end)`, as markdown-it counts
 * it (cells split at unescaped `|`, an empty first and last cell dropped).
 */
function headerColumns(text: string, from: number, end: number): number {
  let last = end;
  while (last > from && isWhitespace(text.charCodeAt(last - 1))) last--;
  if (last <= from) return 0;
  let cells = 1;
  let escaped = false;
  for (let i = from; i < last; i++) {
    const c = text.charCodeAt(i);
    if (c === PIPE && !escaped) cells++;
    escaped = c === BACKSLASH;
  }
  if (text.charCodeAt(from) === PIPE) cells--;
  if (
    text.charCodeAt(last - 1) === PIPE &&
    (last - 2 < from || text.charCodeAt(last - 2) !== BACKSLASH)
  ) {
    cells--;
  }
  return Math.max(cells, 0);
}

/** Whether `[from, end)` is a delimiter cell, `:?-+:?`. */
function isDelimiterCell(text: string, from: number, end: number): boolean {
  let i = from;
  if (text.charCodeAt(i) === COLON) i++;
  const dashes = runLength(text, i, DASH);
  i += Math.min(dashes, end - i);
  if (dashes === 0) return false;
  if (i < end && text.charCodeAt(i) === COLON) i++;
  return i === end;
}

/** The delimiter row is not one and cannot become one. */
const DELIMITER_NO = 0;
/** Not one yet, but more text on the line could make it one. */
const DELIMITER_MAYBE = 1;
/** A delimiter row for `columns` header columns (markdown-it's rule). */
const DELIMITER_YES = 2;

/**
 * Whether line `[from, end)` (from the first non-space) is a table
 * delimiter row for a header of `columns` columns, as in markdown-it: cells
 * of `:?-+:?` split by `|`, and exactly as many as the header.
 */
function delimiterState(
  text: string,
  from: number,
  end: number,
  columns: number
): number {
  if (from >= end) return DELIMITER_MAYBE;
  const first = text.charCodeAt(from);
  if (first !== PIPE && first !== DASH && first !== COLON) return DELIMITER_NO;
  if (from + 1 < end) {
    const second = text.charCodeAt(from + 1);
    if (first === DASH && isSpaceOrTab(second)) return DELIMITER_NO;
  }
  for (let i = from; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c !== PIPE && c !== DASH && c !== COLON && !isSpaceOrTab(c)) {
      return DELIMITER_NO;
    }
  }
  let cells = 0;
  let partial = false;
  let cellStart = from;
  for (let index = 0; cellStart <= end; index++) {
    let cellEnd = cellStart;
    while (cellEnd < end && text.charCodeAt(cellEnd) !== PIPE) cellEnd++;
    const isLast = cellEnd === end;
    const a = skipSpaces(text, cellStart, cellEnd);
    let b = cellEnd;
    while (b > a && isSpaceOrTab(text.charCodeAt(b - 1))) b--;
    if (a === b) {
      if (index !== 0 && !isLast) return DELIMITER_NO;
    } else if (isDelimiterCell(text, a, b)) {
      cells++;
    } else if (isLast && b - a === 1 && text.charCodeAt(a) === COLON) {
      cells++;
      partial = true;
    } else {
      return DELIMITER_NO;
    }
    cellStart = cellEnd + 1;
  }
  if (cells > columns) return DELIMITER_NO;
  // markdown-it needs a second character on the line.
  return !partial && cells === columns && from + 1 < end
    ? DELIMITER_YES
    : DELIMITER_MAYBE;
}

/**
 * Finds where the last inline scope starts, and whether the text ends in a
 * table (P2b-3). Returns `null` when the text ends inside an open fenced
 * code block (not smoothed).
 *
 * Tables are tracked over a run of lines that blank lines, fences, list
 * items and headings end but quote markers do not (a quoted table restarts
 * the inline scope on every line). In that run, a line that starts with `|`
 * is a header when the next line is its delimiter row: a table can also
 * interrupt a paragraph, as in markdown-it. With `tables` false, tables are
 * not looked for (the re-scan of an already cut text).
 */
function findScope(text: string, tables: boolean): Scope | null {
  const n = text.length;
  let pos = 0;
  let fenceChar = 0;
  let fenceLen = 0;
  let scopeStart = 0;
  let fresh = true;
  // Table run state.
  let runFresh = true;
  /** Content start of the previous line when it can be a table header. */
  let header = -1;
  let headerCols = 0;
  /** Content start of the header of the table the run is in, or -1. */
  let tableAt = -1;
  /** Content start of a header still waiting for its delimiter row, or -1. */
  let pendingAt = -1;
  let runDepth = 0;
  const endRun = () => {
    runFresh = true;
    header = -1;
    tableAt = -1;
    pendingAt = -1;
  };

  while (pos < n) {
    const nl = text.indexOf('\n', pos);
    const end = nl < 0 ? n : nl;
    const next = nl < 0 ? n : nl + 1;
    const first = skipSpaces(text, pos, end);
    const indent = first - pos;

    if (fenceChar !== 0) {
      if (indent <= 3 && text.charCodeAt(first) === fenceChar) {
        const k = runLength(text, first, fenceChar);
        if (k >= fenceLen && skipSpaces(text, first + k, end) === end) {
          fenceChar = 0;
          scopeStart = next;
          fresh = true;
          endRun();
        }
      }
      pos = next;
      continue;
    }

    if (first === end) {
      fresh = true;
      scopeStart = next;
      // Spaces at the very end are not a blank line yet.
      if (nl >= 0) endRun();
      pos = next;
      continue;
    }

    const c = text.charCodeAt(first);
    if (indent <= 3 && (c === BACKTICK || c === TILDE)) {
      const k = runLength(text, first, c);
      if (
        k >= 3 &&
        (c !== BACKTICK ||
          text.indexOf('`', first + k) < 0 ||
          text.indexOf('`', first + k) >= end)
      ) {
        fenceChar = c;
        fenceLen = k;
        endRun();
        pos = next;
        continue;
      }
    }

    const prefix = markerPrefix(text, first, end);
    if (prefix > 0) {
      scopeStart = first + prefix;
      fresh = false;
    } else if (fresh) {
      scopeStart = pos;
      fresh = false;
    }

    if (tables) {
      // Quote depth, and whether the prefix holds a list or heading marker.
      let depth = 0;
      let marker = false;
      let heading = false;
      for (let i = first; i < first + prefix; i++) {
        const d = text.charCodeAt(i);
        if (d === 62) depth++;
        else if (d === 35) heading = true;
        else if (!isSpaceOrTab(d)) marker = true;
      }
      if (marker || heading || depth !== runDepth) endRun();
      runDepth = depth;
      if (heading) {
        // A heading is one line: the next line starts a new run.
        pos = next;
        continue;
      }
      if (tableAt < 0) {
        const content = skipSpaces(text, first + prefix, end);
        const ended = nl >= 0;
        let isTable = false;
        if (header >= 0) {
          const state = delimiterState(text, content, end, headerCols);
          if (ended ? state === DELIMITER_YES : state !== DELIMITER_NO) {
            if (ended) tableAt = header;
            else pendingAt = header;
            isTable = true;
          }
          header = -1;
        }
        const code = runFresh && prefix === 0 && indent >= 4;
        if (!isTable && !code && text.charCodeAt(content) === PIPE) {
          if (!ended) {
            pendingAt = content;
          } else {
            headerCols = headerColumns(text, content, end);
            if (headerCols > 0) header = content;
          }
        }
      }
      runFresh = false;
    }
    pos = next;
  }

  if (fenceChar !== 0) return null;
  if (tableAt >= 0) {
    return {
      start: scopeStart,
      tableCut: text.lastIndexOf('\n') + 1,
      rows: true,
    };
  }
  if (header >= 0) pendingAt = header;
  return { start: scopeStart, tableCut: pendingAt, rows: false };
}

/**
 * Returns `text` without its trailing incomplete inline fragment. Pure;
 * returns the identical string instance when nothing is hidden.
 */
export function hideIncomplete(text: string): string {
  return hide(text, true);
}

function hide(text: string, tables: boolean): string {
  const n = text.length;
  if (n === 0) return text;
  const scope = findScope(text, tables);
  if (scope === null) return text;
  if (scope.tableCut >= 0) {
    if (scope.rows) {
      return scope.tableCut < n ? text.slice(0, scope.tableCut) : text;
    }
    return hide(text.slice(0, scope.tableCut), false);
  }
  const start = scope.start;

  const stack: Opener[] = [];
  const brackets: number[] = [];
  let cutOther = n;
  let destLabel = -1;
  let destClose = -1;

  let i = start;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === BACKSLASH) {
      i += 2;
    } else if (c === BACKTICK) {
      const k = runLength(text, i, BACKTICK);
      let j = i + k;
      let closed = false;
      while (j < n) {
        const idx = text.indexOf('`', j);
        if (idx < 0) break;
        const m = runLength(text, idx, BACKTICK);
        j = idx + m;
        if (m === k) {
          closed = true;
          break;
        }
      }
      if (closed) {
        i = j;
      } else {
        cutOther = Math.min(cutOther, i);
        i = n;
      }
    } else if (c === LBRACKET) {
      brackets.push(i);
      i++;
    } else if (c === RBRACKET) {
      const label = brackets.pop();
      if (label !== undefined && text.charCodeAt(i + 1) === 40) {
        let j = i + 2;
        let found = false;
        while (j < n) {
          const d = text.charCodeAt(j);
          if (d === BACKSLASH) {
            j += 2;
            continue;
          }
          if (d === 41) {
            found = true;
            break;
          }
          j++;
        }
        if (found) {
          i = j + 1;
        } else {
          destLabel = label;
          destClose = i;
          i = n;
        }
      } else {
        i++;
      }
    } else if (c === LT) {
      if (i + 1 >= n) {
        cutOther = Math.min(cutOther, i);
        i = n;
      } else if (isTagStart(text.charCodeAt(i + 1))) {
        const gt = text.indexOf('>', i + 1);
        if (gt < 0) {
          cutOther = Math.min(cutOther, i);
          i = n;
        } else {
          i = gt + 1;
        }
      } else {
        i++;
      }
    } else if (c === STAR || c === UNDERSCORE || c === TILDE) {
      const k = runLength(text, i, c);
      const runEnd = i + k;
      if (c === TILDE && k < 2) {
        if (runEnd >= n) cutOther = Math.min(cutOther, i);
        i = runEnd;
        continue;
      }
      const prev = i > 0 ? text.charCodeAt(i - 1) : 32;
      const atEnd = runEnd >= n;
      const nextCode = atEnd ? 32 : text.charCodeAt(runEnd);
      const hasPrev = !isWhitespace(prev);
      const hasNext = !atEnd && !isWhitespace(nextCode);
      const canOpen = hasNext && (c !== UNDERSCORE || !isAlphanumeric(prev));
      let canClose = false;
      if (
        hasPrev &&
        !(c === UNDERSCORE && !atEnd && isAlphanumeric(nextCode))
      ) {
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s]!.ch === c) {
            canClose = true;
            break;
          }
        }
      }
      if (canClose) {
        let left = k;
        for (let s = stack.length - 1; s >= 0 && left > 0; s--) {
          const o = stack[s]!;
          if (o.ch !== c) continue;
          const used = Math.min(left, o.len);
          o.len -= used;
          left -= used;
          if (o.len === 0) stack.splice(s, 1);
        }
        if (left > 0) {
          if (canOpen) {
            stack.push({ ch: c, len: left, pos: runEnd - left });
          } else if (atEnd) {
            cutOther = Math.min(cutOther, runEnd - left);
          }
        }
      } else if (canOpen) {
        stack.push({ ch: c, len: k, pos: i });
      } else if (atEnd) {
        cutOther = Math.min(cutOther, i);
      }
      i = runEnd;
    } else {
      i++;
    }
  }

  const cut = stack.length > 0 ? Math.min(cutOther, stack[0]!.pos) : cutOther;

  let open = -1;
  let labelEnd = cut;
  if (destLabel >= 0) {
    open = destLabel;
    labelEnd = Math.min(cut, destClose);
  } else if (brackets.length > 0) {
    open = brackets[0]!;
  }

  if (open >= 0 && open < cut) {
    if (open > 0 && text.charCodeAt(open - 1) === 33 && open - 1 >= start) {
      return text.slice(0, open - 1);
    }
    return text.slice(0, open) + text.slice(open + 1, labelEnd);
  }
  // The prefix can expose a bracket whose `]` was already seen (`[a **b]`).
  return cut < n ? hide(text.slice(0, cut), false) : text;
}
