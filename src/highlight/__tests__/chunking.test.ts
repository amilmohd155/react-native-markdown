import {
  chunkAll,
  createChunker,
  reconcile,
  runsOf,
  type Chunk,
} from '../chunking';
import { bashTokenizer } from '../tokenizers/bash';
import { diffTokenizer } from '../tokenizers/diff';
import { javascriptTokenizer } from '../tokenizers/javascript';
import { jsonTokenizer } from '../tokenizers/json';
import { pythonTokenizer } from '../tokenizers/python';
import type { SyntaxTokenType, Token, Tokenizer } from '../types';
import { tokensMatchInput } from '../validate';

// --- Test tokenizers -------------------------------------------------------

const KEYWORDS = new Set(['function', 'const', 'let', 'return', 'if', 'else']);

function wordType(word: string): SyntaxTokenType {
  if (KEYWORDS.has(word)) return 'keyword';
  if (/^\d/.test(word)) return 'number';
  return 'plain';
}

/**
 * Left-context-insensitive: every line is tokenized on its own (words,
 * numbers, whitespace, punctuation, `//` comments up to the newline).
 */
const lineTokenizer: Tokenizer = (code) => {
  const out: Token[] = [];
  const re = /\/\/[^\n]*|[A-Za-z_]\w*|\d+|\s+|[^\w\s]/g;
  for (const m of code.matchAll(re)) {
    const text = m[0];
    const type: SyntaxTokenType = text.startsWith('//')
      ? 'comment'
      : /^\s/.test(text)
        ? 'plain'
        : /^\w/.test(text)
          ? wordType(text)
          : 'punctuation';
    out.push({ type, text });
  }
  return out;
};

/**
 * Left-context-sensitive, like the real ones: multi-line block comments and
 * template strings, and an identifier after the keyword `function` is a
 * function name (by the previous significant token, across lines).
 */
const contextTokenizer: Tokenizer = (code) => {
  const out: Token[] = [];
  const re =
    /\/\*[\s\S]*?(?:\*\/|$)|`[^`]*(?:`|$)|"[^"\n]*"?|\/\/[^\n]*|[A-Za-z_]\w*|\d+|\s+|[^\w\s]/g;
  let previous = '';
  for (const m of code.matchAll(re)) {
    const text = m[0];
    let type: SyntaxTokenType;
    if (text.startsWith('/*') || text.startsWith('//')) type = 'comment';
    else if (text.startsWith('`') || text.startsWith('"')) type = 'string';
    else if (/^\s/.test(text)) type = 'plain';
    else if (/^\w/.test(text)) {
      type = previous === 'function' ? 'function' : wordType(text);
    } else type = 'punctuation';
    out.push({ type, text });
    if (type !== 'plain' && type !== 'comment') previous = text;
  }
  return out;
};

/** Wraps a tokenizer, counting the characters it is given. */
function counting(tokenize: Tokenizer) {
  const stats = { chars: 0, calls: 0 };
  const wrapped: Tokenizer = (code, language) => {
    stats.chars += code.length;
    stats.calls++;
    return tokenize(code, language);
  };
  return { tokenize: wrapped, stats };
}

/** Seeded PRNG (Park-Miller), in [0, 1). */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

// --- Fixtures ----------------------------------------------------------------

const SNIPPET = [
  '/**',
  ' * Adds two numbers.',
  ' * Multi-line block comment.',
  ' */',
  'function add(a, b) {',
  '  return a + b; // sum',
  '}',
  '',
  'const total = add(1, 2);',
  'const label = `total:',
  '  ${total}`;',
  'function',
  '',
  'named() {',
  '  if (total > 2) {',
  '    let s = "a string";',
  '  } else {',
  '    return 42;',
  '  }',
  '}',
  '',
].join('\n');

/** Code with blank-line runs of 0 to 3 lines between lines, deterministic. */
function blankLinesEverywhere(size: number): string {
  const r = prng(7);
  let out = '';
  for (let i = 0; out.length < size; i++) {
    out += `let v${i} = ${i};\n` + '\n'.repeat(Math.floor(r() * 4));
  }
  return out;
}

