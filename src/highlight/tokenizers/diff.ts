import type { SyntaxTokenType, Token, Tokenizer } from '../types';

/**
 * Unified-diff tokenizer (P3-29). Each line is classified on its own:
 *
 * - `+` lines are `inserted`, `-` lines `deleted` (but `+++ ` / `--- ` are
 *   file headers).
 * - File headers are `comment`: `--- `, `+++ `, `diff `, `index `, the git
 *   mode / rename / similarity lines, `Binary files`, `\ No newline...`.
 * - A hunk header is `function` up to and including its closing `@@`; the
 *   text after it (the enclosing function, say) is `plain`.
 * - Everything else (context lines) is `plain`.
 *
 * Newline rule: a line's `\n` (and any `\r`) stays inside the line's last
 * token, and tokens are never merged across lines (an exception to the
 * "merge adjacent same-type tokens" advice). So tokenizing each line on its
 * own and concatenating the results gives exactly the whole-text tokens,
 * which keeps the chunker's per-line freezing exact.
 *
 * Lines are not tracked against hunk sizes, so a removed line whose text
 * starts with `-- ` reads as a `--- ` header. Linear time, never throws.
 */

const HEADERS = [
  'diff ',
  'index ',
  'new file mode',
  'deleted file mode',
  'old mode',
  'new mode',
  'similarity index',
  'dissimilarity index',
  'rename from',
  'rename to',
  'copy from',
  'copy to',
  'Binary files',
  'Only in ',
  '\\',
] as const;

function lineType(code: string, start: number): SyntaxTokenType {
  const c = code.charCodeAt(start);
  if (c === 43 /* + */) {
    return code.startsWith('+++ ', start) ? 'comment' : 'inserted';
  }
  if (c === 45 /* - */) {
    return code.startsWith('--- ', start) ? 'comment' : 'deleted';
  }
  for (const header of HEADERS) {
    if (code.startsWith(header, start)) return 'comment';
  }
  return 'plain';
}

export const diffTokenizer: Tokenizer = (code) => {
  const out: Token[] = [];
  let pos = 0;
  while (pos < code.length) {
    const nl = code.indexOf('\n', pos);
    const end = nl === -1 ? code.length : nl + 1;
    if (code.startsWith('@@', pos)) {
      // `@@ -a,b +c,d @@ context`: the header through the closing `@@`.
      const close = code.indexOf('@@', pos + 2);
      const headerEnd = close === -1 || close >= end ? end : close + 2;
      // A header with only a line break after it keeps the line break.
      const rest = code.slice(headerEnd, end);
      if (/^\r?\n?$/.test(rest)) {
        out.push({ type: 'function', text: code.slice(pos, end) });
      } else {
        out.push({ type: 'function', text: code.slice(pos, headerEnd) });
        out.push({ type: 'plain', text: rest });
      }
    } else {
      out.push({ type: lineType(code, pos), text: code.slice(pos, end) });
    }
    pos = end;
  }
  return out;
};
