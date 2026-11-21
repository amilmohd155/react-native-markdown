import type { SyntaxTokenType, Tokenizer } from '../types';

/**
 * Python tokenizer (P3-29): a single left-to-right character scan with an
 * explicit frame stack (no recursion, no backtracking), so it is linear in
 * the input and never throws.
 *
 * - Strings with any prefix (`r`, `b`, `f`, `rb`, `t`...), single- or
 *   triple-quoted; triple-quoted ones span lines, unterminated ones run to the
 *   end (single-quoted: to the end of the line).
 * - f-strings: `{` / `}` are `punctuation` around an expression tokenized as
 *   code; the format spec after `:` is `string`; `{{` / `}}` are text.
 * - `@decorator` (at the start of a line) is `function`; the name after
 *   `def` is `function`, after `class` is `type`; a name before `(` is
 *   `function`, after `.` it is `property` (or `function` before `(`).
 * - `self` / `cls`, `True` / `False` / `None` and ALL_CAPS names are
 *   `constant`; builtin types and Capitalised names are `type`; builtin
 *   functions are `function`.
 *
 * Classification only looks left, plus lookahead within the current line, so
 * tokens of a prefix cut at a line boundary match the full text's tokens.
 */

type Out = { type: SyntaxTokenType; text: string }[];

function push(out: Out, type: SyntaxTokenType, text: string): void {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += text;
  else out.push({ type, text });
}

const set = (words: string): ReadonlySet<string> => new Set(words.split(' '));

const KEYWORDS = set(
  'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'
);
const CONSTANTS = set(
  'True False None self cls NotImplemented Ellipsis __name__ __file__'
);
const TYPES = set(
  'int str float bool list dict set tuple bytes bytearray object complex frozenset type range memoryview'
);
const BUILTINS = set(
  'print len open input repr abs all any ascii bin chr divmod enumerate filter format getattr setattr hasattr delattr hash hex id isinstance issubclass iter next map max min oct ord pow reversed round sorted sum super vars zip callable classmethod staticmethod property globals locals breakpoint compile eval exec dir help'
);
/** Soft keywords: keywords only as the first word of a line. */
const SOFT = set('match case type');

// Character classes, by char code.
const isSpace = (c: number): boolean =>
  c === 32 || c === 9 || c === 13 || c === 12;
const isDigit = (c: number): boolean => c >= 48 && c <= 57;
/** Identifier characters; anything non-ASCII counts (letters, surrogates). */
const isIdentStart = (c: number): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128;
const isIdent = (c: number): boolean => isIdentStart(c) || isDigit(c);
const isOperator = (c: number): boolean =>
  c === 43 || // +
  c === 45 || // -
  c === 42 || // *
  c === 47 || // /
  c === 37 || // %
  c === 38 || // &
  c === 124 || // |
  c === 94 || // ^
  c === 60 || // <
  c === 62 || // >
  c === 61 || // =
  c === 33 || // !
  c === 126 || // ~
  c === 64; // @
const isQuote = (c: number): boolean => c === 34 || c === 39;

/** Valid string prefixes, lower-cased. */
const PREFIXES = set('r u b f t br rb fr rf tr rt');

type StrFrame = {
  kind: 'str';
  quote: number; // char code of the quote
  triple: boolean;
  f: boolean;
};
type Frame =
  | { kind: 'code'; depth: number; fexpr: boolean }
  | StrFrame
  | { kind: 'spec' };

/** First non-blank character code after `end` on the same line, or NaN. */
function nextChar(code: string, end: number): number {
  let i = end;
  while (i < code.length && isSpace(code.charCodeAt(i))) i++;
  return code.charCodeAt(i);
}

const ALL_CAPS = /^[A-Z][A-Z0-9_]+$/;
const CAPITAL = /^[A-Z]/;
/** What may follow a soft keyword used as one: a name, number, string, `[{-`. */
const isIdentOrOpen = (c: number): boolean =>
  isIdentStart(c) ||
  isDigit(c) ||
  isQuote(c) ||
  c === 91 || // [
  c === 123 || // {
  c === 45; // -

/** ASCII lower case of a char code. */
const lower = (c: number): number => (c >= 65 && c <= 90 ? c + 32 : c);