/** About `size` characters of JS-like code, lines of typical length. */
function jsLike(size: number): string {
  let out = '';
  while (out.length < size) out += SNIPPET;
  return out.slice(0, size);
}

const CASES: Record<string, string> = {
  empty: '',
  oneLine: 'const a = 1;',
  trailingNewline: 'a\nb\n',
  noTrailingNewline: 'a\nb\nc',
  blankLines: '\n\n\n\nx\n\n',
  crlf: 'let a = 1;\r\nlet b = 2;\r\n\r\nfunction\r\nf() {}\r\nend',
  snippet: SNIPPET,
  unclosedComment: 'a\n/* open\ncomment\nnever\nclosed',
  big: jsLike(1200),
  blankSecond: 'a\n\nb',
  blankRun: 'a\n\n\n\nb\nc',
  whitespaceLines: 'a\n   \n\t\nb\nc\n',
  blankFirst: '\n\nx\ny\n',
  crlfBlanks: 'a\r\n\r\n\r\nb\r\nc\r\n\r\nd',
  blankTail: 'x\ny\n\n\n',
  onlyBlank: '\n\n\n',
  blankInComment: 'a\n/* x\n\n*/\n\nb\nc',
  blanky: blankLinesEverywhere(600),
};

// --- Helpers ---------------------------------------------------------------

const join = (chunks: readonly Chunk[]) => chunks.map((c) => c.text).join('');

const shape = (chunks: readonly Chunk[]) =>
  chunks.map(({ id, text, tokens, frozen, invalid }) => ({
    id,
    text,
    tokens,
    frozen,
    invalid,
  }));

/** Feeds `code` in prefixes of the given sizes; returns every flush. */
function stream(
  code: string,
  tokenize: Tokenizer,
  sizes: () => number
): { prefixes: string[]; results: (readonly Chunk[])[] } {
  const chunker = createChunker(tokenize, 'js');
  const prefixes: string[] = [];
  const results: (readonly Chunk[])[] = [];
  let at = 0;
  while (at < code.length) {
    at = Math.min(code.length, at + Math.max(1, sizes()));
    const prefix = code.slice(0, at);
    prefixes.push(prefix);
    results.push(chunker.update(prefix));
  }
  return { prefixes, results };
}

function merge(tokens: readonly Token[]): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    const top = out[out.length - 1];
    if (t.text === '') continue;
    if (top && top.type === t.type) {
      out[out.length - 1] = { type: t.type, text: top.text + t.text };
    } else out.push({ type: t.type, text: t.text });
  }
  return out;
}

const SIZES: Record<string, () => number> = {
  '1 char': () => 1,
  '7 chars': () => 7,
  '40 chars': () => 40,
  'random': (() => {
    const r = prng(42);
    return () => 1 + Math.floor(r() * 60);
  })(),
};

// --- Tests -------------------------------------------------------------------

