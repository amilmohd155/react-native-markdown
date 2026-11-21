import type { SyntaxTokenType, Token, Tokenizer } from '../types';

/**
 * Hand-rolled JavaScript / TypeScript tokenizer (P3-29). `language` is
 * `'javascript'` or `'typescript'` (see ../languages.ts); TypeScript adds
 * type annotations, generics, interfaces, enums and type aliases.
 *
 * A single forward pass over char codes: linear time, no regular expressions
 * on the input, never throws. Each token's type depends only on the text
 * before it plus a look-ahead that never crosses a line break, so a prefix
 * cut at a line boundary tokenizes like the same lines of the whole input.
 *
 * - Regex literal or division: decided from the previous significant token
 *   (after a value, `)`, `]` or `}` it is division), before scanning, so a
 *   lone `/` never scans ahead. An unterminated regex stops at the line end.
 * - Template literals: the text is `string`, `${` and its `}` are
 *   `punctuation`, the expression inside is tokenized as code (nested
 *   templates included).
 */
export const javascriptTokenizer: Tokenizer = (code, language) =>
  tokenize(code, language === 'typescript');

const words = (s: string): ReadonlySet<string> => new Set(s.split(' '));

const KEYWORDS = words(
  'async await break case catch class const continue debugger default delete do else enum export extends finally for function if implements import in instanceof interface let new private protected public return static super switch this throw try typeof var void while with yield as'
);
// Keywords only when not used as a name (`get(`, `of =`, `{ type }`).
const JS_CONTEXTUAL = words('from get set of');
const TS_CONTEXTUAL = words(
  'from get set of type is module namespace declare keyof infer satisfies override abstract readonly asserts unique global accessor'
);
const CONSTANTS = words('true false null undefined NaN Infinity');
const TS_PRIMITIVES = words(
  'string number boolean any never unknown object symbol bigint'
);
// Member modifiers in class and interface bodies.
const MODIFIERS = words(
  'static async private protected public readonly abstract override declare get set accessor'
);
const DECLARATIONS = words('let const var using');
const NAME_IS_TYPE = words('class interface enum type extends implements');
const STARTS_TYPE = words('as satisfies is extends implements');

// Char codes.
const TAB = 9;
const LF = 10;
const CR = 13;
const SPACE = 32;
const BANG = 33;
const DQUOTE = 34;
const HASH = 35;
const AMP = 38;
const SQUOTE = 39;
const LPAREN = 40;
const RPAREN = 41;
const STAR = 42;
const PLUS = 43;
const COMMA = 44;
const MINUS = 45;
const DOT = 46;
const SLASH = 47;
const COLON = 58;
const SEMI = 59;
const LT = 60;
const EQ = 61;
const GT = 62;
const QUESTION = 63;
const AT = 64;
const LBRACKET = 91;
const BACKSLASH = 92;
const RBRACKET = 93;
const BACKTICK = 96;
const LBRACE = 123;
const PIPE = 124;
const RBRACE = 125;

const isDigit = (c: number): boolean => c >= 48 && c <= 57;
const isIdStart = (c: number): boolean =>
  (c >= 97 && c <= 122) ||
  (c >= 65 && c <= 90) ||
  c === 95 ||
  c === 36 ||
  c >= 128;
const isIdPart = (c: number): boolean => isIdStart(c) || isDigit(c);
const isUpper = (c: number): boolean => c >= 65 && c <= 90;
/** ASCII lower case of a char code. */
const lower = (c: number): number => (isUpper(c) ? c + 32 : c);
const isSpace = (c: number): boolean =>
  c === SPACE || c === TAB || c === LF || c === CR || c === 11 || c === 12;
// `+-*%&|^<>=!~/` (`?` and `:` are lexed on their own).
const isOperator = (c: number): boolean =>
  c === PLUS ||
  c === MINUS ||
  c === STAR ||
  c === 37 ||
  c === AMP ||
  c === PIPE ||
  c === 94 ||
  c === LT ||
  c === GT ||
  c === EQ ||
  c === BANG ||
  c === 126 ||
  c === SLASH;

const allCaps = (w: string): boolean => {
  for (let i = 0; i < w.length; i++) {
    const c = w.charCodeAt(i);
    if (!(isUpper(c) || isDigit(c) || c === 95)) return false;
  }
  return true;
};

