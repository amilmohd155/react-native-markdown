import type { MarkdownIt, StateCore, StateInline, Token } from 'markdown-it';

/**
 * GFM autolinks (extension): linkify-it with fuzzy matching, plus thin GFM
 * rules on top of its matches.
 * Decision: docs/rewrite/phase-1/decisions.md (P1-1); first prototyped in
 * bench/autolink.cjs.
 *
 * 1. Config: fuzzy links and emails, no bare IPs, an `xmpp:` schema.
 * 2. Filter: keep a match only if it starts with `http://`, `https://`,
 *    `ftp://`, `www.`, `mailto:` or `xmpp:`, or is an email. Everything else
 *    (`README.md`, `example.com`) stays text.
 * 3. Reject: a `+` in an email's domain; an `_` right after a `www.` host.
 * 4. Trim: trailing `?!.,:*_~`, an unbalanced trailing `)`, and a trailing
 *    entity reference (`&hl;`). The trimmed characters stay text.
 *
 * markdown-it's two `linkify` rules are replaced in place (same names, so
 * excluding the plugin disables them):
 * - core: links matches in text tokens after inline parsing. Unlike
 *   markdown-it's, it tests each text token rather than the raw paragraph,
 *   so `~~www.x.com~~` links (linkify-it rejects `~` right before `www`).
 * - inline: `scheme://` links while parsing, so `*` or `_` in a URL don't
 *   start emphasis. It trims before consuming, so `~~` after a URL still
 *   closes a strikethrough.
 *
 * Links keep markdown-it's `markup: 'linkify'`; the converter sets
 * `AUTOLINK` on them.
 */
export function gfmAutolinks(md: MarkdownIt): void {
  md.linkify.set({ fuzzyLink: true, fuzzyEmail: true, fuzzyIP: false });
  // GFM's extended protocol autolink: xmpp:user@host[/resource].
  md.linkify.add('xmpp:', {
    validate: (text, pos) => XMPP.exec(text.slice(pos))?.[0].length ?? 0,
  });
  md.core.ruler.at('linkify', linkifyCore);
  md.inline.ruler.at('linkify', linkifyInline);
  md.enable('linkify');
}

const XMPP = /^[\w.+-]+@[\w-]+(\.[\w-]+)+(\/[\w.@-]*[\w@-])?/;
const ALLOWED_PREFIX = /^(https?:\/\/|ftp:\/\/|www\.|mailto:|xmpp:)/i;
const EMAIL = /^[\w.+-]+@/;
const INLINE_SCHEMES = new Set(['http:', 'https:', 'ftp:']);
const TRAILING_PUNCTUATION = /[?!.,:*_~]$/;
const TRAILING_ENTITY = /&[a-z0-9]+$/i;

// ── Shared GFM rules ────────────────────────────────────────────────────

/** Filter and reject rules (steps 2, 3). `after` is the text following the match. */
function isGfmAutolink(text: string, after: string): boolean {
  if (!ALLOWED_PREFIX.test(text) && !EMAIL.test(text)) return false;
  const address = text.replace(/^(mailto|xmpp):/i, '');
  if (address.includes('@') && /@[^@]*\+/.test(address)) return false;
  // linkify-it ends a host at `_`; GFM rejects the whole link instead.
  if (/^www\./i.test(text) && /^\.?[\w-]*_/.test(after)) return false;
  return true;
}

/** Trailing-character rules (step 4): how many characters of `text` stay linked. */
function trimmedLength(text: string, after: string): number {
  let end = text.length;
  for (;;) {
    const kept = text.slice(0, end);
    if (TRAILING_PUNCTUATION.test(kept)) {
      end--;
    } else if (kept.endsWith(')') && count(kept, '(') < count(kept, ')')) {
      end--;
    } else {
      break;
    }
  }
  // An entity reference: linkify-it already ends the match before its `;`.
  if (end === text.length && after.startsWith(';')) {
    const entity = TRAILING_ENTITY.exec(text);
    if (entity) end -= entity[0].length;
  }
  return end;
}

function count(text: string, char: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === char) n++;
  return n;
}

/** The display text markdown-it would use for a link (`normalizeLinkText`). */
function linkText(md: MarkdownIt, schema: string, raw: string): string {
  if (!schema) {
    return md.normalizeLinkText(`http://${raw}`).replace(/^http:\/\//, '');
  }
  if (schema === 'mailto:' && !/^mailto:/i.test(raw)) {
    return md.normalizeLinkText(`mailto:${raw}`).replace(/^mailto:/, '');
  }
  return md.normalizeLinkText(raw);
}

// ── Core rule: matches in text tokens ───────────────────────────────────

/**
 * Cheap substring prefilter before `md.linkify.test()`, which runs several
 * regexes per text token. Every candidate `isGfmAutolink` accepts contains one
 * of these (`://` schemes, `@` emails, `www.`, `mailto:`, `xmpp:`), so text
 * without any cannot link.
 */
function mayContainAutolink(text: string): boolean {
  if (text.includes('://') || text.includes('@')) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('www.') ||
    lower.includes('mailto:') ||
    lower.includes('xmpp:')
  );
}

