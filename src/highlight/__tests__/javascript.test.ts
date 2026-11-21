import { javascriptTokenizer } from '../tokenizers/javascript';
import type { SyntaxTokenType, Token } from '../types';
import { tokensMatchInput } from '../validate';

// Helpers (duplicated in json.test.ts so each suite stands alone).

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

function randomGarbage(
  random: () => number,
  alphabet: string,
  length: number
): string {
  let s = '';
  for (let i = 0; i < length; i++)
    s += alphabet[Math.floor(random() * alphabet.length)];
  return s;
}

const js = (code: string): readonly Token[] =>
  javascriptTokenizer(code, 'javascript');
const ts = (code: string): readonly Token[] =>
  javascriptTokenizer(code, 'typescript');

/** Types of the tokens whose trimmed text is `text`. */
function typesOf(tokens: readonly Token[], text: string): SyntaxTokenType[] {
  return tokens.filter((t) => t.text.trim() === text).map((t) => t.type);
}

/** The type of the token covering the first occurrence of `text` in `code`. */
function typeAt(
  tokens: readonly Token[],
  code: string,
  text: string,
  from = 0
): SyntaxTokenType | undefined {
  const at = code.indexOf(text, from);
  if (at === -1) throw new Error(`"${text}" not in sample`);
  let offset = 0;
  for (const t of tokens) {
    if (at >= offset && at < offset + t.text.length) return t.type;
    offset += t.text.length;
  }
  return undefined;
}

const ES2022 = `#!/usr/bin/env node
// Greeter module
import fs, { readFile as read } from 'node:fs';
export const MAX_SIZE = 0x1f_ff + 1e3 + .5 + 10n;

/* block
   comment */
class Greeter extends Base {
  static #count = 0;
  #name;
  constructor(name) {
    super();
    this.#name = name ?? 'world';
  }
  get name() { return this.#name; }
  async *greet(times = 2) {
    for (let i = 0; i < times; i++) yield \`Hello, \${this.#name.toUpperCase()} #\${i + 1}!\`;
  }
}

const re = /ab+c[/\\]]*/gi, half = total / 2 / count;
const ratio = (a / b) / c;
const obj = { key: 'value', nested: { deep: [1, 2, 3] }, fn() {} };
label: for (const x of [1, 2]) { if (x) continue label; }
const t = cond ? { a: 1 } : null;
const nested = \`outer \${\`inner \${deep} text\`} end\`;
export default async function main() {
  const res = await fetch(url, { method: 'POST' });
  return res?.ok && !!res.json?.();
}
`;

const TYPESCRIPT = `import type { Readable } from 'stream';
import { a as b } from './x';

export interface User<T extends object = {}> extends Base {
  readonly id: number;
  name?: string
  tags: string[]
  meta: { created: Date; by: user }
  find<K extends keyof T>(key: K): T[K] | undefined;
}

type Id = string | number;
type Mapper<T> = (value: T, index: number) => T;
enum Color { Red, Green = 'green', BLUE }

@Component({ selector: 'app' })
export class Store<S> implements Service {
  private items: Map<string, S> = new Map<string, S>();
  @Input() label!: string;
  constructor(private readonly http: HttpClient) {}
  get<K extends string>(key: K): S | undefined {
    const value = this.items.get(key) as S | undefined;
    return value satisfies unknown ? value : undefined;
  }
}

function isId(x: unknown): x is Id {
  return typeof x === 'string' || typeof x === 'number';
}
const pick = <T,>(xs: T[]): T => xs[0];
const n: count = useState<number>(0);
let v: myType = cast as otherType;
for (let i = 0; i < n; i++) total += i > 2 ? i : 0;
declare module 'x' { export const y: number; }
namespace NS { export type Z = { z: 1 } }
`;

const JSX = `export function App({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.box} onPress={() => setOpen(!open)}>
      {items.map((item) => <Text key={item.id}>{item.label} don't</Text>)}
      <Foo<string> prop="x" />
      {/* comment */}
    </View>
  );
}
`;

const SAMPLES: readonly (readonly [string, string, string])[] = [
  ['ES2022', ES2022, 'javascript'],
  ['ES2022 as typescript', ES2022, 'typescript'],
  ['TypeScript', TYPESCRIPT, 'typescript'],
  ['JSX', JSX, 'javascript'],
  ['TSX', JSX, 'typescript'],
];

