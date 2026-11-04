import type { MarkdownIt, StateCore, Token } from 'markdown-it';

/** `meta` that the tagfilter rule sets on `html_block` / `html_inline` tokens. */
export interface TagfilterMeta {
  /** The token's HTML with each disallowed tag's `<` replaced by `&lt;`. */
  readonly filteredHtml: string;
}

/**
 * GFM's disallowed raw HTML tags, opening or closing, in any case. As in
 * cmark-gfm, the name must be followed by whitespace, `>` or `/>`.
 */
const DISALLOWED =
  /<(?=\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?:[\s>]|\/>))/gi;

/**
 * GFM tagfilter (extension), as a markdown-it core rule after `inline`.
 * Spec: GFM spec "Disallowed Raw HTML (extension)", decision P1-13.
 *
 * Raw HTML is never interpreted by the renderer (D3), and none of these tags
 * is in the safe subset, so the filter changes nothing on screen: the node
 * text stays the source. It matters for consumers that output HTML (spec
 * serializer, mdast interop): the filtered HTML is recorded in
 * `meta.filteredHtml` and stored as the node's `filteredHtml` attr.
 */
export function gfmTagfilter(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'tagfilter', tagfilter);
}

function tagfilter(state: StateCore): void {
  for (const token of state.tokens) {
    if (token.type === 'html_block') {
      filter(token);
    } else if (token.type === 'inline' && token.children) {
      for (const child of token.children) {
        if (child.type === 'html_inline') filter(child);
      }
    }
  }
}

function filter(token: Token): void {
  DISALLOWED.lastIndex = 0;
  if (!DISALLOWED.test(token.content)) return;
  const filteredHtml = token.content.replace(DISALLOWED, '&lt;');
  token.meta = { ...token.meta, filteredHtml } satisfies TagfilterMeta;
}

/** The tagfilter result on a token, if any of its tags was filtered. */
export function filteredHtmlOf(token: Token): string | null {
  const meta = token.meta as Partial<TagfilterMeta> | null;
  return typeof meta?.filteredHtml === 'string' ? meta.filteredHtml : null;
}
