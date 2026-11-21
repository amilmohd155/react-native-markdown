import type { SyntaxTokenType, Token, Tokenizer } from '../types';

/**
 * Hand-rolled JSON / JSONC tokenizer (P3-29). Object keys are `property`,
 * other strings `string`, `true`/`false`/`null` `constant`, `//` and `/* *\/`
 * comments `comment`. A string (or bare word) is a key when the next thing
 * on its line, past spaces and tabs, is `:`. The rule is local (no bracket
 * stack), so a streaming chunker that re-feeds one line of context still
 * colours keys, and the look-ahead never crosses a line break, so a prefix
 * cut at a line boundary tokenizes like the whole input. The look-ahead only
 * skips whitespace the next token covers anyway, so the pass stays linear.
 * Never throws; malformed input is tokenized as far as it reads.
 */
export const jsonTokenizer: Tokenizer = (code) => {
  const n = code.length;
  if (n === 0) return [];
  const types: SyntaxTokenType[] = [];
  const ends: number[] = [];
  let pos = 0;

  /** Whether `:` follows offset `i` on the same line, past spaces and tabs. */
  const colonAfter = (i: number): boolean => {
    while (i < n) {
      const c = code.charCodeAt(i);
      if (c !== 32 && c !== 9) return c === 58;
      i++;
    }
    return false;
  };

  while (pos < n) {
    const c = code.charCodeAt(pos);
    let end = pos + 1;
    let type: SyntaxTokenType = 'plain';

    if (c === 32 || c === 9 || c === 10 || c === 13) {
      while (end < n && isSpace(code.charCodeAt(end))) end++;
    } else if (c === 47 && code.charCodeAt(pos + 1) === 47) {
      while (
        end < n &&
        code.charCodeAt(end) !== 10 &&
        code.charCodeAt(end) !== 13
      )
        end++;
      type = 'comment';
    } else if (c === 47 && code.charCodeAt(pos + 1) === 42) {
      const close = code.indexOf('*/', pos + 2);
      end = close === -1 ? n : close + 2;
      type = 'comment';
    } else if (c === 34) {
      while (end < n) {
        const d = code.charCodeAt(end);
        if (d === 34) {
          end++;
          break;
        }
        if (d === 10 || d === 13) break;
        if (d === 92) {
          const e = code.charCodeAt(end + 1);
          end += e === 10 || e === 13 ? 1 : 2;
        } else end++;
      }
      end = Math.min(end, n);
      type = colonAfter(end) ? 'property' : 'string';
    } else if (isDigit(c) || (c === 45 && isDigit(code.charCodeAt(pos + 1)))) {
      while (end < n && isDigit(code.charCodeAt(end))) end++;
      if (code.charCodeAt(end) === 46 && isDigit(code.charCodeAt(end + 1))) {
        end++;
        while (end < n && isDigit(code.charCodeAt(end))) end++;
      }
      const e = code.charCodeAt(end);
      if (e === 101 || e === 69) {
        let k = end + 1;
        const s = code.charCodeAt(k);
        if (s === 43 || s === 45) k++;
        if (isDigit(code.charCodeAt(k))) {
          while (k < n && isDigit(code.charCodeAt(k))) k++;
          end = k;
        }
      }
      type = 'number';
    } else if (isWord(c)) {
      while (
        end < n &&
        (isWord(code.charCodeAt(end)) || isDigit(code.charCodeAt(end)))
      )
        end++;
      const w = code.slice(pos, end);
      if (colonAfter(end)) type = 'property';
      else if (w === 'true' || w === 'false' || w === 'null') type = 'constant';
    } else if (
      c === 123 ||
      c === 125 ||
      c === 91 ||
      c === 93 ||
      c === 44 ||
      c === 58
    ) {
      type = 'punctuation';
    }

    // Merge with the previous token of the same type.
    const last = types.length - 1;
    if (last >= 0 && types[last] === type) ends[last] = end;
    else {
      types.push(type);
      ends.push(end);
    }
    pos = end;
  }

  const tokens: Token[] = [];
  let start = 0;
  for (let i = 0; i < types.length; i++) {
    const end = ends[i] as number;
    tokens.push({
      type: types[i] as SyntaxTokenType,
      text: code.slice(start, end),
    });
    start = end;
  }
  return tokens;
};

const isSpace = (c: number): boolean =>
  c === 32 || c === 9 || c === 10 || c === 13;
const isDigit = (c: number): boolean => c >= 48 && c <= 57;
const isWord = (c: number): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36;
