import { chunkAll, createChunker } from '../chunking';
import { jsonTokenizer } from '../tokenizers/json';
import type { SyntaxTokenType, Token } from '../types';
import { tokensMatchInput } from '../validate';

// Helpers (duplicated in javascript.test.ts so each suite stands alone).

/** Concatenates to `code`, no empty tokens, no adjacent tokens of one type. */
function expectInvariants(tokens: readonly Token[], code: string): void {
  expect(tokensMatchInput(tokens, code)).toBe(true);
  for (let i = 0; i < tokens.length; i++) {
    expect((tokens[i] as Token).text).not.toBe('');
    if (i > 0)
      expect((tokens[i] as Token).type).not.toBe((tokens[i - 1] as Token).type);
  }
}

/**
 * For every line boundary k, the tokens of `code.slice(0, k)` equal those of
 * `code` except the last, which may only grow (same type, longer text).
 */
function expectPrefixStable(
  tokenize: (code: string) => readonly Token[],
  code: string
): void {
  const full = tokenize(code);
  const cuts: number[] = [];
  for (let k = 0; k < code.length; k++) {
    if (code[k] === '\n') cuts.push(k, k + 1);
  }
  for (const k of cuts) {
    const prefix = tokenize(code.slice(0, k));
    const last = prefix.length - 1;
    expect(prefix.slice(0, last)).toEqual(full.slice(0, last));
    if (last >= 0) {
      const whole = full[last] as Token;
      expect(whole.type).toBe((prefix[last] as Token).type);
      expect(whole.text.startsWith((prefix[last] as Token).text)).toBe(true);
    }
  }
}

