import { highlight as fromPackage } from '@docren/react-native-markdown/highlight';
import { SYNTAX_TOKEN_TYPES } from '../../theme/types';
import {
  DEFAULT_MAX_LENGTH,
  highlight,
  type Token,
  type Tokenizer,
} from '../index';
import { normalizeTag, resolveTokenizer } from '../languages';
import { bashTokenizer } from '../tokenizers/bash';
import { diffTokenizer } from '../tokenizers/diff';
import { javascriptTokenizer } from '../tokenizers/javascript';
import { jsonTokenizer } from '../tokenizers/json';
import { pythonTokenizer } from '../tokenizers/python';
import { tokensMatchInput } from '../validate';

// Spy on each built-in module (keeping its real behaviour) to see which one a
// tag resolves to and the language it is called with.
jest.mock('../tokenizers/javascript', () => ({
  javascriptTokenizer: jest.fn(
    jest.requireActual<typeof import('../tokenizers/javascript')>(
      '../tokenizers/javascript'
    ).javascriptTokenizer
  ),
}));
jest.mock('../tokenizers/json', () => ({
  jsonTokenizer: jest.fn(
    jest.requireActual<typeof import('../tokenizers/json')>(
      '../tokenizers/json'
    ).jsonTokenizer
  ),
}));
jest.mock('../tokenizers/bash', () => ({
  bashTokenizer: jest.fn(
    jest.requireActual<typeof import('../tokenizers/bash')>(
      '../tokenizers/bash'
    ).bashTokenizer
  ),
}));
jest.mock('../tokenizers/diff', () => ({
  diffTokenizer: jest.fn(
    jest.requireActual<typeof import('../tokenizers/diff')>(
      '../tokenizers/diff'
    ).diffTokenizer
  ),
}));
jest.mock('../tokenizers/python', () => ({
  pythonTokenizer: jest.fn(
    jest.requireActual<typeof import('../tokenizers/python')>(
      '../tokenizers/python'
    ).pythonTokenizer
  ),
}));

/** A tokenizer that tags its output so a test can tell which one ran. */
const tagged =
  (label: string): Tokenizer =>
  (code, language) => [
    { type: 'keyword', text: `${label}:${language}:${code}` },
  ];

describe('highlight: entry', () => {
  it('is a components-only plugin named highlight', () => {
    const plugin = highlight();
    expect(plugin.name).toBe('highlight');
    expect(plugin.syntax).toBeUndefined();
    expect(Object.keys(plugin.components ?? {})).toEqual(['CodeBlock']);
  });

  it('resolves through the package subpath', () => {
    expect(fromPackage).toBe(highlight);
  });

  it('defaults maxLength to 50 000 characters', () => {
    expect(DEFAULT_MAX_LENGTH).toBe(50_000);
  });
});

describe('highlight: built-in languages', () => {
  const cases: readonly (readonly [string, Tokenizer, string])[] = [
    ['js', javascriptTokenizer, 'javascript'],
    ['jsx', javascriptTokenizer, 'javascript'],
    ['javascript', javascriptTokenizer, 'javascript'],
    ['mjs', javascriptTokenizer, 'javascript'],
    ['cjs', javascriptTokenizer, 'javascript'],
    ['ts', javascriptTokenizer, 'typescript'],
    ['tsx', javascriptTokenizer, 'typescript'],
    ['typescript', javascriptTokenizer, 'typescript'],
    ['json', jsonTokenizer, 'json'],
    ['jsonc', jsonTokenizer, 'json'],
    ['sh', bashTokenizer, 'bash'],
    ['bash', bashTokenizer, 'bash'],
    ['shell', bashTokenizer, 'bash'],
    ['zsh', bashTokenizer, 'bash'],
    ['diff', diffTokenizer, 'diff'],
    ['patch', diffTokenizer, 'diff'],
    ['py', pythonTokenizer, 'python'],
    ['python', pythonTokenizer, 'python'],
  ];

  it.each(cases)('%s resolves to a built-in', (tag, module, language) => {
    const tokenizer = resolveTokenizer(tag);
    expect(tokenizer).not.toBeNull();
    const code = `code for ${tag}`;
    expect(tokensMatchInput(tokenizer!(code, tag), code)).toBe(true);
    expect(module).toHaveBeenLastCalledWith(code, language);
  });

  it('shares one bound tokenizer per language across aliases', () => {
    expect(resolveTokenizer('js')).toBe(resolveTokenizer('cjs'));
    expect(resolveTokenizer('ts')).toBe(resolveTokenizer('tsx'));
    expect(resolveTokenizer('js')).not.toBe(resolveTokenizer('ts'));
    expect(resolveTokenizer('sh')).toBe(resolveTokenizer('zsh'));
    expect(resolveTokenizer('diff')).toBe(resolveTokenizer('patch'));
  });

  it('matches tags case-insensitively after trimming', () => {
    expect(resolveTokenizer(' TSX ')).toBe(resolveTokenizer('ts'));
    expect(resolveTokenizer('Python')).toBe(resolveTokenizer('py'));
    expect(normalizeTag('  JSON\t')).toBe('json');
  });

  it('only has own keys (no prototype lookups)', () => {
    expect(resolveTokenizer('constructor')).toBeNull();
    expect(resolveTokenizer('__proto__')).toBeNull();
    expect(resolveTokenizer('toString')).toBeNull();
  });
});