describe('chunkAll', () => {
  it.each(Object.entries(CASES))(
    '%s: chunk texts join to the input',
    (_, code) => {
      for (const tokenize of [lineTokenizer, contextTokenizer]) {
        const chunks = chunkAll(code, tokenize, 'js');
        expect(join(chunks)).toBe(code);
        for (const chunk of chunks) {
          expect(tokensMatchInput(chunk.tokens, chunk.text)).toBe(true);
          expect(chunk.invalid).toBe(false);
          expect(chunk.text).not.toBe('');
        }
        chunks.forEach((c, i) => expect(c.id).toBe(i));
      }
    }
  );

  it('empty input gives no chunks', () => {
    expect(chunkAll('', lineTokenizer, 'js')).toEqual([]);
  });

  it('chunks hold two lines; complete committed pairs are frozen', () => {
    const chunks = chunkAll('a\nb\nc\nd\ne', lineTokenizer, 'js');
    expect(chunks.map((c) => [c.text, c.frozen])).toEqual([
      ['a\nb\n', true],
      ['c\nd\n', true],
      ['e', false],
    ]);
    // A final newline: the last pair stays live until the next line begins.
    expect(
      chunkAll('a\nb\n', lineTokenizer, 'js').map((c) => c.frozen)
    ).toEqual([false]);
  });

  it.each(Object.entries(CASES))(
    '%s: no chunk but the last ends in a blank line',
    (_, code) => {
      const chunks = chunkAll(code, lineTokenizer, 'js');
      for (const chunk of chunks.slice(0, -1)) {
        expect(chunk.text.endsWith('\n')).toBe(true);
        const lines = chunk.text.slice(0, -1).split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines[lines.length - 1]!.trim()).not.toBe('');
      }
    }
  );

  it('extends a chunk past blank lines to the next non-blank line', () => {
    const texts = (code: string) =>
      chunkAll(code, lineTokenizer, 'js').map((c) => c.text);
    expect(texts('a\n\nb\nc\nd')).toEqual(['a\n\nb\n', 'c\nd']);
    expect(texts('a\nb\n\n\n\nc\nd\ne')).toEqual([
      'a\nb\n',
      '\n\n\nc\n',
      'd\ne',
    ]);
    expect(texts('a\n \n\t\r\nb\nc')).toEqual(['a\n \n\t\r\nb\n', 'c']);
    // A blank first line is fine: the chunk ends on its 2nd line.
    expect(texts('\nx\ny\nz')).toEqual(['\nx\n', 'y\nz']);
    // CRLF: a lone `\r` is blank.
    expect(texts('a\r\n\r\nb\r\nc')).toEqual(['a\r\n\r\nb\r\n', 'c']);
    // Blank lines at the end stay in the last chunk.
    expect(texts('a\nb\nc\n\n\n')).toEqual(['a\nb\n', 'c\n\n\n']);
    expect(texts('a\nb\n\n\n')).toEqual(['a\nb\n', '\n\n']);
    expect(texts('\n\n\n')).toEqual(['\n\n\n']);
  });

  it('freezes a chunk only after its non-blank last line and the next began', () => {
    const frozen = (code: string) =>
      chunkAll(code, lineTokenizer, 'js').map((c) => [c.text, c.frozen]);
    // Ends in a blank line: live, it may grow.
    expect(frozen('a\nb\n\n')).toEqual([
      ['a\nb\n', true],
      ['\n', false],
    ]);
    expect(frozen('a\n\n')).toEqual([['a\n\n', false]]);
    expect(frozen('a\n\nb')).toEqual([['a\n\nb', false]]);
    // Its last line complete, but the next has not begun.
    expect(frozen('a\n\nb\n')).toEqual([['a\n\nb\n', false]]);
    expect(frozen('a\n\nb\nc')).toEqual([
      ['a\n\nb\n', true],
      ['c', false],
    ]);
  });

  it('merges adjacent tokens of the same type within a chunk', () => {
    const [chunk] = chunkAll('a b c', lineTokenizer, 'js');
    expect(chunk!.tokens).toEqual([{ type: 'plain', text: 'a b c' }]);
  });

  it('matches a whole-text tokenize when the context fits the window', () => {
    for (const code of [SNIPPET, CASES.crlf!, CASES.big!]) {
      const tokens = chunkAll(code, contextTokenizer, 'js').flatMap(
        (c) => c.tokens
      );
      expect(merge(tokens)).toEqual(merge(contextTokenizer(code, 'js')));
    }
  });

  it('a multi-line comment does not freeze until it ends', () => {
    const chunks = chunkAll(CASES.unclosedComment!, contextTokenizer, 'js');
    expect(chunks.every((c) => !c.frozen)).toBe(true);
    expect(chunks.map((c) => c.text)).toEqual([
      'a\n/* open\n',
      'comment\nnever\n',
      'closed',
    ]);
  });

  it('a 100 KB single line is one chunk and one tokenizer call', () => {
    const line = 'x = 1; '.repeat(15_000);
    const { tokenize, stats } = counting(contextTokenizer);
    const chunks = chunkAll(line, tokenize, 'js');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(line);
    expect(stats).toEqual({ chars: line.length, calls: 1 });
  });
});

