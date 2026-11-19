import type { MarkdownIt, StateCore, Token } from 'markdown-it';

/** Link markups whose text is the URL itself: never a mention. */
const AUTOLINK = new Set(['linkify', 'autolink']);

/** Percent-decodes `value`; malformed escapes keep the raw text. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Plain text of link children: text, code and escapes; breaks as a space. */
function flatten(children: readonly Token[]): string {
  let out = '';
  for (const child of children) {
    if (
      child.type === 'text' ||
      child.type === 'text_special' ||
      child.type === 'code_inline'
    ) {
      out += child.content;
    } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
      out += ' ';
    }
  }
  return out;
}

/**
 * Turns `[label](scheme://id)` into one inline `mention` token when `scheme`
 * (lowercased) is in `schemes`. A core rule after `linkify` (links, including
 * reference links, already exist as tokens) and before `text_join`.
 *
 * Skipped: `scheme:id` without `//`, autolinks (`<user://a>`, linkified
 * text), other schemes, and links with an image or no text in the label. The token carries `scheme`, `id`, `label`, `url`
 * as attrs.
 */
export function mentionRule(
  md: MarkdownIt,
  schemes: ReadonlySet<string>
): void {
  md.core.ruler.after('linkify', 'mentions', (state: StateCore) => {
    if (schemes.size === 0) return;
    for (const block of state.tokens) {
      if (block.type === 'inline' && block.children) {
        block.children = convert(state, block.children, schemes);
      }
    }
  });
}

function convert(
  state: StateCore,
  children: Token[],
  schemes: ReadonlySet<string>
): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < children.length; i++) {
    const open = children[i]!;
    const raw = open.type === 'link_open' ? open.attrGet('href') : null;
    const href = raw === null ? null : String(raw);
    const sep = href === null ? -1 : href.indexOf('://');
    if (
      href === null ||
      sep <= 0 ||
      AUTOLINK.has(open.markup) ||
      !schemes.has(href.slice(0, sep).toLowerCase())
    ) {
      out.push(open);
      continue;
    }
    let close = i + 1;
    while (close < children.length && children[close]!.type !== 'link_close') {
      close++;
    }
    if (close >= children.length) {
      out.push(open);
      continue;
    }
    const inner = children.slice(i + 1, close);
    const label = flatten(inner);
    // An image or an empty label has no text to show: keep an ordinary link.
    if (label.trim() === '' || inner.some((t) => t.type === 'image')) {
      out.push(open);
      continue;
    }
    const token = new state.Token('mention', '', 0);
    token.level = open.level;
    token.attrs = [
      ['scheme', href.slice(0, sep).toLowerCase()],
      ['id', safeDecode(href.slice(sep + 3))],
      ['label', label],
      ['url', href],
    ];
    out.push(token);
    i = close;
  }
  return out;
}
