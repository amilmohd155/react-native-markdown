import { pythonTokenizer } from '../tokenizers/python';
import type { SyntaxTokenType, Token } from '../types';
import { tokensMatchInput } from '../validate';

const tok = (code: string): readonly Token[] => pythonTokenizer(code, 'python');

const perChar = (tokens: readonly Token[]): SyntaxTokenType[] =>
  tokens.flatMap((t) => Array.from({ length: t.text.length }, () => t.type));

/** The type of the first occurrence of `text` in `code`, or 'mixed'. */
const typeOf = (code: string, text: string): SyntaxTokenType | 'mixed' => {
  const at = code.indexOf(text);
  const types = new Set(perChar(tok(code)).slice(at, at + text.length));
  const [only] = types;
  return at === -1 || types.size !== 1 || !only ? 'mixed' : only;
};

function expectInvariants(code: string): void {
  const tokens = tok(code);
  expect(tokensMatchInput(tokens, code)).toBe(true);
  tokens.forEach((t, k) => {
    expect(t.text).not.toBe('');
    if (k > 0) expect(t.type).not.toBe(tokens[k - 1]?.type);
  });
}

function expectTruncation(code: string): void {
  const full = perChar(tok(code));
  for (let k = 0; k <= code.length; k++) {
    if (k !== code.length && code[k] !== '\n' && code[k - 1] !== '\n') continue;
    expect(perChar(tok(code.slice(0, k)))).toEqual(full.slice(0, k));
  }
}

