import type { SyntaxTokenType } from '../theme/types';

export type { SyntaxTokenType };

/** One run of source text and the syntax type that colours it. */
export type Token = {
  readonly type: SyntaxTokenType;
  readonly text: string;
};

/**
 * Turns code into syntax tokens. Spec: docs/rewrite/phase-3/decisions.md (P3-29)
 *
 * Contract:
 * - Sync and stateless: the same `(code, language)` always gives the same
 *   tokens. The library re-feeds context itself while streaming, so there is
 *   no resumable state.
 * - The `text` of the tokens, joined in order, equals `code` exactly. If it
 *   does not, or the tokenizer throws, the block renders plain (dev builds
 *   warn; the check runs in dev only).
 * - Adjacent tokens of the same type should be merged (fewer spans render
 *   faster), and empty tokens left out.
 * - A language the tokenizer does not know gives one `plain` token holding
 *   all of `code` (or `[]` for empty code).
 *
 * `language` is the fence tag, trimmed and lower-cased.
 */
export type Tokenizer = (code: string, language: string) => readonly Token[];

/** Options for `highlight()`. */
export type HighlightOptions = {
  /**
   * Fence tag → tokenizer. Extends the built-in languages and overrides one
   * with the same tag. Tags match case-insensitively, after trimming.
   */
  languages?: Readonly<Record<string, Tokenizer>>;
  /**
   * Catch-all for tags that neither `languages` nor the built-ins know. It
   * receives the tag as `language`. Without it those blocks render plain.
   */
  tokenize?: Tokenizer;
  /**
   * Longest code block (in characters) that is highlighted; longer blocks
   * render plain, streaming or not (P3-31). Default {@link DEFAULT_MAX_LENGTH}.
   */
  maxLength?: number;
};

/** Default `maxLength`: 50 000 characters per code block (P3-31). */
export const DEFAULT_MAX_LENGTH = 50_000;