describe('incremental equals chunkAll', () => {
  describe.each(Object.entries(SIZES))('flushes of %s', (_, sizes) => {
    it.each(Object.entries(CASES).filter(([, c]) => c !== ''))(
      '%s: at every flush (left-context-insensitive tokenizer)',
      (_name, code) => {
        const { prefixes, results } = stream(code, lineTokenizer, sizes);
        prefixes.forEach((prefix, i) => {
          expect(shape(results[i]!)).toEqual(
            shape(chunkAll(prefix, lineTokenizer, 'js'))
          );
        });
      }
    );

    it.each(Object.entries(CASES).filter(([, c]) => c !== ''))(
      '%s: at every flush and at close (left-context-sensitive tokenizer)',
      (_name, code) => {
        const { prefixes, results } = stream(code, contextTokenizer, sizes);
        // Context fits the window in these fixtures, so every flush matches.
        prefixes.forEach((prefix, i) => {
          expect(join(results[i]!)).toBe(prefix);
          expect(shape(results[i]!)).toEqual(
            shape(chunkAll(prefix, contextTokenizer, 'js'))
          );
        });
      }
    );
  });

  it('a CR at the end of one flush and its LF in the next', () => {
    const chunker = createChunker(lineTokenizer, 'js');
    chunker.update('a\r');
    chunker.update('a\r\nb\r');
    const out = chunker.update('a\r\nb\r\nc');
    expect(shape(out)).toEqual(
      shape(chunkAll('a\r\nb\r\nc', lineTokenizer, 'js'))
    );
    expect(out[0]).toMatchObject({ text: 'a\r\nb\r\n', frozen: true });
  });
});

describe('identity', () => {
  it('frozen chunks keep their object across updates', () => {
    const code = jsLike(4000);
    const chunker = createChunker(contextTokenizer, 'js');
    const seen = new Map<number, Chunk>();
    for (let at = 1; at <= code.length; at += 13) {
      const out = chunker.update(code.slice(0, at));
      for (const chunk of out) {
        const before = seen.get(chunk.id);
        if (before?.frozen) expect(chunk).toBe(before);
        seen.set(chunk.id, chunk);
      }
      // Frozen chunks are a prefix (a comment or template can hold more).
      const live = out.findIndex((c) => !c.frozen);
      expect(
        out.slice(live === -1 ? out.length : live).some((c) => c.frozen)
      ).toBe(false);
    }
  });

  it('frozen chunks keep their object across blank-line runs', () => {
    const code = CASES.blanky!;
    for (const step of [1, 3, 17]) {
      const chunker = createChunker(contextTokenizer, 'js');
      const seen = new Map<number, Chunk>();
      for (let at = 1; at <= code.length; at += step) {
        const out = chunker.update(code.slice(0, at));
        for (const chunk of out) {
          const before = seen.get(chunk.id);
          if (before?.frozen) expect(chunk).toBe(before);
          seen.set(chunk.id, chunk);
        }
      }
      const closed = chunker.finish(code);
      expect(shape(closed)).toEqual(
        shape(chunkAll(code, contextTokenizer, 'js'))
      );
    }
  });

  it('the same code returns the same array', () => {
    const chunker = createChunker(lineTokenizer, 'js');
    const a = chunker.update('a\nb\nc');
    expect(chunker.update('a\nb\nc')).toBe(a);
  });

  it('an unchanged live chunk keeps its object', () => {
    const chunker = createChunker(contextTokenizer, 'js');
    const a = chunker.update('x\n/* a\nb\nc\nd');
    const b = chunker.update('x\n/* a\nb\nc\nd e');
    expect(b[0]).toBe(a[0]);
    expect(b[0]!.frozen).toBe(false);
  });

  it('a non-prefix change keeps the frozen chunks before it', () => {
    const chunker = createChunker(lineTokenizer, 'js');
    const a = chunker.update('a\nb\nc\nd\ne\nf\n``');
    const b = chunker.update('a\nb\nc\nd\ne\nf\n');
    expect(b[0]).toBe(a[0]);
    expect(b[1]).toBe(a[1]);
    expect(shape(b)).toEqual(
      shape(chunkAll('a\nb\nc\nd\ne\nf\n', lineTokenizer, 'js'))
    );
    // A change at the start redoes everything.
    const c = chunker.update('Z\nb\nc\nd\ne\nf\n');
    expect(c[0]).not.toBe(a[0]);
    expect(shape(c)).toEqual(
      shape(chunkAll('Z\nb\nc\nd\ne\nf\n', lineTokenizer, 'js'))
    );
  });

  it('a non-prefix change inside a frozen comment redoes it correctly', () => {
    const chunker = createChunker(contextTokenizer, 'js');
    const code = 'a\n/* b\nc\nd */\ne\nf\ng\nh\n';
    chunker.update(code + 'i');
    const changed = code.replace('d */', 'X */');
    expect(shape(chunker.update(changed))).toEqual(
      shape(chunkAll(changed, contextTokenizer, 'js'))
    );
  });

  it('reset starts from scratch', () => {
    const chunker = createChunker(lineTokenizer, 'js');
    const a = chunker.update('a\nb\nc');
    chunker.reset();
    const b = chunker.update('a\nb\nc');
    expect(b).not.toBe(a);
    expect(shape(b)).toEqual(shape(a));
  });
});