/** Tokens as type + end offset, merged as they are pushed; sliced at the end. */
type Emitter = {
  push(type: SyntaxTokenType, end: number): void;
  tokens(): Token[];
};

function createEmitter(code: string): Emitter {
  const types: SyntaxTokenType[] = [];
  const ends: number[] = [];
  return {
    push(type, end) {
      const last = ends.length - 1;
      if (end <= (last >= 0 ? (ends[last] as number) : 0)) return;
      if (last >= 0 && types[last] === type) ends[last] = end;
      else {
        types.push(type);
        ends.push(end);
      }
    },
    tokens() {
      const out: Token[] = [];
      let start = 0;
      for (let i = 0; i < types.length; i++) {
        const end = ends[i] as number;
        out.push({
          type: types[i] as SyntaxTokenType,
          text: code.slice(start, end),
        });
        start = end;
      }
      return out;
    },
  };
}

type BraceKind = 'block' | 'type' | 'class' | 'enum';

type Frame = {
  readonly kind: 'root' | 'brace' | 'paren' | 'bracket' | 'angle' | 'template';
  readonly brace: BraceKind;
  /** TypeScript: words here are types (`x: Foo`, `as Foo`, `Foo<Bar>`). */
  inType: boolean;
  /** `?` (ternary) and `case` still waiting for their `:`. */
  pending: number;
  /** The type here is a `type X =` alias (conditional types allowed). */
  alias: boolean;
};

const frame = (
  kind: Frame['kind'],
  inType = false,
  brace: BraceKind = 'block'
): Frame => ({ kind, brace, inType, pending: 0, alias: false });

// How far a `<` after a name may look for its `>` to count as generic, and
// how deep it may nest. Each scan stops at the next line break or after
// GENERIC_DEPTH more `<`, so all scans together stay linear in the input.
const GENERIC_SCAN = 256;
const GENERIC_DEPTH = 6;