/** Deterministic PRNG (Park-Miller). */
function seededRandom(seed: number): () => number {
  let a = seed % 2147483647 || 1;
  return () => {
    a = (a * 48271) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

const json = (code: string): readonly Token[] => jsonTokenizer(code, 'json');

/** The type of the token covering the first occurrence of `text` in `code`. */
function typeAt(
  tokens: readonly Token[],
  code: string,
  text: string
): SyntaxTokenType | undefined {
  const at = code.indexOf(text);
  if (at === -1) throw new Error(`"${text}" not in sample`);
  let offset = 0;
  for (const t of tokens) {
    if (at >= offset && at < offset + t.text.length) return t.type;
    offset += t.text.length;
  }
  return undefined;
}

const PACKAGE = `{
  "name": "@docren/react-native-markdown",
  "version": "1.0.0-rc.1",
  "private": false,
  "files": ["lib", "src"],
  "nested": { "deep": { "list": [1, -2.5, 3e10, { "k": null }] } },
  "escaped": "say \\"hi\\" \\\\",
  "empty": {},
  "arr": [[], [true, false]]
}
`;

const JSONC = `// settings.jsonc
{
  /* block
     comment */
  "editor.tabSize": 2, // trailing
  "files.exclude": {
    "**/node_modules": true,
  },
}
`;

const SAMPLES: readonly (readonly [string, string])[] = [
  ['package.json', PACKAGE],
  ['jsonc', JSONC],
  ['top-level array', '[\n  "a",\n  { "b": [ "c" ] }\n]\n'],
];

describe('jsonTokenizer: invariants', () => {
  it('returns [] for empty input', () => {
    expect(json('')).toEqual([]);
  });

  it.each(SAMPLES)('%s: concatenates, merges, no empty tokens', (_, code) => {
    expectInvariants(json(code), code);
  });

  it.each(SAMPLES)('%s: prefixes at line boundaries are stable', (_, code) => {
    expectPrefixStable(json, code);
  });

  it.each(SAMPLES)('%s: every prefix concatenates back', (_, code) => {
    for (let k = 0; k <= code.length; k++) {
      const prefix = code.slice(0, k);
      expect(tokensMatchInput(json(prefix), prefix)).toBe(true);
    }
  });

  it('survives malformed input', () => {
    for (const code of [
      '"open',
      '"a\\',
      '"a\\\nb"',
      '/* open',
      '}}]]{',
      ',,::',
      '-',
      '1e',
      '1.',
      'NaN Infinity undefined',
      "{'single': 1}",
      '𐀀 \uDBFF',
    ]) {
      expectInvariants(json(code), code);
    }
  });

  it('survives random garbage (seeded)', () => {
    const random = seededRandom(0x15);
    const alphabet = '{}[]:,"\\/*-+.eE019 \n\ttruefalsnl\uD800';
    for (let i = 0; i < 400; i++) {
      let code = '';
      const length = 1 + Math.floor(random() * 120);
      for (let j = 0; j < length; j++)
        code += alphabet[Math.floor(random() * alphabet.length)];
      expectInvariants(json(code), code);
    }
  });

  it('tokenizes 100 KB in under 200 ms', () => {
    let big = '[';
    while (big.length < 100_000) big += PACKAGE + ',';
    big += ']';
    const started = Date.now();
    const tokens = json(big);
    expect(Date.now() - started).toBeLessThan(200);
    expect(tokensMatchInput(tokens, big)).toBe(true);
  });
});

describe('jsonTokenizer: classification', () => {
  const tokens = json(PACKAGE);
  const at = (text: string) => typeAt(tokens, PACKAGE, text);

  it('marks keys as properties and values as strings', () => {
    expect(at('"name"')).toBe('property');
    expect(at('"@docren')).toBe('string');
    expect(at('"deep"')).toBe('property');
    expect(at('"k"')).toBe('property');
    expect(at('"lib"')).toBe('string');
    expect(at('"say')).toBe('string');
    expect(at('"empty"')).toBe('property');
  });

  it('marks numbers, constants and punctuation', () => {
    expect(at('1,')).toBe('number');
    expect(at('-2.5')).toBe('number');
    expect(at('3e10')).toBe('number');
    expect(at('false,')).toBe('constant');
    expect(at('null')).toBe('constant');
    expect(at('true')).toBe('constant');
    expect(at('{')).toBe('punctuation');
    expect(at(':')).toBe('punctuation');
    expect(at('[[')).toBe('punctuation');
  });

  it('keeps escaped quotes inside the string', () => {
    const line = PACKAGE.split('\n').find((l) => l.includes('escaped')) ?? '';
    const value = line.slice(line.indexOf(': ') + 2, line.lastIndexOf(','));
    expect(json(line)).toContainEqual({ type: 'string', text: value });
  });

  it('marks jsonc comments and trailing commas', () => {
    const own = json(JSONC);
    const at2 = (text: string) => typeAt(own, JSONC, text);
    expect(at2('// settings')).toBe('comment');
    expect(at2('/* block')).toBe('comment');
    expect(at2('// trailing')).toBe('comment');
    expect(at2('"editor.tabSize"')).toBe('property');
    expect(at2('"files.exclude"')).toBe('property');
    expect(at2('"**/node_modules"')).toBe('property');
    expect(at2('2,')).toBe('number');
  });

  it('marks a key by the `:` after it on the same line, with no bracket state', () => {
    const props = (code: string) =>
      json(code)
        .filter((t) => t.type === 'property')
        .map((t) => t.text);
    expect(props('{ "a" : 1, "b"\t:2, "c" }')).toEqual(['"a"', '"b"']);
    expect(props('["x", "y", "z"]')).toEqual([]);
    expect(props('"a"\n: 1')).toEqual([]);
    expect(props('"a" /* c */ : 1')).toEqual([]);
    expect(props('{ bare: 1, "k": "v:" }')).toEqual(['bare', '"k"']);
    // Each line alone, as a chunker with one line of context sees it.
    expect(props('    "deep": {')).toEqual(['"deep"']);
    expect(props('  "b": [true, null],')).toEqual(['"b"']);
  });

  it('streams through the chunker like a one-shot tokenize', () => {
    const NESTED = `{
  "a": {
    "b": {
      "c": 1,
      "d": ["x", "y"],
      // note
      "e": { "f": null }
    },
    "g": "h"
  },
  "list": [
    { "k": true },
    "plain"
  ]
}
`;
    const shape = (chunks: ReturnType<typeof chunkAll>) =>
      chunks.map((c) => c.tokens.map((t) => [t.type, t.text]));
    for (const code of [PACKAGE, JSONC, NESTED]) {
      const once = chunkAll(code, jsonTokenizer, 'json');
      const chunker = createChunker(jsonTokenizer, 'json');
      for (let cut = 1; cut <= code.length; cut += 3)
        chunker.update(code.slice(0, cut));
      expect(shape(chunker.update(code))).toEqual(shape(once));
    }
    const keys = chunkAll(NESTED, jsonTokenizer, 'json')
      .flatMap((c) => c.tokens)
      .filter((t) => t.type === 'property')
      .map((t) => t.text);
    expect(keys).toEqual([
      '"a"',
      '"b"',
      '"c"',
      '"d"',
      '"e"',
      '"f"',
      '"g"',
      '"list"',
      '"k"',
    ]);
  });

  it('ends an unterminated string at the line break', () => {
    expect(json('"abc\n1')).toEqual([
      { type: 'string', text: '"abc' },
      { type: 'plain', text: '\n' },
      { type: 'number', text: '1' },
    ]);
  });
});