describe('highlight: resolution order', () => {
  it('returns null for an unknown, missing or blank tag', () => {
    expect(resolveTokenizer('rust')).toBeNull();
    expect(resolveTokenizer(null)).toBeNull();
    expect(resolveTokenizer('')).toBeNull();
    expect(resolveTokenizer('   ')).toBeNull();
  });

  it('uses options.languages before the built-ins', () => {
    const mine = tagged('mine');
    const options = { languages: { js: mine } };
    expect(resolveTokenizer('js', options)).toBe(mine);
    expect(resolveTokenizer('jsx', options)).toBe(resolveTokenizer('jsx'));
  });

  it('matches options.languages keys case-insensitively', () => {
    const mine = tagged('mine');
    const options = { languages: { ' Rust ': mine } };
    expect(resolveTokenizer('rust', options)).toBe(mine);
    expect(resolveTokenizer('RUST', options)).toBe(mine);
  });

  it('extends the built-ins with new tags', () => {
    const rust = tagged('rust');
    const options = { languages: { rust } };
    expect(resolveTokenizer('rust', options)).toBe(rust);
    expect(resolveTokenizer('py', options)).toBe(resolveTokenizer('py'));
  });

  it('falls back to options.tokenize for other tags only', () => {
    const fallback = tagged('fallback');
    const rust = tagged('rust');
    const options = { languages: { rust }, tokenize: fallback };
    expect(resolveTokenizer('go', options)).toBe(fallback);
    expect(resolveTokenizer('rust', options)).toBe(rust);
    expect(resolveTokenizer('ts', options)).toBe(resolveTokenizer('ts'));
    expect(resolveTokenizer(null, options)).toBeNull();
    expect(resolveTokenizer(' ', options)).toBeNull();
  });

  it('ignores inherited keys of options.languages', () => {
    const languages: Record<string, Tokenizer> = Object.create({
      go: tagged('inherited'),
    });
    expect(resolveTokenizer('go', { languages })).toBeNull();
  });
});

describe('highlight: tokensMatchInput', () => {
  const t = (...texts: string[]): Token[] =>
    texts.map((text) => ({ type: 'plain', text }));

  it('accepts tokens that concatenate to the input', () => {
    expect(tokensMatchInput(t('const', ' ', 'x'), 'const x')).toBe(true);
    expect(tokensMatchInput(t('a', '', 'b'), 'ab')).toBe(true);
    expect(tokensMatchInput([], '')).toBe(true);
    expect(tokensMatchInput(t(''), '')).toBe(true);
  });

  it('rejects missing, extra or changed text', () => {
    expect(tokensMatchInput(t('const'), 'const x')).toBe(false);
    expect(tokensMatchInput(t('const x', 'y'), 'const x')).toBe(false);
    expect(tokensMatchInput(t('const', 'y'), 'const x')).toBe(false);
    expect(tokensMatchInput(t('b', 'a'), 'ab')).toBe(false);
    expect(tokensMatchInput([], 'x')).toBe(false);
  });

  it('holds for every stub built-in', () => {
    const code = 'line 1\nline 2\n';
    for (const tag of ['js', 'ts', 'json', 'sh', 'diff', 'py']) {
      const tokenizer = resolveTokenizer(tag)!;
      expect(tokensMatchInput(tokenizer(code, tag), code)).toBe(true);
      expect(tokenizer('', tag)).toEqual([]);
    }
  });
});

describe('highlight: token types', () => {
  it('re-uses the 13 core syntax token types', () => {
    expect(SYNTAX_TOKEN_TYPES).toHaveLength(13);
    const token: Token = { type: 'inserted', text: '+' };
    expect(SYNTAX_TOKEN_TYPES).toContain(token.type);
  });
});