describe('javascriptTokenizer: invariants', () => {
  it('returns [] for empty input', () => {
    expect(js('')).toEqual([]);
    expect(ts('')).toEqual([]);
  });

  it.each(SAMPLES)(
    '%s: concatenates, merges, no empty tokens',
    (_, code, lang) => {
      expectInvariants(javascriptTokenizer(code, lang), code);
    }
  );

  it.each(SAMPLES)(
    '%s: prefixes at line boundaries are stable',
    (_, code, lang) => {
      expectPrefixStable((c) => javascriptTokenizer(c, lang), code);
    }
  );

  it.each(SAMPLES)('%s: every prefix concatenates back', (_, code, lang) => {
    for (let k = 0; k <= code.length; k++) {
      const prefix = code.slice(0, k);
      expect(tokensMatchInput(javascriptTokenizer(prefix, lang), prefix)).toBe(
        true
      );
    }
  });

  it('survives unterminated strings, comments, templates and regexes', () => {
    for (const code of [
      '"abc',
      "'abc\\",
      '`abc ${x',
      '`abc ${`in ${',
      '/* open',
      '/re[/',
      'a = /',
      '}}}))]]',
      '`${}}}`',
      '<<<<>>>>',
      'x<y<z',
      '#',
      '@',
      '\\u00e9',
      '\uD800 lone \uDC00 surrogates 😀',
      '0x',
      '1e',
      '...',
      '?.?.??=',
    ]) {
      expectInvariants(js(code), code);
      expectInvariants(ts(code), code);
    }
  });

  it('survives random garbage (seeded)', () => {
    const random = seededRandom(0x5eed);
    const alphabet = 'ab$_ 09\n\t\'"`\\/*{}()[]<>=:;,.?!@#+-|&${}\uD800éxT';
    for (let i = 0; i < 400; i++) {
      const code = randomGarbage(
        random,
        alphabet,
        1 + Math.floor(random() * 120)
      );
      expectInvariants(js(code), code);
      expectInvariants(ts(code), code);
    }
  });

  it('tokenizes 100 KB in under 200 ms, including one very long line', () => {
    let big = '';
    while (big.length < 100_000) big += TYPESCRIPT + ES2022;
    const longLine = 'a / b < c '.repeat(10_000) + '/'.repeat(5_000);
    // Words right before `<` scan ahead for a generic's `>` (bounded).
    const generics = 'a<'.repeat(50_000);
    const typeArgs = 'f<T,'.repeat(25_000);
    const unclosed = 'a<' + 'a<b>'.repeat(25_000);
    for (const code of [big, longLine, generics, typeArgs, unclosed]) {
      const started = Date.now();
      const tokens = ts(code);
      expect(Date.now() - started).toBeLessThan(200);
      expect(tokensMatchInput(tokens, code)).toBe(true);
    }
  });
});

