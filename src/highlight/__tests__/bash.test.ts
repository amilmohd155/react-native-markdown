import { bashTokenizer } from '../tokenizers/bash';
import type { SyntaxTokenType, Token } from '../types';
import { tokensMatchInput } from '../validate';

const tok = (code: string): readonly Token[] => bashTokenizer(code, 'bash');

/** One type per UTF-16 unit. */
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

/** Tokens of every prefix cut at a line boundary agree with the full text. */
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
  ...`'"\`\${}()\\#\n<>=;|&!-: \t`.split(''),
  '$(',
  '${',
  '<<EOF',
  '<<-',
  'EOF\n',
  'echo',
  'if',
  'then',
  'fi',
  'x=',
  '--flag',
  '42',
  '\uD800',
  'é',
  '\r\n',
];

const garbage = (rand: () => number, length: number): string => {
  let s = '';
  for (let k = 0; k < length; k++) {
    s += ALPHABET[Math.floor(rand() * ALPHABET.length)] ?? '';
  }
  return s;
};

const SAMPLE = `#!/usr/bin/env bash
set -euo pipefail
# Build and ship
NAME="world"
export PATH="$HOME/bin:$PATH"
greet() {
  local who=\${1:-$NAME}
  echo "Hello, $who! Today is $(date +%A)" >&2
}
for f in *.txt; do
  if [ -f "$f" ] && grep -q 'TODO' "$f"; then
    echo "found in \${f}" | tee -a log.txt
  fi
done
cat <<-'EOF' > out.txt
	literal $HOME here
	EOF
npm install --save-dev typescript 2>&1 | tail -n 5
`;

describe('bashTokenizer', () => {
  it('returns [] for empty input', () => {
    expect(tok('')).toEqual([]);
  });

  it('keeps the invariants on a representative script', () => {
    expectInvariants(SAMPLE);
    expectTruncation(SAMPLE);
  });

  it('classifies commands, keywords, flags and numbers', () => {
    const code = 'if true; then npm install --save -g 2; fi';
    expect(typeOf(code, 'if')).toBe('keyword');
    expect(typeOf(code, 'true')).toBe('function');
    expect(typeOf(code, 'then')).toBe('keyword');
    expect(typeOf(code, 'npm')).toBe('function');
    expect(typeOf(code, 'install')).toBe('plain');
    expect(typeOf(code, '--save')).toBe('property');
    expect(typeOf(code, '-g')).toBe('property');
    expect(typeOf(code, '2')).toBe('number');
    expect(typeOf(code, 'fi')).toBe('keyword');
    expect(typeOf('a | b && c', 'b')).toBe('function');
    expect(typeOf('a | b && c', 'c')).toBe('function');
    expect(typeOf('echo if', 'if')).toBe('plain');
  });

  it('expands variables and command substitution inside double quotes', () => {
    expect(tok('echo "hi $USER ${HOME} $(date)"')).toEqual([
      { type: 'function', text: 'echo' },
      { type: 'plain', text: ' ' },
      { type: 'string', text: '"hi ' },
      { type: 'constant', text: '$USER' },
      { type: 'string', text: ' ' },
      { type: 'constant', text: '${HOME}' },
      { type: 'string', text: ' ' },
      { type: 'punctuation', text: '$(' },
      { type: 'function', text: 'date' },
      { type: 'punctuation', text: ')' },
      { type: 'string', text: '"' },
    ]);
    expect(typeOf("echo 'no $x here'", "'no $x here'")).toBe('string');
    expect(typeOf('echo "a\\"$b"', '$b')).toBe('constant');
  });

  it('treats assignments as constants and keeps command position', () => {
    expect(tok('FOO=1 make')).toEqual([
      { type: 'constant', text: 'FOO' },
      { type: 'operator', text: '=' },
      { type: 'plain', text: '1 ' },
      { type: 'function', text: 'make' },
    ]);
    expect(typeOf('X=$(date) make', 'make')).toBe('function');
    expect(typeOf('export PATH=/bin', 'PATH')).toBe('constant');
  });

  it('marks comments only at the start of a word', () => {
    expect(typeOf('echo a#b # note', '# note')).toBe('comment');
    expect(typeOf('echo a#b # note', 'a#b')).toBe('plain');
    expect(typeOf('echo ${#arr}', '${#arr}')).toBe('constant');
  });

  it('highlights heredoc bodies as strings through the terminator', () => {
    const code = "cat <<-'EOF'\n\tbody $x\n\tEOF\necho done\n";
    expect(typeOf(code, '<<-')).toBe('operator');
    expect(typeOf(code, "'EOF'")).toBe('string');
    expect(typeOf(code, '\tbody $x\n\tEOF\n')).toBe('string');
    expect(typeOf(code, 'echo')).toBe('function');
    expect(typeOf('echo $((1 << 2))\nls', 'ls')).toBe('function');
    expectTruncation(code);
  });

  it('never throws on unterminated constructs', () => {
    for (const code of [
      'echo "abc',
      "echo 'abc",
      'echo $(foo',
      'echo ${foo',
      'cat <<EOF\nbody',
      "cat <<'EOF",
      'echo `ls',
      "echo $'a\\'b",
      'echo \\',
      ')))}}}',
      '𐀀\uD800',
    ]) {
      expectInvariants(code);
      expectTruncation(code);
    }
  });

  it('holds the invariants on seeded random garbage', () => {
    const rand = seeded(0xb45);
    for (let run = 0; run < 300; run++) {
      const code = garbage(rand, 1 + Math.floor(rand() * 60));
      expectInvariants(code);
      expectTruncation(code);
    }
  });

  it('is linear on large and pathological input', () => {
    const N = 100_000;
    const inputs = [
      SAMPLE.repeat(Math.ceil(N / SAMPLE.length)),
      '${'.repeat(N / 2),
      '$('.repeat(N / 2),
      '"$('.repeat(N / 3),
      '<<EOF\n'.repeat(N / 6),
      "cat <<'".repeat(N / 7),
      'a'.repeat(N),
      '`'.repeat(N),
    ];
    for (const code of inputs) {
      const start = Date.now();
      const tokens = tok(code);
      expect(Date.now() - start).toBeLessThan(200);
      expect(tokensMatchInput(tokens, code)).toBe(true);
    }
  });
});
