import type { SyntaxTokenType, Tokenizer } from '../types';

/**
 * Bash / sh / zsh tokenizer (P3-29): a single left-to-right character scan
 * with an explicit frame stack (no recursion, no backtracking), so it is
 * linear in the input and never throws.
 *
 * - The first word of a command is `function`; reserved words and common
 *   builtins in that position are `keyword`. Command position starts a line
 *   and follows `;`, `|`, `&&`, `||`, `&`, `(`, `$(`, `` ` ``, `{` and words
 *   like `then` / `do`.
 * - `$var`, `${...}`, `$1`, `$?` are `constant`, also inside double quotes.
 *   `$(...)` and backticks are `punctuation` around a nested command, also
 *   inside double quotes. `NAME=` is a `constant` assignment.
 * - `'...'`, `"..."`, `$'...'` and heredoc bodies are `string`; `#` at the
 *   start of a word begins a `comment`; `-f` / `--flag` are `property`.
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

/** Reserved words and builtins shown as `keyword` in command position. */
const KEYWORDS = set(
  'if then else elif fi for while until do done case esac in function select time coproc return exit break continue local export readonly declare typeset unset set shift source alias unalias trap eval exec let'
);
/** Keywords after which the next word is again a command. */
const LEADS = set('if then else elif while until do time !');

// Character classes, by char code.
const isSpace = (c: number): boolean => c === 32 || c === 9 || c === 13;
const isDigit = (c: number): boolean => c >= 48 && c <= 57;
const isIdentStart = (c: number): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isIdent = (c: number): boolean => isIdentStart(c) || isDigit(c);
/** Characters that end an unquoted word. */
const isBreak = (c: number): boolean =>
  isSpace(c) ||
  c === 10 || // \n
  c === 34 || // "
  c === 39 || // '
  c === 96 || // `
  c === 36 || // $
  c === 40 || // (
  c === 41 || // )
  c === 123 || // {
  c === 125 || // }
  c === 59 || // ;
  c === 124 || // |
  c === 38 || // &
  c === 60 || // <
  c === 62 || // >
  c === 92 || // \
  Number.isNaN(c);

/** A frame of the scan: code (top level, `$(...)`, backticks) or `"..."`. */
type Frame =
  | { kind: 'code'; close: '' | ')' | '`'; depth: number }
  | { kind: 'dq' };

type Heredoc = { delim: string; stripTabs: boolean };

const ROOT: Frame = { kind: 'code', close: '', depth: 0 };

/**
 * Scans a `$` expansion at `i` (code at `i` is `$`). Returns its end and
 * type, or -1 when `$` is literal. `$(` is handled by the caller.
 */
function scanDollar(code: string, i: number): number {
  const c = code.charCodeAt(i + 1);
  if (c === 123 /* { */) {
    // ${...}, nested braces counted, stops at the line end.
    let depth = 0;
    let j = i + 1;
    while (j < code.length) {
      const d = code.charCodeAt(j);
      if (d === 10) return j;
      if (d === 123) depth++;
      else if (d === 125 && --depth === 0) return j + 1;
      j++;
    }
    return j;
  }
  if (isIdentStart(c)) {
    let j = i + 2;
    while (j < code.length && isIdent(code.charCodeAt(j))) j++;
    return j;
  }
  // $1, $?, $#, $$, $!, $@, $*, $-
  if (isDigit(c) || '?#$!@*-'.includes(code.charAt(i + 1) || ' ')) {
    return i + 2;
  }
  return -1;
}