describe('javascriptTokenizer: classification', () => {
  const tokens = js(ES2022);
  const at = (text: string, from?: number) =>
    typeAt(tokens, ES2022, text, from);

  it('marks comments, keywords, strings and numbers', () => {
    expect(at('#!/usr')).toBe('comment');
    expect(at('// Greeter')).toBe('comment');
    expect(at('/* block')).toBe('comment');
    expect(at('import')).toBe('keyword');
    expect(at("'node:fs'")).toBe('string');
    expect(at('0x1f_ff')).toBe('number');
    expect(at('1e3')).toBe('number');
    expect(at('.5')).toBe('number');
    expect(at('10n')).toBe('number');
    expect(at('class')).toBe('keyword');
  });

  it('marks types, constants, functions and properties', () => {
    expect(at('MAX_SIZE')).toBe('constant');
    expect(at('Greeter extends')).toBe('type');
    expect(at('Base')).toBe('type');
    expect(at('constructor')).toBe('function');
    expect(at('toUpperCase')).toBe('function');
    expect(at('#name;')).toBe('property');
    expect(at('key:')).toBe('property');
    expect(at('main')).toBe('function');
    expect(at('null')).toBe('constant');
  });

  it('tells regex literals from division', () => {
    expect(at('/ab+c')).toBe('string');
    expect(typesOf(tokens, '/ab+c[/\\]]*/gi')).toEqual(['string']);
    expect(at('/ 2 /')).toBe('operator');
    expect(at('/ count')).toBe('operator');
    expect(at(') / c')).toBe('punctuation');
    expect(at('/ c;')).toBe('operator');
  });

  it('tokenizes template interpolations as code', () => {
    const line = ES2022.indexOf('yield `');
    expect(at('`Hello, ', line)).toBe('string');
    expect(at('${this', line)).toBe('punctuation');
    expect(at('this.#name.toUpperCase', line)).toBe('keyword');
    expect(at('toUpperCase()}', line)).toBe('function');
    expect(at('} #${', line)).toBe('punctuation');
    expect(at('#${i', line)).toBe('string');
    expect(at('+ 1}', line)).toBe('operator');
    expect(at('1}!', line)).toBe('number');
    expect(at('!`;', line)).toBe('string');
    const nested = ES2022.indexOf('const nested');
    expect(at('`inner', nested)).toBe('string');
    expect(at('deep}', nested)).toBe('plain');
    expect(at(' end`', nested)).toBe('string');
  });

  it('resumes a template after `}` even past an unclosed `(`', () => {
    expect(js('`a ${f(} b` + 1').slice(-6)).toEqual([
      { type: 'punctuation', text: '(}' },
      { type: 'string', text: ' b`' },
      { type: 'plain', text: ' ' },
      { type: 'operator', text: '+' },
      { type: 'plain', text: ' ' },
      { type: 'number', text: '1' },
    ]);
  });

  it('closes a template right after an interpolation', () => {
    expect(js('f(`a${b}`); x')).toEqual([
      { type: 'function', text: 'f' },
      { type: 'punctuation', text: '(' },
      { type: 'string', text: '`a' },
      { type: 'punctuation', text: '${' },
      { type: 'plain', text: 'b' },
      { type: 'punctuation', text: '}' },
      { type: 'string', text: '`' },
      { type: 'punctuation', text: ');' },
      { type: 'plain', text: ' x' },
    ]);
  });

  it('keeps contextual keywords as names when used as names', () => {
    expect(at('as read')).toBe('keyword');
    expect(at('of [1')).toBe('keyword');
    expect(at('get name')).toBe('keyword');
    const own = js('const of = 1; obj.get(x); ({ from: 1 });');
    expect(typesOf(own, 'of')).toEqual(['plain']);
    expect(typesOf(own, 'get')).toEqual(['function']);
    expect(typesOf(own, 'from')).toEqual(['property']);
  });

  it('does not treat JavaScript as TypeScript', () => {
    const own = js('let x = a < b; let s: string; type Foo = number');
    expect(typesOf(own, 'string')).toEqual(['plain']);
    expect(typesOf(own, 'type')).toEqual(['plain']);
  });
});

describe('javascriptTokenizer: TypeScript', () => {
  const tokens = ts(TYPESCRIPT);
  const at = (text: string, from?: number) =>
    typeAt(tokens, TYPESCRIPT, text, from);

  it('marks interfaces, generics and members', () => {
    expect(at('interface')).toBe('keyword');
    expect(at('User<')).toBe('type');
    expect(at('<T extends')).toBe('punctuation');
    expect(at('T extends object')).toBe('type');
    expect(at('object =')).toBe('type');
    expect(at('id:')).toBe('property');
    expect(at('number;')).toBe('type');
    expect(at('name?')).toBe('property');
    expect(at('created')).toBe('property');
    expect(at('user }')).toBe('type');
    expect(at('find<')).toBe('function');
    expect(at('keyof')).toBe('keyword');
    expect(at('K): T[K]')).toBe('type');
    expect(at('undefined;')).toBe('constant');
  });

  it('marks type aliases, enums and decorators', () => {
    expect(at('type Id')).toBe('keyword');
    expect(at('Id =')).toBe('type');
    expect(at('string | number;')).toBe('type');
    expect(at('Mapper')).toBe('type');
    expect(at('value: T,')).toBe('plain');
    expect(at('enum')).toBe('keyword');
    expect(at('Red')).toBe('property');
    expect(at('BLUE')).toBe('property');
    expect(at('@Component')).toBe('function');
    expect(at('@Input')).toBe('function');
  });

  it('marks lowercase user types after `:`, `as` and `<`', () => {
    expect(at('count =')).toBe('type');
    expect(at('number>(0)')).toBe('type');
    expect(at('useState')).toBe('function');
    expect(at('myType')).toBe('type');
    expect(at('otherType')).toBe('type');
    expect(at('x is Id')).toBe('plain');
    expect(at('is Id')).toBe('keyword');
  });

  it('keeps value positions as values', () => {
    expect(at('b } from')).toBe('plain');
    expect(at('cast as')).toBe('plain');
    const loop = TYPESCRIPT.indexOf('for (let i');
    expect(at('n; i++', loop)).toBe('plain');
    expect(at('i : 0', loop)).toBe('plain');
    expect(at('total', loop)).toBe('plain');
    expect(at('xs[0]')).toBe('plain');
    expect(at('value satisfies')).toBe('plain');
    expect(at('value : undefined')).toBe('plain');
    expect(at('Map<string, S>()')).toBe('type');
  });
});