/** End of a number starting at `i` (a digit, or `.` + digit). */
function scanNumber(code: string, i: number): number {
  const n = code.length;
  let j = i;
  const c1 = lower(code.charCodeAt(i + 1));
  if (code.charCodeAt(i) === 48 && (c1 === 120 || c1 === 111 || c1 === 98)) {
    // 0x / 0o / 0b
    j = i + 2;
    while (j < n && isIdent(code.charCodeAt(j)) && code.charCodeAt(j) < 128)
      j++;
    return j;
  }
  while (j < n && (isDigit(code.charCodeAt(j)) || code.charCodeAt(j) === 95))
    j++;
  if (code.charCodeAt(j) === 46 /* . */) {
    j++;
    while (j < n && (isDigit(code.charCodeAt(j)) || code.charCodeAt(j) === 95))
      j++;
  }
  if (lower(code.charCodeAt(j)) === 101 /* e */) {
    let k = j + 1;
    const s = code.charCodeAt(k);
    if (s === 43 || s === 45) k++;
    if (isDigit(code.charCodeAt(k))) {
      j = k;
      while (
        j < n &&
        (isDigit(code.charCodeAt(j)) || code.charCodeAt(j) === 95)
      )
        j++;
    }
  }
  if (lower(code.charCodeAt(j)) === 106 /* j */) j++;
  return j;
}