function linkifyCore(state: StateCore): void {
  const { md } = state;
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    const children = block.children;
    let htmlLinkLevel = 0;

    // Backwards, so replacing a token doesn't move the ones still to visit.
    for (let i = children.length - 1; i >= 0; i--) {
      const token = children[i]!;
      if (token.type === 'link_close') {
        // Skip existing links (including ones the inline rule made).
        i--;
        while (
          children[i]!.level !== token.level &&
          children[i]!.type !== 'link_open'
        ) {
          i--;
        }
        continue;
      }
      if (token.type === 'html_inline') {
        if (/^<a[>\s]/i.test(token.content) && htmlLinkLevel > 0) {
          htmlLinkLevel--;
        }
        if (/^<\/a\s*>/i.test(token.content)) htmlLinkLevel++;
      }
      if (htmlLinkLevel > 0 || token.type !== 'text') continue;
      if (!mayContainAutolink(token.content)) continue;
      if (!md.linkify.test(token.content)) continue;

      // As markdown-it: no link right after an escape (`\www.x.com`).
      const afterEscape = i > 0 && children[i - 1]!.type === 'text_special';
      const nodes = linkifyText(state, token, afterEscape);
      if (nodes) children.splice(i, 1, ...nodes);
    }
  }
}

/** Splits one text token into text and links, or returns null if nothing links. */
function linkifyText(
  state: StateCore,
  token: Token,
  afterEscape: boolean
): Token[] | null {
  const { md } = state;
  const text = token.content;
  const nodes: Token[] = [];
  let level = token.level;
  let lastPos = 0;

  for (const match of md.linkify.match(text) ?? []) {
    if (afterEscape && match.index === 0) continue;
    const after = text.slice(match.lastIndex);
    if (!isGfmAutolink(match.raw, after)) continue;

    const keep = trimmedLength(match.raw, after);
    if (keep === 0) continue;
    const dropped = match.raw.length - keep;
    const raw = match.raw.slice(0, keep);
    const href = md.normalizeLink(
      match.url.slice(0, match.url.length - dropped)
    );
    if (!md.validateLink(href)) continue;

    if (match.index > lastPos) {
      nodes.push(textToken(state, text.slice(lastPos, match.index), level));
    }
    const open = new state.Token('link_open', 'a', 1);
    open.attrs = [['href', href]];
    open.level = level++;
    open.markup = 'linkify';
    open.info = 'auto';
    nodes.push(open, textToken(state, linkText(md, match.schema, raw), level));
    const close = new state.Token('link_close', 'a', -1);
    close.level = --level;
    close.markup = 'linkify';
    close.info = 'auto';
    nodes.push(close);
    lastPos = match.index + keep;
  }

  if (nodes.length === 0) return null;
  if (lastPos < text.length) {
    nodes.push(textToken(state, text.slice(lastPos), level));
  }
  return nodes;
}

function textToken(state: StateCore, content: string, level: number): Token {
  const token = new state.Token('text', '', 0);
  token.content = content;
  token.level = level;
  return token;
}

// ── Inline rule: `scheme://` while parsing ──────────────────────────────

/** Port of markdown-it's inline `linkify` rule, with the GFM rules applied. */
function linkifyInline(state: StateInline, silent: boolean): boolean {
  if (state.linkLevel > 0) return false;
  const pos = state.pos;
  const max = state.posMax;
  if (pos + 3 > max) return false;
  if (state.src.charCodeAt(pos) !== 0x3a /* : */) return false;
  if (state.src.charCodeAt(pos + 1) !== 0x2f /* / */) return false;
  if (state.src.charCodeAt(pos + 2) !== 0x2f /* / */) return false;

  // The scheme is already in `pending` text, as at most 10 characters.
  const protoMin = pos - Math.min(10, state.pending.length, pos);
  let protoStart = pos;
  while (
    protoStart > protoMin &&
    isSchemeChar(state.src.charCodeAt(protoStart - 1))
  ) {
    protoStart--;
  }
  if (protoStart === pos || !isAsciiAlpha(state.src.charCodeAt(protoStart))) {
    return false;
  }
  const protoLength = pos - protoStart;

  const match = state.md.linkify.matchAtStart(state.src.slice(protoStart));
  if (!match || !INLINE_SCHEMES.has(match.schema.toLowerCase())) return false;

  const end = Math.min(protoStart + match.raw.length, max);
  const after = state.src.slice(end, max);
  const raw = state.src.slice(protoStart, end);
  if (!isGfmAutolink(raw, after)) return false;
  const url = raw.slice(0, trimmedLength(raw, after));
  if (url.length <= protoLength) return false;

  const href = state.md.normalizeLink(url);
  if (!state.md.validateLink(href)) return false;

  if (!silent) {
    state.pending = state.pending.slice(0, -protoLength);
    const open = state.push('link_open', 'a', 1);
    open.attrs = [['href', href]];
    open.markup = 'linkify';
    open.info = 'auto';
    const text = state.push('text', '', 0);
    text.content = state.md.normalizeLinkText(url);
    const close = state.push('link_close', 'a', -1);
    close.markup = 'linkify';
    close.info = 'auto';
  }
  state.pos += url.length - protoLength;
  return true;
}

function isAsciiAlpha(code: number): boolean {
  return (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a);
}

/** RFC 3986 scheme characters: ALPHA, DIGIT, `+`, `-`, `.`. */
function isSchemeChar(code: number): boolean {
  return (
    isAsciiAlpha(code) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2b ||
    code === 0x2d ||
    code === 0x2e
  );
}
