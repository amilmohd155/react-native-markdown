import { bashTokenizer } from './tokenizers/bash';
import { diffTokenizer } from './tokenizers/diff';
import { javascriptTokenizer } from './tokenizers/javascript';
import { jsonTokenizer } from './tokenizers/json';
import { pythonTokenizer } from './tokenizers/python';
import type { HighlightOptions, Tokenizer } from './types';

/**
 * A built-in tokenizer bound to its canonical language, so the tokenizer
 * sees `'typescript'` for `ts`/`tsx` and so on, whatever the fence said.
 */
const bound =
  (tokenizer: Tokenizer, language: string): Tokenizer =>
  (code) =>
    tokenizer(code, language);

const javascript = bound(javascriptTokenizer, 'javascript');
const typescript = bound(javascriptTokenizer, 'typescript');
const json = bound(jsonTokenizer, 'json');
const bash = bound(bashTokenizer, 'bash');
const diff = bound(diffTokenizer, 'diff');
const python = bound(pythonTokenizer, 'python');

/**
 * Built-in languages: lower-case fence tag → tokenizer (P3-29).
 *
 * | Tags                                 | Language   | File                       |
 * | ------------------------------------ | ---------- | -------------------------- |
 * | js, jsx, javascript, mjs, cjs        | javascript | tokenizers/javascript.ts   |
 * | ts, tsx, typescript                  | typescript | tokenizers/javascript.ts   |
 * | json, jsonc                          | json       | tokenizers/json.ts         |
 * | sh, bash, shell, zsh                 | bash       | tokenizers/bash.ts         |
 * | diff, patch                          | diff       | tokenizers/diff.ts         |
 * | py, python                           | python     | tokenizers/python.ts       |
 */
const BUILT_IN: Readonly<Record<string, Tokenizer>> = {
  js: javascript,
  jsx: javascript,
  javascript,
  mjs: javascript,
  cjs: javascript,
  ts: typescript,
  tsx: typescript,
  typescript,
  json,
  jsonc: json,
  sh: bash,
  bash,
  shell: bash,
  zsh: bash,
  diff,
  patch: diff,
  py: python,
  python,
};

/** A fence tag as tokenizers and lookups see it: trimmed, lower-case. */
export const normalizeTag = (tag: string): string => tag.trim().toLowerCase();

const own = (
  table: Readonly<Record<string, Tokenizer>>,
  key: string
): Tokenizer | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

// `options.languages` with normalized keys, built once per object.
const normalized = new WeakMap<
  Readonly<Record<string, Tokenizer>>,
  Readonly<Record<string, Tokenizer>>
>();

function userLanguages(
  languages: Readonly<Record<string, Tokenizer>>
): Readonly<Record<string, Tokenizer>> {
  let table = normalized.get(languages);
  if (!table) {
    const out: Record<string, Tokenizer> = Object.create(null);
    for (const key of Object.keys(languages)) {
      const tokenizer = languages[key];
      const tag = normalizeTag(key);
      // First key wins when two differ only in case or spaces.
      if (tokenizer && !(tag in out)) out[tag] = tokenizer;
    }
    table = out;
    normalized.set(languages, table);
  }
  return table;
}

/**
 * The tokenizer for a fence tag, or `null` to render the block plain.
 *
 * Order: `options.languages[tag]` → built-ins (aliases above) →
 * `options.tokenize` → `null`. The tag is trimmed and matched
 * case-insensitively. A missing or blank tag is `null`: `tokenize` is only
 * for tagged blocks.
 *
 * Call the result as `tokenizer(code, normalizeTag(tag))`; built-ins ignore
 * the second argument and use their canonical language.
 */
export function resolveTokenizer(
  tag: string | null,
  options: HighlightOptions = {}
): Tokenizer | null {
  if (tag === null) return null;
  const key = normalizeTag(tag);
  if (key === '') return null;
  return (
    (options.languages
      ? own(userLanguages(options.languages), key)
      : undefined) ??
    own(BUILT_IN, key) ??
    options.tokenize ??
    null
  );
}