describe('reconcile', () => {
  const chunk = (id: number, text: string, type: SyntaxTokenType): Chunk => ({
    id,
    text,
    tokens: [{ type, text }],
    frozen: false,
    invalid: false,
  });

  it('keeps unchanged chunks, replaces changed ones', () => {
    const previous = [chunk(0, 'a\n', 'plain'), chunk(1, 'b\n', 'plain')];
    const next = [chunk(0, 'a\n', 'plain'), chunk(1, 'b\n', 'property')];
    const out = reconcile(previous, next);
    expect(out[0]).toBe(previous[0]);
    expect(out[1]).toBe(next[1]);
  });

  it('returns the previous array when nothing changed', () => {
    const previous = [chunk(0, 'a\n', 'plain'), chunk(1, 'b', 'keyword')];
    const next = previous.map((c) => ({ ...c, tokens: [...c.tokens] }));
    expect(reconcile(previous, next)).toBe(previous);
  });

  it('compares frozen and invalid too', () => {
    const previous = [chunk(0, 'a', 'plain'), chunk(1, 'b', 'plain')];
    const next = [
      { ...chunk(0, 'a', 'plain'), frozen: true },
      { ...chunk(1, 'b', 'plain'), invalid: true },
    ];
    const out = reconcile(previous, next);
    expect(out[0]).toBe(next[0]);
    expect(out[1]).toBe(next[1]);
  });

  it('handles length changes', () => {
    const a = chunk(0, 'a\n', 'plain');
    const b = chunk(1, 'b\n', 'plain');
    const c = chunk(2, 'c', 'plain');
    const longer = reconcile([a], [{ ...a }, b, c]);
    expect(longer).toEqual([a, b, c]);
    expect(longer[0]).toBe(a);
    const shorter = reconcile([a, b, c], [{ ...a }, { ...b }]);
    expect(shorter).toHaveLength(2);
    expect(shorter[0]).toBe(a);
    expect(shorter[1]).toBe(b);
    expect(reconcile([], [a])).toEqual([a]);
  });
});