export const pythonTokenizer: Tokenizer = (code) => {
  const out: Out = [];
  const n = code.length;
  const stack: Frame[] = [{ kind: 'code', depth: 0, fexpr: false }];
  let prev = ''; // last non-blank code token
  let lineStart = true; // only blanks so far on this line (code frames)
  let i = 0;

  const emit = (type: SyntaxTokenType, end: number): void => {
    push(out, type, code.slice(i, end));
    i = end;
  };
  /** Emits a string's prefix and opening quote(s) from `i`, pushes it. */
  const startString = (quoteAt: number, q: number, f: boolean): void => {
    const triple =
      code.charCodeAt(quoteAt + 1) === q && code.charCodeAt(quoteAt + 2) === q;
    emit('string', quoteAt + (triple ? 3 : 1));
    stack.push({ kind: 'str', quote: q, triple, f });
    prev = '"';
  };
  const classify = (
    word: string,
    end: number,
    first: boolean
  ): SyntaxTokenType => {
    const next = nextChar(code, end);
    if (prev === '.') return next === 40 /* ( */ ? 'function' : 'property';
    if (prev === 'def') return 'function';
    if (prev === 'class') return 'type';
    if (KEYWORDS.has(word)) return 'keyword';
    // `match x:` but not `match = 1`, `match(...)`, `match.group`.
    if (first && SOFT.has(word) && isIdentOrOpen(next)) return 'keyword';
    if (CONSTANTS.has(word)) return 'constant';
    if (TYPES.has(word)) return 'type';
    if (BUILTINS.has(word)) return 'function';
    if (ALL_CAPS.test(word)) return 'constant';
    if (CAPITAL.test(word)) return 'type';
    if (next === 40) return 'function';
    return 'plain';
  };
  /** The string frame enclosing the top frame (an f-expr or a spec). */
  const outerString = (): StrFrame | undefined => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const f = stack[k];
      if (f && f.kind === 'str') return f;
    }
    return undefined;
  };
  /** Ends a single-line f-string at a newline from an f-expr or spec. */
  const unwindToLine = (): void => {
    while (stack.length > 1) {
      const f = stack[stack.length - 1];
      if (!f || (f.kind === 'code' && !f.fexpr)) break;
      stack.pop();
      if (f.kind === 'str') break;
    }
  };

  while (i < n) {
    const frame = stack[stack.length - 1];
    if (!frame) break;
    const c = code.charCodeAt(i);

    if (frame.kind === 'str') {
      const q = frame.quote;
      if (c === q) {
        if (!frame.triple) {
          emit('string', i + 1);
          stack.pop();
          continue;
        }
        if (code.charCodeAt(i + 1) === q && code.charCodeAt(i + 2) === q) {
          emit('string', i + 3);
          stack.pop();
          continue;
        }
      }
      if (c === 10 && !frame.triple) {
        // Unterminated single-line string ends at the line end.
        stack.pop();
        continue;
      }
      if (frame.f && c === 123 /* { */) {
        if (code.charCodeAt(i + 1) === 123) {
          emit('string', i + 2);
          continue;
        }
        emit('punctuation', i + 1);
        stack.push({ kind: 'code', depth: 0, fexpr: true });
        prev = '{';
        continue;
      }
      // A run of string text up to the next quote, brace, newline or end.
      let j = i;
      while (j < n) {
        const d = code.charCodeAt(j);
        if (d === 92 /* \ */) {
          j += 2;
          continue;
        }
        if (d === q && j > i) break;
        if (d === q) {
          j++;
          continue;
        }
        if (d === 10 && !frame.triple) break;
        if (frame.f && d === 123) break;
        if (frame.f && d === 125 && code.charCodeAt(j + 1) === 125) {
          j += 2;
          continue;
        }
        j++;
      }
      emit('string', Math.min(j, n));
      continue;
    }

    if (frame.kind === 'spec') {
      if (c === 125 /* } */) {
        emit('punctuation', i + 1);
        stack.pop(); // the spec; back in the string
        continue;
      }
      if (c === 123 /* { */) {
        emit('punctuation', i + 1);
        stack.push({ kind: 'code', depth: 0, fexpr: true });
        prev = '{';
        continue;
      }
      const str = outerString();
      if (c === 10 && !(str?.triple ?? false)) {
        unwindToLine();
        continue;
      }
      if (str && c === str.quote) {
        // The string ends inside the spec: leave the spec, let it close.
        stack.pop();
        continue;
      }
      let j = i + 1;
      while (j < n) {
        const d = code.charCodeAt(j);
        if (d === 123 || d === 125 || d === 10 || d === str?.quote) break;
        j++;
      }
      emit('string', j);
      continue;
    }

    // ---- code frame ----
    if (c === 10 /* \n */) {
      if (frame.fexpr && !(outerString()?.triple ?? false)) {
        unwindToLine();
        continue;
      }
      emit('plain', i + 1);
      lineStart = true;
      continue;
    }
    if (isSpace(c)) {
      let j = i + 1;
      while (j < n && isSpace(code.charCodeAt(j))) j++;
      emit('plain', j);
      continue;
    }
    if (c === 92 /* \ */) {
      emit('plain', Math.min(i + 2, n));
      continue;
    }
    const atLineStart = lineStart;
    lineStart = false;
    if (c === 35 /* # */) {
      const nl = code.indexOf('\n', i);
      emit('comment', nl === -1 ? n : nl);
      continue;
    }
    if (frame.fexpr && frame.depth === 0) {
      if (c === 125 /* } */) {
        emit('punctuation', i + 1);
        stack.pop();
        continue;
      }
      if (c === 58 /* : */ && code.charCodeAt(i + 1) !== 61 /* = */) {
        emit('punctuation', i + 1);
        stack.pop();
        stack.push({ kind: 'spec' });
        continue;
      }
    }
    if (isQuote(c)) {
      startString(i, c, false);
      continue;
    }
    if (isDigit(c) || (c === 46 && isDigit(code.charCodeAt(i + 1)))) {
      emit('number', scanNumber(code, i));
      prev = '0';
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdent(code.charCodeAt(j))) j++;
      const word = code.slice(i, j);
      // String prefix right before a quote: r"...", f'...', rb"""...""".
      const q = code.charCodeAt(j);
      const prefix = word.toLowerCase();
      if (j - i <= 2 && isQuote(q) && PREFIXES.has(prefix)) {
        startString(j, q, prefix.includes('f') || prefix.includes('t'));
        continue;
      }
      emit(classify(word, j, atLineStart), j);
      prev = word;
      continue;
    }
    if (
      c === 64 /* @ */ &&
      atLineStart &&
      isIdentStart(code.charCodeAt(i + 1))
    ) {
      // Decorator: @name or @dotted.name.
      let j = i + 1;
      while (
        j < n &&
        (isIdent(code.charCodeAt(j)) || code.charCodeAt(j) === 46)
      )
        j++;
      emit('function', j);
      prev = '@';
      continue;
    }
    if (isOperator(c)) {
      let j = i + 1;
      while (j < n && isOperator(code.charCodeAt(j))) j++;
      // `->` and `:=` style runs stay one operator token.
      emit('operator', j);
      prev = '+';
      continue;
    }
    if (c === 58 && code.charCodeAt(i + 1) === 61) {
      emit('operator', i + 2); // :=
      prev = '+';
      continue;
    }
    // Brackets and other punctuation.
    if (c === 40 || c === 91 || c === 123) frame.depth++;
    else if ((c === 41 || c === 93 || c === 125) && frame.depth > 0)
      frame.depth--;
    const isPunct =
      c === 40 ||
      c === 41 ||
      c === 91 ||
      c === 93 ||
      c === 123 ||
      c === 125 ||
      c === 44 ||
      c === 58 ||
      c === 59 ||
      c === 46;
    emit(isPunct ? 'punctuation' : 'plain', i + 1);
    prev = code.charAt(i - 1);
  }
  return out;
};