export const bashTokenizer: Tokenizer = (code) => {
  const out: Out = [];
  const n = code.length;
  const stack: Frame[] = [{ kind: 'code', close: '', depth: 0 }];
  let cmd = true; // next word is in command position
  // Stack depth of the value right after `NAME=` (-1: none). Its words are
  // plain, and when it ends the command position is what it was before.
  let value = -1;
  let valueCmd = false;
  let fnName = false; // the word after `function`
  let pending: Heredoc[] = []; // heredocs whose bodies start next line
  let i = 0;

  const emit = (type: SyntaxTokenType, end: number): void => {
    push(out, type, code.slice(i, end));
    i = end;
  };

  /** Heredoc bodies after a newline: `string` through each terminator. */
  const heredocBodies = (): void => {
    for (const doc of pending) {
      const start = i;
      let found = false;
      while (i < n) {
        const nl = code.indexOf('\n', i);
        const end = nl === -1 ? n : nl + 1;
        let lineStart = i;
        if (doc.stripTabs) {
          while (code.charCodeAt(lineStart) === 9) lineStart++;
        }
        const lineEnd = nl === -1 ? n : nl;
        let line = code.slice(lineStart, lineEnd);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        i = end;
        if (line === doc.delim) {
          found = true;
          break;
        }
      }
      push(out, 'string', code.slice(start, i));
      if (!found) break;
    }
    pending = [];
  };

  while (i < n) {
    const frame = stack[stack.length - 1] ?? ROOT;
    const c = code.charCodeAt(i);

    if (frame.kind === 'dq') {
      if (c === 34 /* " */) {
        emit('string', i + 1);
        stack.pop();
        continue;
      }
      if (c === 36 /* $ */) {
        if (code.charCodeAt(i + 1) === 40 /* ( */) {
          emit('punctuation', i + 2);
          stack.push({ kind: 'code', close: ')', depth: 0 });
          cmd = true;
          continue;
        }
        const end = scanDollar(code, i);
        if (end !== -1) {
          emit('constant', end);
          continue;
        }
        emit('string', i + 1);
        continue;
      }
      if (c === 96 /* ` */) {
        emit('punctuation', i + 1);
        stack.push({ kind: 'code', close: '`', depth: 0 });
        cmd = true;
        continue;
      }
      // A run of plain string text (escapes included).
      let j = i;
      while (j < n) {
        const d = code.charCodeAt(j);
        if (d === 34 || d === 36 || d === 96) break;
        j += d === 92 /* \ */ ? 2 : 1;
      }
      emit('string', Math.min(j, n));
      continue;
    }

    // ---- code frame ----
    if (c === 10 /* \n */) {
      emit('plain', i + 1);
      cmd = true;
      if (value === stack.length) value = -1;
      fnName = false;
      if (pending.length > 0) heredocBodies();
      continue;
    }
    if (isSpace(c)) {
      let j = i + 1;
      while (j < n && isSpace(code.charCodeAt(j))) j++;
      emit('plain', j);
      if (value === stack.length) {
        value = -1;
        cmd = valueCmd;
      }
      continue;
    }
    if (c === 92 /* \ */) {
      // Escape or line continuation: keeps the command position.
      emit('plain', Math.min(i + 2, n));
      continue;
    }
    if (c === 35 /* # */) {
      const nl = code.indexOf('\n', i);
      emit('comment', nl === -1 ? n : nl);
      continue;
    }
    if (c === 39 /* ' */) {
      const close = code.indexOf("'", i + 1);
      emit('string', close === -1 ? n : close + 1);
      cmd = false;
      continue;
    }
    if (c === 34 /* " */) {
      emit('string', i + 1);
      stack.push({ kind: 'dq' });
      cmd = false;
      continue;
    }
    if (c === 36 /* $ */) {
      const next = code.charCodeAt(i + 1);
      if (next === 40 /* ( */) {
        // $( or $(( : the inner ( of arithmetic counts as depth.
        emit('punctuation', i + 2);
        stack.push({ kind: 'code', close: ')', depth: 0 });
        cmd = true;
        continue;
      }
      if (next === 39 /* ' */) {
        // $'...' with backslash escapes.
        let j = i + 2;
        while (j < n && code.charCodeAt(j) !== 39) {
          j += code.charCodeAt(j) === 92 ? 2 : 1;
        }
        emit('string', Math.min(j + 1, n));
        cmd = false;
        continue;
      }
      const end = scanDollar(code, i);
      emit(end === -1 ? 'plain' : 'constant', end === -1 ? i + 1 : end);
      cmd = false;
      continue;
    }
    if (c === 96 /* ` */) {
      emit('punctuation', i + 1);
      if (frame.kind === 'code' && frame.close === '`') {
        stack.pop();
        cmd = false;
      } else {
        stack.push({ kind: 'code', close: '`', depth: 0 });
        cmd = true;
      }
      continue;
    }
    if (c === 40 /* ( */) {
      emit('punctuation', i + 1);
      frame.depth++;
      cmd = true;
      continue;
    }
    if (c === 41 /* ) */) {
      emit('punctuation', i + 1);
      if (frame.depth > 0) frame.depth--;
      else if (frame.close === ')') stack.pop();
      cmd = false;
      continue;
    }
    if (c === 123 /* { */ || c === 125 /* } */) {
      emit('punctuation', i + 1);
      cmd = c === 123 && cmd;
      continue;
    }
    if (c === 59 || c === 124 || c === 38 || c === 60 || c === 62) {
      // ; | & < > : operator runs. `<<` outside `((...))` starts a heredoc.
      if (
        c === 60 &&
        frame.depth === 0 &&
        code.startsWith('<<', i) &&
        !code.startsWith('<<<', i)
      ) {
        const stripTabs = code.charCodeAt(i + 2) === 45; /* - */
        emit('operator', i + (stripTabs ? 3 : 2));
        // Optional blanks, then the delimiter word (maybe quoted).
        let j = i;
        while (j < n && isSpace(code.charCodeAt(j))) j++;
        emit('plain', j);
        const q = code.charCodeAt(i);
        let delim = '';
        if (q === 39 || q === 34) {
          // The closing quote, on this line only.
          let k = i + 1;
          while (k < n && code.charCodeAt(k) !== q && code.charCodeAt(k) !== 10)
            k++;
          if (code.charCodeAt(k) === q) {
            delim = code.slice(i + 1, k);
            emit('string', k + 1);
          }
        } else {
          let k = i;
          while (k < n && !isBreak(code.charCodeAt(k))) k++;
          delim = code.slice(i, k);
          emit('string', k);
        }
        if (delim !== '') pending.push({ delim, stripTabs });
        continue;
      }
      let j = i + 1;
      while (j < n) {
        const d = code.charCodeAt(j);
        if (d !== 59 && d !== 124 && d !== 38 && d !== 60 && d !== 62) break;
        j++;
      }
      const op = code.slice(i, j);
      emit('operator', j);
      if (value === stack.length) value = -1;
      // Separators (`;`, `|`, `&&`, `&`) start a command; redirections
      // (`>`, `>&`, `<`) keep the position.
      if (!op.includes('<') && !op.includes('>')) cmd = true;
      continue;
    }

    // ---- an unquoted word ----
    let j = i;
    while (j < n && !isBreak(code.charCodeAt(j))) j++;
    if (j === i) {
      // A lone break character not handled above (e.g. a lone \r).
      emit('plain', i + 1);
      continue;
    }
    const word = code.slice(i, j);
    const first = word.charCodeAt(0);
    const inValue = value === stack.length;
    // NAME= and NAME+= (assignment).
    if (!inValue && isIdentStart(first)) {
      let k = i + 1;
      while (k < j && isIdent(code.charCodeAt(k))) k++;
      const eq = code.startsWith('+=', k)
        ? 2
        : code.charCodeAt(k) === 61
          ? 1
          : 0;
      if (eq > 0 && k + eq <= j) {
        emit('constant', k);
        emit('operator', k + eq);
        value = stack.length;
        valueCmd = cmd;
        emit('plain', j);
        continue;
      }
    }
    if (inValue) {
      emit('plain', j);
      continue;
    }
    if (fnName) {
      emit('function', j);
      fnName = false;
      cmd = false;
      continue;
    }
    if (cmd && (KEYWORDS.has(word) || word === '!')) {
      emit('keyword', j);
      cmd = LEADS.has(word);
      fnName = word === 'function';
      continue;
    }
    if (cmd) {
      emit('function', j);
      cmd = false;
      continue;
    }
    if (word === 'in') {
      // `for x in`, `case $x in`.
      emit('keyword', j);
      continue;
    }
    if (first === 45 /* - */ && j - i > 1) {
      const second = word.charCodeAt(1);
      if (isIdentStart(second) || (second === 45 && j - i > 2)) {
        emit('property', j);
        continue;
      }
    }
    let digits = true;
    for (let k = i; k < j; k++) {
      if (!isDigit(code.charCodeAt(k))) {
        digits = false;
        break;
      }
    }
    emit(digits ? 'number' : 'plain', j);
  }
  return out;
};