describe('finish', () => {
  // Line by line, the member keys after the first get one line of left
  // context and miss the interface brace; a full pass sees it.
  const INTERFACE = [
    'export interface A {',
    '  readonly id: number;',
    '  name: string;',
    '  tags: readonly string[];',
    '}',
    '',
  ].join('\n');
  const ts = (code: string) => javascriptTokenizer(code, 'typescript');

  const streamed = (code: string, tokenize: Tokenizer) => {
    const chunker = createChunker(tokenize, 'ts');
    const lines = code.split(/(?<=\n)/);
    let out: readonly Chunk[] = [];
    for (let i = 1; i <= lines.length; i++) {
      out = chunker.update(lines.slice(0, i).join(''));
    }
    return { chunker, out };
  };

  it('equals chunkAll, reusing every unchanged chunk', () => {
    const { chunker, out } = streamed(INTERFACE, ts);
    const full = chunkAll(INTERFACE, ts, 'ts');
    // The bug it fixes: streaming alone differs from the full pass.
    expect(shape(out)).not.toEqual(shape(full));
    const done = chunker.finish(INTERFACE);
    expect(shape(done)).toEqual(shape(full));
    done.forEach((c, i) => {
      if (i === 1) expect(c).not.toBe(out[i]);
      else expect(c).toBe(out[i]);
    });
  });

  it('tokenizes once, then is idempotent', () => {
    const { tokenize, stats } = counting(lineTokenizer);
    const code = 'a\nb\nc\nd\ne';
    const { chunker, out } = streamed(code, tokenize);
    stats.calls = 0;
    stats.chars = 0;
    const done = chunker.finish(code);
    // Same tokens: the previous array itself.
    expect(done).toBe(out);
    expect(stats).toEqual({ calls: 1, chars: code.length });
    expect(chunker.finish(code)).toBe(done);
    expect(chunker.update(code)).toBe(done);
    expect(stats.calls).toBe(1);
  });

  it('on a fresh chunker is chunkAll', () => {
    const chunker = createChunker(contextTokenizer, 'js');
    const code = jsLike(2000);
    expect(shape(chunker.finish(code))).toEqual(
      shape(chunkAll(code, contextTokenizer, 'js'))
    );
  });

  it('keeps working after: growth and non-prefix changes', () => {
    const chunker = createChunker(contextTokenizer, 'js');
    const code = jsLike(1000);
    const done = chunker.finish(code);
    const grown = chunker.update(code + 'let z = 1;\n');
    expect(grown[0]).toBe(done[0]);
    expect(shape(grown)).toEqual(
      shape(chunkAll(code + 'let z = 1;\n', contextTokenizer, 'js'))
    );
    const changed = 'Q' + code.slice(1);
    expect(shape(chunker.finish(changed))).toEqual(
      shape(chunkAll(changed, contextTokenizer, 'js'))
    );
  });

  it('keeps the plain fallback of a broken tokenizer', () => {
    const broken: Tokenizer = () => {
      throw new Error('boom');
    };
    const { chunker } = streamed('a\nb\nc\n', broken);
    const done = chunker.finish('a\nb\nc\n');
    expect(done.every((c) => c.invalid)).toBe(true);
    expect(shape(done)).toEqual(shape(chunkAll('a\nb\nc\n', broken, 'ts')));
  });
});

describe('work bound', () => {
  it('a 20 KB stream in 40-char flushes tokenizes < 3x its length', () => {
    const code = jsLike(20_000);
    const { tokenize, stats } = counting(contextTokenizer);
    stream(code, tokenize, () => 40);
    // Measured about 1.75x (one context line plus the open line per flush).
    expect(stats.chars / code.length).toBeLessThan(3);
  });

  it('stays < 3x with lines of about 40 characters (uneven lengths)', () => {
    const r = prng(7);
    let code = '';
    while (code.length < 20_000) {
      const pad = ' '.repeat(Math.floor(r() * 20));
      code += `  const v = compute(a, b);${pad}// n\n`;
    }
    const { tokenize, stats } = counting(contextTokenizer);
    stream(code, tokenize, () => 40);
    // Measured about 2.57x at 41-char lines (~3.2x at 57): cost per flush is
    // about 1 + 1.5 * lineLength / flushSize of the new text.
    expect(stats.chars / code.length).toBeLessThan(3);
  });

  it('a 100 KB single line in a few large flushes stays linear', () => {
    const line = 'x = 1; '.repeat(15_000);
    const { tokenize, stats } = counting(contextTokenizer);
    stream(line, tokenize, () => 25_000);
    // Re-tokenizing the open line is inherent; 5 flushes: 25+50+75+100+105.
    expect(stats.chars).toBeLessThan(line.length * 4);
  });
});

