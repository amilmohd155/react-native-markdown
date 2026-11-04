import type { MarkdownIt } from 'markdown-it';
import footnotePlugin from 'markdown-it-footnote';

/** `meta` of `footnote_ref` and `footnote_anchor` tokens. */
export interface FootnoteRefMeta {
  /** 0-based footnote number, in order of first reference. */
  readonly id: number;
  /** 0-based: which reference to this footnote this is. */
  readonly subId: number;
  readonly label: string;
}

/** `meta` of `footnote_open` tokens. */
export interface FootnoteMeta {
  readonly id: number;
  readonly label: string;
}

/**
 * Footnotes (`[^label]` and `[^label]: …`), a GitHub feature that is not in
 * the GFM spec: `markdown-it-footnote`, minus its inline footnotes
 * (`^[text]`), which GitHub doesn't have.
 * Mapping: docs/rewrite/phase-1/token-mapping.md#footnotes
 */
export function gfmFootnotes(md: MarkdownIt): void {
  md.use(footnotePlugin);
  md.disable('footnote_inline');
}
