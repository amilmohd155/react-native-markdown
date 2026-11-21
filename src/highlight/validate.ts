import type { Token } from './types';

/**
 * Whether `tokens` concatenate to exactly `code` (the {@link Tokenizer}
 * contract). O(n) with no string building. The CodeBlock runs it in dev only
 * and renders plain on a mismatch (P3-29).
 */
export function tokensMatchInput(
  tokens: readonly Token[],
  code: string
): boolean {
  let at = 0;
  for (const token of tokens) {
    const text = token.text;
    if (at + text.length > code.length || !code.startsWith(text, at))
      return false;
    at += text.length;
  }
  return at === code.length;
}
