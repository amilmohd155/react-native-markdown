import type { MarkdownIt, StateCore } from 'markdown-it';

/** The alert kinds, in GitHub's order. */
export const KINDS = [
  'note',
  'tip',
  'important',
  'warning',
  'caution',
] as const;

export type AdmonitionKind = (typeof KINDS)[number];

const KIND_SET: ReadonlySet<string> = new Set(KINDS);

/**
 * The marker: `[!KIND]` alone on the first line (trailing blanks allowed),
 * then the rest of the paragraph. Case-insensitive.
 */
const MARKER = /^\[!([A-Za-z]+)\][ \t]*(?:\n|$)/;

/** Narrows a token's `meta` to an alert kind, or `undefined`. */
export function kindOf(meta: unknown): AdmonitionKind | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined;
  const kind = (meta as { kind?: unknown }).kind;
  return typeof kind === 'string' && KIND_SET.has(kind)
    ? (kind as AdmonitionKind)
    : undefined;
}

/**
 * Retypes a `blockquote` whose first line is `[!KIND]` to an `admonition`
 * container: `blockquote_open`/`blockquote_close` become `admonition_open`/
 * `admonition_close` and the open token carries `meta: { kind }` (lowercase).
 * The marker line is removed from the first paragraph; a paragraph left empty
 * is dropped, so a bare `> [!NOTE]` is an empty alert.
 *
 * A core rule after `block` (the blockquote structure exists, inline content
 * is still a string) and before `inline`. Tokens are changed in place, so
 * `map` and `level` (the block index) are kept. An unknown kind, or text
 * after the marker on its line, leaves the blockquote alone.
 */
export function admonitionRule(md: MarkdownIt): void {
  md.core.ruler.after('block', 'admonitions', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i]!;
      if (open.type !== 'blockquote_open') continue;
      const para = tokens[i + 1];
      const inline = tokens[i + 2];
      // A first paragraph is `paragraph_open, inline, paragraph_close`.
      if (
        para?.type !== 'paragraph_open' ||
        inline?.type !== 'inline' ||
        tokens[i + 3]?.type !== 'paragraph_close'
      ) {
        continue;
      }
      const match = MARKER.exec(inline.content);
      if (match === null) continue;
      const kind = match[1]!.toLowerCase();
      if (!KIND_SET.has(kind)) continue;

      let close = -1;
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j]!;
        if (t.type === 'blockquote_close' && t.level === open.level) {
          close = j;
          break;
        }
      }
      if (close === -1) continue;

      open.type = 'admonition_open';
      open.meta = { kind };
      tokens[close]!.type = 'admonition_close';

      const rest = inline.content.slice(match[0].length);
      if (rest === '') {
        // paragraph_open, inline, paragraph_close
        tokens.splice(i + 1, 3);
      } else {
        inline.content = rest;
        if (inline.map !== null && inline.map !== undefined) {
          inline.map = [inline.map[0] + 1, inline.map[1]];
        }
      }
    }
  });
}
