import type { MarkdownIt, StateCore, Token } from 'markdown-it';

/** A shortcode: lowercase letters, digits, `_`, `+`, `-` between colons. */
const SHORTCODE = /:([a-z0-9_+-]+):/g;

/** Link markups whose text is the URL itself: left alone. */
const AUTOLINK = new Set(['linkify', 'autolink']);

type Resolve = (name: string) => string | undefined;

/**
 * Replaces `:name:` in text with the character `resolve` returns, as a
 * markdown-it core rule after `linkify` (so autolinked text is already in
 * link tokens) and before `text_join` (so an escaped `\:smile:`, a
 * `text_special` token, stays raw).
 * Spec: docs/rewrite/phase-3/plugins.md#emoji (P3-23)
 *
 * Only `text` tokens are rewritten: code, HTML and escapes are untouched.
 * Text inside an autolink (`markup: 'linkify'` or `'autolink'`) is skipped; text inside an
 * explicit `[label](url)` link is substituted. An unresolved name stays text.
 */
export function emojiRule(md: MarkdownIt, resolve: Resolve): void {
  md.core.ruler.after('linkify', 'emoji', (state: StateCore) => {
    for (const block of state.tokens) {
      if (block.type === 'inline' && block.children) {
        replaceIn(block.children, resolve);
      }
    }
  });
}

function replaceIn(children: Token[], resolve: Resolve): void {
  let autolink = 0;
  for (const child of children) {
    if (child.type === 'link_open' && AUTOLINK.has(child.markup)) {
      autolink++;
    } else if (child.type === 'link_close' && AUTOLINK.has(child.markup)) {
      autolink--;
    } else if (
      child.type === 'text' &&
      autolink <= 0 &&
      child.content.includes(':')
    ) {
      child.content = child.content.replace(
        SHORTCODE,
        (whole, name: string) => resolve(name) ?? whole
      );
    }
  }
}