function tokenize(code: string, ts: boolean): Token[] {
  const n = code.length;
  if (n === 0) return [];
  const out = createEmitter(code);
  const stack: Frame[] = [frame('root')];
  let cur = stack[0] as Frame;

  // Previous significant token (whitespace and comments skipped).
  let prevText = '';
  let prevValue = false; // ends a value: `/` after it is division
  let prev2Text = '';
  let newlineSincePrev = true;
  // TypeScript statement state.
  let nextBrace: BraceKind | null = null; // body of `interface`, `class`, `enum`
  let nextBraceDepth = 0;
  let pendingAlias = false; // after `type Name`, until its `=`
  let inImport = false; // `as` in import/export lists renames, not a type
  let genericAt = -1; // offset of a `<` known to open type arguments
  let genericCalls = false; // ... and followed by `(`

  const code0 = (i: number): number =>
    i >= 0 && i < n ? code.charCodeAt(i) : -1;

  const significant = (text: string, value: boolean): void => {
    prev2Text = prevText;
    prevText = text;
    prevValue = value;
    newlineSincePrev = false;
  };

  const push = (f: Frame): void => {
    stack.push(f);
    cur = f;
  };
  const pop = (): void => {
    if (stack.length > 1) stack.pop();
    cur = stack[stack.length - 1] as Frame;
  };
  /** Pops to the nearest frame of `kind` (a few levels at most), if any. */
  const close = (kind: Frame['kind']): boolean => {
    while (cur.kind === 'angle' && kind !== 'angle') pop();
    for (let i = stack.length - 1, d = 0; i > 0 && d < 8; i--, d++) {
      const f = stack[i] as Frame;
      if (f.kind === kind) {
        stack.length = i;
        cur = stack[i - 1] as Frame;
        return true;
      }
      if (f.kind === 'template') return false;
    }
    return false;
  };

  /**
   * Whether a `}` ends a `${}` interpolation: the nearest brace or template
   * frame (a few levels down, past unclosed `(`, `[`, `<`) is a template.
   * If so, pops to its parent.
   */
  const closesTemplate = (): boolean => {
    for (let i = stack.length - 1, d = 0; i > 0 && d < 8; i--, d++) {
      const f = stack[i] as Frame;
      if (f.kind === 'brace') return false;
      if (f.kind === 'template') {
        stack.length = i;
        cur = stack[i - 1] as Frame;
        return true;
      }
    }
    return false;
  };

  /** First char code after `i` on the same line, skipping spaces and tabs. */
  const nextChar = (i: number): number => {
    while (i < n) {
      const c = code.charCodeAt(i);
      if (c !== SPACE && c !== TAB) return c;
      i++;
    }
    return -1;
  };

  /** Whether the word ending at `i` is followed by ` is ` (`x is T`). */
  const isPredicate = (i: number): boolean => {
    while (
      i < n &&
      (code.charCodeAt(i) === SPACE || code.charCodeAt(i) === TAB)
    )
      i++;
    return (
      i < n - 2 &&
      code.charCodeAt(i) === 105 &&
      code.charCodeAt(i + 1) === 115 &&
      !isIdPart(code.charCodeAt(i + 2))
    );
  };

  /** Offset after the `>` closing the `<` at `i` if it reads as type arguments, else -1. */
  const genericEnd = (i: number): number => {
    let depth = 0;
    const limit = Math.min(n, i + GENERIC_SCAN);
    for (let j = i; j < limit; j++) {
      const c = code.charCodeAt(j);
      if (c === LT) {
        if (++depth > GENERIC_DEPTH) return -1;
      } else if (c === GT) {
        if (--depth === 0) {
          const after = code0(j + 1);
          return after === -1 ||
            after === LPAREN ||
            after === RPAREN ||
            after === COMMA ||
            after === SEMI ||
            after === DOT ||
            after === LBRACKET ||
            after === RBRACKET ||
            after === BACKTICK ||
            after === LBRACE ||
            after === RBRACE ||
            after === EQ ||
            after === GT ||
            after === PIPE ||
            after === AMP ||
            after === QUESTION ||
            after === COLON ||
            isSpace(after)
            ? j + 1
            : -1;
        }
      } else if (c === EQ) {
        if (code0(j + 1) === GT) j++; // `=>` in a function type
      } else if (c === AMP || c === PIPE) {
        if (code0(j + 1) === c) return -1; // `&&`, `||`
      } else if (
        !(
          isIdPart(c) ||
          c === SPACE ||
          c === TAB ||
          c === COMMA ||
          c === DOT ||
          c === LBRACKET ||
          c === RBRACKET ||
          c === LBRACE ||
          c === RBRACE ||
          c === COLON ||
          c === SEMI ||
          c === QUESTION ||
          c === SQUOTE ||
          c === DQUOTE ||
          c === LPAREN ||
          c === RPAREN
        )
      )
        return -1;
    }
    return -1;
  };

  /** Scans template text from `i` (an opening backtick, or after `}`) to its end or `${`. */
  const template = (i: number, opening: boolean): number => {
    let j = opening ? i + 1 : i;
    while (j < n) {
      const c = code.charCodeAt(j);
      if (c === BACKSLASH) j += 2;
      else if (c === BACKTICK) {
        j++;
        break;
      } else if (c === 36 && code0(j + 1) === LBRACE) {
        out.push('string', j);
        out.push('punctuation', j + 2);
        push(frame('template'));
        significant('${', false);
        return j + 2;
      } else j++;
    }
    j = Math.min(j, n);
    out.push('string', j);
    significant('`', true);
    return j;
  };

  const classifyWord = (
    w: string,
    start: number,
    end: number
  ): SyntaxTokenType => {
    const nc = nextChar(end);
    if (
      ts &&
      code0(end) === LT &&
      (prevText === 'function' ||
        isIdStart(code0(end + 1)) ||
        code0(end + 1) === LBRACKET ||
        code0(end + 1) === LBRACE ||
        code0(end + 1) === LPAREN)
    ) {
      const after = genericEnd(end);
      genericAt = after === -1 ? -1 : end;
      genericCalls = after !== -1 && nextChar(after) === LPAREN;
    }
    const callsNext = nc === LPAREN || (genericAt === end && genericCalls);

    if (prevText === '.' || prevText === '?.')
      return cur.inType && ts ? 'type' : callsNext ? 'function' : 'property';

    if (code0(start - 1) === HASH) return callsNext ? 'function' : 'property';
    if (KEYWORDS.has(w)) {
      keyword(w, nc);
      return 'keyword';
    }
    if (
      (ts ? TS_CONTEXTUAL : JS_CONTEXTUAL).has(w) &&
      !DECLARATIONS.has(prevText)
    ) {
      const named =
        nc === -1 ||
        nc === LPAREN ||
        nc === COLON ||
        nc === COMMA ||
        nc === RPAREN ||
        nc === DOT ||
        nc === EQ ||
        nc === SEMI ||
        nc === RBRACE ||
        nc === RBRACKET ||
        nc === QUESTION ||
        nc === BANG ||
        nc === LF ||
        nc === CR;
      if (!named) {
        keyword(w, nc);
        return 'keyword';
      }
    }
    if (CONSTANTS.has(w)) return 'constant';
    if (ts && cur.inType) return isPredicate(end) ? 'plain' : 'type';
    if (prevText === 'function') return 'function';
    if (NAME_IS_TYPE.has(prevText) && (prevText !== 'type' || ts))
      return 'type';
    if (ts && TS_PRIMITIVES.has(w)) return 'type';

    // Members of object literals, classes, interfaces and enums.
    const brace = cur.kind === 'brace' ? cur.brace : null;
    if (
      brace === 'enum' &&
      (prevText === '{' || prevText === ',' || newlineSincePrev)
    )
      return 'property';
    if (
      (brace === 'class' || brace === 'type') &&
      (newlineSincePrev ||
        prevText === '{' ||
        prevText === ';' ||
        prevText === ',' ||
        prevText === '}' ||
        MODIFIERS.has(prevText))
    ) {
      if (callsNext) return 'function';
      if (
        nc === COLON ||
        nc === QUESTION ||
        nc === BANG ||
        nc === EQ ||
        nc === SEMI
      )
        return 'property';
    }
    if (
      nc === COLON &&
      cur.kind !== 'paren' &&
      (prevText === '{' || prevText === ',')
    )
      return 'property';

    if (w.length > 1 && isUpper(w.charCodeAt(0)) && allCaps(w))
      return 'constant';
    if (isUpper(w.charCodeAt(0))) return 'type';
    if (callsNext) return 'function';
    return 'plain';
  };

  /** Statement-level side effects of a keyword. */
  const keyword = (w: string, nc: number): void => {
    if (w === 'case') cur.pending++;
    // A regex, not a quoted keyword literal: check:expo-go would read the
    // quote after that keyword as a side-effect module import.
    else if (/^(?:import|export)$/.test(w)) inImport = true;
    else if (w === 'from') inImport = false;
    else if (w !== 'as' && w !== 'type' && w !== 'default' && w !== 'typeof')
      inImport = false;
    if (!ts) return;
    if (w === 'interface' || w === 'class' || w === 'enum') {
      nextBrace = w === 'interface' ? 'type' : w;
      nextBraceDepth = stack.length;
    } else if (w === 'type') {
      if (isIdStart(nc)) pendingAlias = true;
    } else if (STARTS_TYPE.has(w) && !(w === 'as' && inImport))
      cur.inType = true;
  };

  let pos = 0;
  // Hashbang.
  if (code.charCodeAt(0) === HASH && code0(1) === BANG) {
    pos = lineEnd(code, 0);
    out.push('comment', pos);
  }

  while (pos < n) {
    const c = code.charCodeAt(pos);
    const start = pos;

    if (isSpace(c)) {
      let j = pos;
      let newline = false;
      while (j < n && isSpace(code.charCodeAt(j))) {
        if (code.charCodeAt(j) === LF) newline = true;
        j++;
      }
      if (newline) {
        newlineSincePrev = true;
        // A complete type at a line end ends the annotation.
        if (
          ts &&
          cur.inType &&
          cur.kind !== 'paren' &&
          cur.kind !== 'angle' &&
          cur.kind !== 'bracket' &&
          (prevValue ||
            prevText === ')' ||
            prevText === ']' ||
            prevText === '>' ||
            prevText === '}')
        )
          cur.inType = false;
      }
      out.push('plain', j);
      pos = j;
      continue;
    }

    if (c === SLASH) {
      const c1 = code0(pos + 1);
      if (c1 === SLASH) {
        pos = lineEnd(code, pos);
        out.push('comment', pos);
        continue;
      }
      if (c1 === STAR) {
        const closeAt = code.indexOf('*/', pos + 2);
        pos = closeAt === -1 ? n : closeAt + 2;
        out.push('comment', pos);
        continue;
      }
      if (!prevValue && !(prevText === '++' || prevText === '--')) {
        pos = regex(code, pos);
        out.push('string', pos);
        significant('/re/', true);
        continue;
      }
    }

    if (isIdStart(c) || (c === HASH && isIdStart(code0(pos + 1)))) {
      let j = pos + 1;
      while (j < n && isIdPart(code.charCodeAt(j))) j++;
      const w = code.slice(c === HASH ? pos + 1 : pos, j);
      const type = classifyWord(w, c === HASH ? pos + 1 : pos, j);
      out.push(type, j);
      const value = type !== 'keyword' || w === 'this' || w === 'super';
      significant(w, value);
      pos = j;
      continue;
    }

    if (isDigit(c) || (c === DOT && isDigit(code0(pos + 1)))) {
      pos = number(code, pos);
      out.push('number', pos);
      significant('0', true);
      continue;
    }

    if (c === DQUOTE || c === SQUOTE) {
      let j = pos + 1;
      while (j < n) {
        const d = code.charCodeAt(j);
        if (d === c) {
          j++;
          break;
        }
        if (d === BACKSLASH) j += 2;
        else if (d === LF || d === CR) break;
        else j++;
      }
      pos = Math.min(j, n);
      out.push('string', pos);
      significant('"', true);
      continue;
    }

    if (c === BACKTICK) {
      pos = template(pos, true);
      continue;
    }

    if (c === AT && isIdStart(code0(pos + 1))) {
      let j = pos + 1;
      while (j < n && isIdPart(code.charCodeAt(j))) j++;
      out.push('function', j);
      significant('@', true);
      pos = j;
      continue;
    }

    switch (c) {
      case LBRACE: {
        let kind: BraceKind = 'block';
        if (nextBrace && stack.length === nextBraceDepth) {
          kind = nextBrace;
          nextBrace = null;
          cur.inType = false;
        } else if (ts && cur.inType) {
          if (
            prevValue ||
            prevText === ')' ||
            prevText === ']' ||
            prevText === '>'
          )
            cur.inType = false;
          else kind = 'type';
        }
        pendingAlias = false;
        out.push('punctuation', pos + 1);
        push(frame('brace', false, kind));
        significant('{', false);
        pos++;
        continue;
      }
      case RBRACE: {
        if (closesTemplate()) {
          out.push('punctuation', pos + 1);
          pos = template(pos + 1, false);
          continue;
        }
        close('brace');
        out.push('punctuation', pos + 1);
        significant('}', false);
        pos++;
        continue;
      }
      case LPAREN:
        out.push('punctuation', pos + 1);
        push(frame('paren'));
        significant('(', false);
        pos++;
        continue;
      case RPAREN:
        close('paren');
        out.push('punctuation', pos + 1);
        significant(')', true);
        pos++;
        continue;
      case LBRACKET:
        out.push('punctuation', pos + 1);
        push(frame('bracket', ts && cur.inType));
        significant('[', false);
        pos++;
        continue;
      case RBRACKET:
        close('bracket');
        out.push('punctuation', pos + 1);
        significant(']', true);
        pos++;
        continue;
      case SEMI:
        while (cur.kind === 'angle') pop();
        cur.inType = false;
        cur.alias = false;
        cur.pending = 0;
        pendingAlias = false;
        inImport = false;
        out.push('punctuation', pos + 1);
        significant(';', false);
        pos++;
        continue;
      case COMMA:
        if (cur.kind !== 'angle' && cur.kind !== 'bracket') cur.inType = false;
        out.push('punctuation', pos + 1);
        significant(',', false);
        pos++;
        continue;
      case DOT: {
        const spread = code0(pos + 1) === DOT && code0(pos + 2) === DOT;
        pos += spread ? 3 : 1;
        out.push('punctuation', pos);
        significant(spread ? '...' : '.', false);
        continue;
      }
      case COLON: {
        if (cur.pending > 0) cur.pending--;
        else if (
          ts &&
          prevText !== 'default' &&
          (cur.kind === 'paren' ||
            (cur.kind === 'brace' &&
              (cur.brace === 'type' || cur.brace === 'class')) ||
            prevText === ')' ||
            (DECLARATIONS.has(prev2Text) && prevValue))
        )
          cur.inType = true;
        out.push('punctuation', pos + 1);
        significant(':', false);
        pos++;
        continue;
      }
      case QUESTION: {
        const c1 = code0(pos + 1);
        let j = pos + 1;
        if (c1 === QUESTION) j = code0(pos + 2) === EQ ? pos + 3 : pos + 2;
        else if (c1 === DOT && !isDigit(code0(pos + 2))) j = pos + 2;
        else if (c1 !== COLON && c1 !== RPAREN && c1 !== COMMA && c1 !== EQ) {
          cur.pending++; // ternary; in a value it ends the type (`x as T ? a : b`)
          if (!cur.alias && cur.kind !== 'angle') cur.inType = false;
        }
        out.push('operator', j);
        significant(code.slice(pos, j), false);
        pos = j;
        continue;
      }
      default:
        break;
    }

    if (ts && c === LT && (genericAt === pos || cur.inType || pendingAlias)) {
      genericAt = -1;
      out.push('punctuation', pos + 1);
      push(frame('angle', true));
      significant('<', false);
      pos++;
      continue;
    }
    if (ts && c === GT && cur.kind === 'angle') {
      pop();
      out.push('punctuation', pos + 1);
      significant('>', true);
      pos++;
      continue;
    }

    if (isOperator(c)) {
      let j = pos + 1;
      while (j < n) {
        const d = code.charCodeAt(j);
        if (!isOperator(d)) break;
        if (d === SLASH) {
          const d1 = code0(j + 1);
          if (d1 === SLASH || d1 === STAR) break;
        }
        if (d === GT && cur.kind === 'angle' && code.charCodeAt(j - 1) !== EQ)
          break;
        j++;
      }
      const op = code.slice(pos, j);
      if (op === '=') {
        if (pendingAlias) {
          pendingAlias = false;
          cur.inType = true;
          cur.alias = true;
        } else if (cur.kind !== 'angle') cur.inType = false;
      } else if (op === '=>' && cur.kind !== 'angle') cur.inType = false;
      out.push('operator', j);
      significant(op, false);
      pos = j;
      continue;
    }

    // Anything else (`\`, `#`, stray chars): plain, one char.
    out.push('plain', start + 1);
    pos = start + 1;
  }

  return out.tokens();
}