/** Park-Miller PRNG: deterministic garbage per seed. */
function seeded(seed: number): () => number {
  let a = seed % 2147483647 || 1;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

const ALPHABET = [
  ...`'"{}()[]\\#\n@=:!.,* \t`.split(''),
  '"""',
  "'''",
  'f"',
  "rb'",
  'f"""',
  'def',
  'class',
  'self',
  'x',
  'match',
  '1.5e3',
  '0x',
  '\uD800',
  'é',
  '\r\n',
];

const SAMPLE = `import os
from typing import Optional

MAX_SIZE = 1_000

@dataclass(frozen=True)
class User(Base):
    """A user.

    Spans lines."""
    name: str
    age: Optional[int] = None

    @property
    def greeting(self) -> str:
        # say hi
        return f"Hello, {self.name!r:>{width}}! {{braces}} {len(self.name)}"

    async def load(cls, path=r'C:\\tmp', *args, **kw):
        data = await cls.fetch(path) or b"\\x00"
        if data is not None and 0x1F > 3.5e-2:
            print(sorted(data), sep='')
        match data:
            case [x, *_]:
                pass
`;

describe('pythonTokenizer', () => {
  it('returns [] for empty input', () => {
    expect(tok('')).toEqual([]);
  });

  it('keeps the invariants on a representative module', () => {
    expectInvariants(SAMPLE);
    expectTruncation(SAMPLE);
  });

  it('classifies names by role', () => {
    expect(typeOf(SAMPLE, 'import')).toBe('keyword');
    expect(typeOf(SAMPLE, 'MAX_SIZE')).toBe('constant');
    expect(typeOf(SAMPLE, '1_000')).toBe('number');
    expect(typeOf(SAMPLE, '@dataclass')).toBe('function');
    expect(typeOf(SAMPLE, '@property')).toBe('function');
    expect(typeOf(SAMPLE, 'User')).toBe('type');
    expect(typeOf(SAMPLE, 'greeting')).toBe('function');
    expect(typeOf(SAMPLE, 'self')).toBe('constant');
    expect(typeOf(SAMPLE, 'str')).toBe('type');
    expect(typeOf(SAMPLE, 'None')).toBe('constant');
    expect(typeOf(SAMPLE, '# say hi')).toBe('comment');
    expect(typeOf(SAMPLE, 'fetch')).toBe('function');
    expect(typeOf(SAMPLE, 'print')).toBe('function');
    expect(typeOf(SAMPLE, 'sorted')).toBe('function');
    expect(typeOf(SAMPLE, '0x1F')).toBe('number');
    expect(typeOf(SAMPLE, '3.5e-2')).toBe('number');
    expect(typeOf(SAMPLE, '->')).toBe('operator');
    expect(typeOf(SAMPLE, 'match')).toBe('keyword');
    expect(typeOf(SAMPLE, 'case')).toBe('keyword');
    expect(typeOf('obj.attr', 'attr')).toBe('property');
    expect(typeOf('match = re.match(p)', 'match')).toBe('plain');
    expect(typeOf('a @ b', '@')).toBe('operator');
  });

  it('tokenizes strings with prefixes and triple quotes', () => {
    expect(typeOf(SAMPLE, '"""A user.\n\n    Spans lines."""')).toBe('string');
    expect(typeOf(SAMPLE, "r'C:\\tmp'")).toBe('string');
    expect(typeOf(SAMPLE, 'b"\\x00"')).toBe('string');
    expect(typeOf("x = 'it\\'s'\ny", "'it\\'s'")).toBe('string');
    expect(typeOf("x = 'open\ny = 1", 'y')).toBe('plain');
    expect(typeOf('x = """open\ny = 1', 'y = 1')).toBe('string');
  });

  it('splits f-string interpolations into code', () => {
    expect(tok('f"{x!r:>{w}} {{lit}}"')).toEqual([
      { type: 'string', text: 'f"' },
      { type: 'punctuation', text: '{' },
      { type: 'plain', text: 'x' },
      { type: 'operator', text: '!' },
      { type: 'plain', text: 'r' },
      { type: 'punctuation', text: ':' },
      { type: 'string', text: '>' },
      { type: 'punctuation', text: '{' },
      { type: 'plain', text: 'w' },
      { type: 'punctuation', text: '}}' },
      { type: 'string', text: ' {{lit}}"' },
    ]);
    expect(typeOf('f"{d[\'k\']}"', "'k'")).toBe('string');
    expect(typeOf('f"{ {1: 2}[1] }"', '2')).toBe('number');
    // An unclosed interpolation ends with the line.
    expect(typeOf('f"{x\ny = 1', 'y')).toBe('plain');
    expect(typeOf('f"""{x}\n{y}"""', 'y')).toBe('plain');
  });

  it('never throws on unterminated constructs', () => {
    for (const code of [
      '"""never closed\nstill string',
      "'''",
      'f"{',
      'f"{x:',
      'f"{x:{',
      'f"""{\n',
      'rb"',
      '@',
      '\\',
      ')))]]]}}}',
      '\uD800\uDC00\uD800',
      '0x',
      '1e',
    ]) {
      expectInvariants(code);
      expectTruncation(code);
    }
  });

  it('holds the invariants on seeded random garbage', () => {
    const rand = seeded(0x9e7);
    for (let run = 0; run < 300; run++) {
      let code = '';
      const length = 1 + Math.floor(rand() * 60);
      for (let k = 0; k < length; k++) {
        code += ALPHABET[Math.floor(rand() * ALPHABET.length)] ?? '';
      }
      expectInvariants(code);
      expectTruncation(code);
    }
  });

  it('is linear on large and pathological input', () => {
    const N = 100_000;
    for (const code of [
      SAMPLE.repeat(Math.ceil(N / SAMPLE.length)),
      'f"{'.repeat(N / 3),
      'f"""{'.repeat(N / 5),
      '"""'.repeat(N / 3),
      "'".repeat(N),
      '{'.repeat(N),
      'x'.repeat(N),
      '@a\n'.repeat(N / 3),
    ]) {
      const start = Date.now();
      const tokens = tok(code);
      expect(Date.now() - start).toBeLessThan(200);
      expect(tokensMatchInput(tokens, code)).toBe(true);
    }
  });
});
