import { diffTokenizer } from '../tokenizers/diff';
import type { SyntaxTokenType, Token } from '../types';
import { tokensMatchInput } from '../validate';

const tok = (code: string): readonly Token[] => diffTokenizer(code, 'diff');

const perChar = (tokens: readonly Token[]): SyntaxTokenType[] =>
  tokens.flatMap((t) => Array.from({ length: t.text.length }, () => t.type));

/** Lines with their newline kept. */
const lines = (code: string): string[] => code.match(/[^\n]*\n|[^\n]+$/g) ?? [];

function expectInvariants(code: string): void {
  const tokens = tok(code);
  expect(tokensMatchInput(tokens, code)).toBe(true);
  tokens.forEach((t, k) => {
    expect(t.text).not.toBe('');
    // A newline ends every token that holds one (never mid-token).
    expect(t.text.indexOf('\n')).toBeGreaterThanOrEqual(
      t.text.includes('\n') ? t.text.length - 1 : -1
    );
    // Same-type neighbours only across a line break.
    const before = tokens[k - 1];
    if (before && !before.text.endsWith('\n')) {
      expect(t.type).not.toBe(before.type);
    }
  });
  // Per-line tokenization equals whole-text tokenization exactly.
  expect(lines(code).flatMap((line) => tok(line))).toEqual(tok(code));
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
  '+',
  '-',
  '@',
  '@@',
  ' ',
  '\n',
  '\r\n',
  'x',
  '+++ ',
  '--- ',
  'diff ',
  'index ',
  '\\',
  '\uD800',
  'é',
];

const SAMPLE = `diff --git a/src/app.ts b/src/app.ts
index 3b18e51..a9c2f04 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@ export function main() {
 import { run } from './run';
-const port = 3000;
+const port = Number(process.env.PORT ?? 3000);
+const host = '0.0.0.0';
 run(port);
@@ -10 +11 @@
-old
\\ No newline at end of file
+new`;

describe('diffTokenizer', () => {
  it('returns [] for empty input', () => {
    expect(tok('')).toEqual([]);
  });

  it('classifies each kind of line', () => {
    expect(tok(SAMPLE)).toEqual([
      { type: 'comment', text: 'diff --git a/src/app.ts b/src/app.ts\n' },
      { type: 'comment', text: 'index 3b18e51..a9c2f04 100644\n' },
      { type: 'comment', text: '--- a/src/app.ts\n' },
      { type: 'comment', text: '+++ b/src/app.ts\n' },
      { type: 'function', text: '@@ -1,4 +1,5 @@' },
      { type: 'plain', text: ' export function main() {\n' },
      { type: 'plain', text: " import { run } from './run';\n" },
      { type: 'deleted', text: '-const port = 3000;\n' },
      {
        type: 'inserted',
        text: '+const port = Number(process.env.PORT ?? 3000);\n',
      },
      { type: 'inserted', text: "+const host = '0.0.0.0';\n" },
      { type: 'plain', text: ' run(port);\n' },
      { type: 'function', text: '@@ -10 +11 @@\n' },
      { type: 'deleted', text: '-old\n' },
      { type: 'comment', text: '\\ No newline at end of file\n' },
      { type: 'inserted', text: '+new' },
    ]);
  });

  it('keeps the invariants, including per-line equals whole-text', () => {
    expectInvariants(SAMPLE);
    expectTruncation(SAMPLE);
    const crlf = SAMPLE.replace(/\n/g, '\r\n');
    expectInvariants(crlf);
    expectTruncation(crlf);
    expect(tok('@@ -1 +1 @@\r\n')).toEqual([
      { type: 'function', text: '@@ -1 +1 @@\r\n' },
    ]);
  });

  it('handles odd lines without throwing', () => {
    for (const code of [
      '@@',
      '@@ no close\n',
      '+',
      '-',
      '\n\n',
      '+++',
      '---\n',
      '\uD800',
    ]) {
      expectInvariants(code);
      expectTruncation(code);
    }
    expect(tok('---\n')).toEqual([{ type: 'deleted', text: '---\n' }]);
  });

  it('holds the invariants on seeded random garbage', () => {
    const rand = seeded(0xd1ff);
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
      '@@\n'.repeat(N / 3),
      '@@'.repeat(N / 2),
      '+'.repeat(N),
    ]) {
      const start = Date.now();
      const tokens = tok(code);
      expect(Date.now() - start).toBeLessThan(200);
      expect(tokensMatchInput(tokens, code)).toBe(true);
    }
  });
});
