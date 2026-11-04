import type { Token } from 'markdown-it';
import { NodeType } from '../model';
import type { HtmlMode } from './backend';

/**
 * The safe raw-HTML subset (D3): simple inline tags that become elements.
 * Spec: docs/rewrite/04-api.md#raw-html, token-mapping.md#raw-html-pairing
 */
export const SAFE_HTML_TAGS = {
  br: NodeType.LineBreak,
  b: NodeType.Strong,
  strong: NodeType.Strong,
  i: NodeType.Emphasis,
  em: NodeType.Emphasis,
  s: NodeType.Strikethrough,
  del: NodeType.Strikethrough,
  u: NodeType.Underline,
  mark: NodeType.Highlight,
  sup: NodeType.Superscript,
  sub: NodeType.Subscript,
  kbd: NodeType.Kbd,
} as const;

export type SafeHtmlTag = keyof typeof SAFE_HTML_TAGS;

export interface SimpleTag {
  readonly name: string;
  readonly closing: boolean;
  readonly selfClosing: boolean;
}

/**
 * Parses a bare tag: `<b>`, `</b>`, `<br/>`, `<br />`. Any attribute or other
 * content returns null, so attributes are never interpreted.
 */
export function parseSimpleTag(html: string): SimpleTag | null {
  const match = /^<(\/?)([a-z][a-z0-9]*)\s*(\/?)>$/i.exec(html);
  if (!match) return null;
  return {
    name: match[2]!.toLowerCase(),
    closing: match[1] === '/',
    selfClosing: match[3] === '/',
  };
}

/**
 * Tags interpreted as elements for an html mode. `strip` returns null: the
 * caller drops every tag instead.
 */
export function allowedTags(mode: HtmlMode): ReadonlySet<string> | null {
  if (mode === 'strip') return null;
  if (mode === 'text') return EMPTY;
  if (mode === 'safe') return ALL_SAFE;
  return new Set(mode.allow.map((t) => t.toLowerCase()).filter(isSafeTag));
}

export function isSafeTag(name: string): name is SafeHtmlTag {
  return Object.prototype.hasOwnProperty.call(SAFE_HTML_TAGS, name);
}

const EMPTY: ReadonlySet<string> = new Set();
const ALL_SAFE: ReadonlySet<string> = new Set(Object.keys(SAFE_HTML_TAGS));

/**
 * Finds the `html_inline` tokens (by index) that form matched open/close
 * pairs of allowed, non-void tags, within one inline token.
 *
 * Markdown containers (`em_open`, `link_open`, …) share the stack, so a tag
 * pair can't cross markdown nesting: in `<b>**x</b>**` neither `<b>` nor
 * `</b>` pairs, and both fall back to literal text. Unpaired tags are
 * exactly the unmatched and unclosed ones.
 */
export function pairHtmlTags(
  tokens: readonly Token[],
  allowed: ReadonlySet<string>
): Set<number> {
  const paired = new Set<number>();
  /** Open entries: a token index for an html tag, -1 for a markdown container. */
  const stack: { index: number; name: string | null }[] = [];

  tokens.forEach((token, index) => {
    if (token.type === 'html_inline') {
      const tag = parseSimpleTag(token.content);
      if (
        !tag ||
        tag.selfClosing ||
        tag.name === 'br' ||
        !allowed.has(tag.name)
      ) {
        return;
      }
      if (!tag.closing) {
        stack.push({ index, name: tag.name });
        return;
      }
      const top = stack[stack.length - 1];
      if (top && top.name === tag.name) {
        paired.add(top.index);
        paired.add(index);
        stack.pop();
      }
      return;
    }

    if (token.nesting === 1) {
      stack.push({ index: -1, name: null });
    } else if (token.nesting === -1) {
      // Close the markdown container; html tags still open inside it are unpaired.
      while (stack.length > 0 && stack.pop()!.name !== null) {
        // keep popping
      }
    }
  });

  return paired;
}