describe('a broken tokenizer', () => {
  const throwing: Tokenizer = () => {
    throw new Error('boom');
  };
  const lossy: Tokenizer = (code) => [{ type: 'keyword', text: code.slice(1) }];

  it.each([
    ['throws', throwing],
    ['drops text', lossy],
  ])('that %s gives plain, invalid chunks and never throws', (_, tokenize) => {
    const code = 'a\nb\nc\nd\ne';
    const once = chunkAll(code, tokenize, 'js');
    expect(join(once)).toBe(code);
    for (const chunk of once) {
      expect(chunk.invalid).toBe(true);
      expect(chunk.tokens).toEqual([{ type: 'plain', text: chunk.text }]);
    }
    const { results } = stream(code, tokenize, () => 1);
    expect(shape(results[results.length - 1]!)).toEqual(shape(once));
  });

  describe('in production (__DEV__ false)', () => {
    const g = globalThis as { __DEV__?: unknown };
    let saved: unknown;
    beforeEach(() => {
      saved = g.__DEV__;
      g.__DEV__ = false;
    });
    afterEach(() => {
      g.__DEV__ = saved;
    });

    it('skips the join check', () => {
      const chunks = chunkAll('a\nb', lossy, 'js');
      expect(chunks.every((c) => !c.invalid)).toBe(true);
    });

    it('still catches a throw', () => {
      const code = 'a\nb\nc';
      const chunks = chunkAll(code, throwing, 'js');
      expect(chunks.every((c) => c.invalid)).toBe(true);
      expect(join(chunks)).toBe(code);
    });
  });

  it('only marks the chunks it broke', () => {
    let calls = 0;
    const flaky: Tokenizer = (code, language) => {
      calls++;
      if (calls === 2) throw new Error('once');
      return lineTokenizer(code, language);
    };
    const chunker = createChunker(flaky, 'js');
    chunker.update('a\nb\nc');
    const out = chunker.update('a\nb\nc\nd\ne\nf');
    expect(out.map((c) => c.invalid)).toEqual([false, true, true]);
    expect(join(out)).toBe('a\nb\nc\nd\ne\nf');
  });
});

describe('runsOf', () => {
  const colors: Partial<Record<SyntaxTokenType, string>> = {
    keyword: 'red',
    punctuation: 'red',
    number: 'blue',
  };
  const colorOf = (type: SyntaxTokenType) => colors[type] ?? 'ink';

  it('without colours returns the tokens', () => {
    const [chunk] = chunkAll('let a = 1;', lineTokenizer, 'js');
    expect(runsOf(chunk!)).toEqual(chunk!.tokens);
  });

  it('merges same-colour tokens and folds whitespace in', () => {
    const [chunk] = chunkAll('  let = 1 ;', lineTokenizer, 'js');
    expect(runsOf(chunk!, colorOf)).toEqual([
      { type: 'keyword', text: '  let = ' },
      { type: 'number', text: '1 ' },
      { type: 'punctuation', text: ';' },
    ]);
    const [blank] = chunkAll('   ', lineTokenizer, 'js');
    expect(runsOf(blank!, colorOf)).toEqual([{ type: 'plain', text: '   ' }]);
  });

  it('is cached per chunk and colour function', () => {
    const [chunk] = chunkAll('let a = 1;', lineTokenizer, 'js');
    expect(runsOf(chunk!, colorOf)).toBe(runsOf(chunk!, colorOf));
    const runs = runsOf(chunk!, colorOf);
    expect(runs.map((r) => r.text).join('')).toBe(chunk!.text);
  });
});

describe('built-in tokenizers (may be stubs)', () => {
  const builtIns: [string, Tokenizer, string][] = [
    ['javascript', javascriptTokenizer, 'javascript'],
    ['json', jsonTokenizer, 'json'],
    ['bash', bashTokenizer, 'bash'],
    ['diff', diffTokenizer, 'diff'],
    ['python', pythonTokenizer, 'python'],
  ];
  const samples: Record<string, string> = {
    javascript: 'function f(a) {\n  return a + 1;\n}\nconst x = f(2);\n',
    json: '{\n  "a": 1,\n  "b": [true, null]\n}\n',
    bash: 'echo "hi"\nls -la # list\nexport A=1\n',
    diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n',
    python: 'def f(a):\n    return a + 1\n\nprint(f(2))\n',
  };

  it.each(builtIns)(
    '%s: joins exactly, and incremental equals chunkAll at close',
    (name, tokenize, language) => {
      const code = samples[name]!.repeat(3);
      const once = chunkAll(code, tokenize, language);
      expect(join(once)).toBe(code);
      expect(once.every((c) => !c.invalid)).toBe(true);
      const chunker = createChunker(tokenize, language);
      for (let at = 1; at <= code.length; at += 5)
        chunker.update(code.slice(0, at));
      const closed = chunker.update(code);
      expect(join(closed)).toBe(code);
      expect(shape(closed)).toEqual(shape(once));
    }
  );
});