/** Offset of the line break at or after `i` (or the end). */
function lineEnd(code: string, i: number): number {
  const n = code.length;
  while (i < n) {
    const c = code.charCodeAt(i);
    if (c === LF || c === CR) return i;
    i++;
  }
  return n;
}

/** Scans a regex literal at `i` (a `/`); unterminated stops at the line end. */
function regex(code: string, i: number): number {
  const n = code.length;
  let j = i + 1;
  let inClass = false;
  while (j < n) {
    const c = code.charCodeAt(j);
    if (c === LF || c === CR) return j;
    if (c === BACKSLASH) {
      const d = j + 1 < n ? code.charCodeAt(j + 1) : -1;
      if (d === LF || d === CR) return j + 1;
      j += 2;
      continue;
    }
    if (c === LBRACKET) inClass = true;
    else if (c === RBRACKET) inClass = false;
    else if (c === SLASH && !inClass) {
      j++;
      while (j < n && isIdPart(code.charCodeAt(j))) j++;
      return j;
    }
    j++;
  }
  return Math.min(j, n);
}

/** Scans a numeric literal at `i`. */
function number(code: string, i: number): number {
  const n = code.length;
  let j = i;
  const c1 = j + 1 < n ? lower(code.charCodeAt(j + 1)) : -1;
  if (code.charCodeAt(j) === 48 && (c1 === 120 || c1 === 98 || c1 === 111)) {
    j += 2;
    while (j < n && isIdPart(code.charCodeAt(j))) j++;
    return j;
  }
  while (j < n && (isDigit(code.charCodeAt(j)) || code.charCodeAt(j) === 95))
    j++;
  if (j < n && code.charCodeAt(j) === DOT) {
    j++;
    while (j < n && (isDigit(code.charCodeAt(j)) || code.charCodeAt(j) === 95))
      j++;
  }
  if (j < n && lower(code.charCodeAt(j)) === 101) {
    let k = j + 1;
    const s = k < n ? code.charCodeAt(k) : -1;
    if (s === PLUS || s === MINUS) k++;
    if (k < n && isDigit(code.charCodeAt(k))) {
      while (k < n && isDigit(code.charCodeAt(k))) k++;
      j = k;
    }
  }
  if (j < n && code.charCodeAt(j) === 110) j++; // BigInt `n`
  return j;
}
