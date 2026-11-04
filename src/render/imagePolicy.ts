/**
 * Which images may load: the `images` prop. Spec: docs/rewrite/04-api.md#markdown,
 * docs/rewrite/phase-1/decisions.md (P1-3, P1-21).
 *
 * - `'allow'` (default): every image markdown-it accepted.
 * - `'deny'`: no image loads; each renders as its alt text.
 * - `{ allowHosts }`: only `http(s)` images from those hosts load; the
 *   rest render as alt text. Use it (or `'deny'`) for untrusted content,
 *   where a remote image is a tracking beacon.
 */
export type ImagesPolicy =
  | 'allow'
  | 'deny'
  | { readonly allowHosts: readonly string[] };

/**
 * The host of an `http(s)` or protocol-relative URL, lowercased, without
 * port, userinfo or trailing dot. `null` for anything else (relative paths,
 * `data:` URLs) and for URLs this check can't read the way a browser would
 * (backslashes, whitespace, control characters), which a host allowlist
 * must refuse rather than guess.
 */
export function hostOf(src: string): string | null {
  // eslint-disable-next-line no-control-regex
  if (/[\s\\\u0000-\u001f\u007f]/.test(src)) return null;
  const match = /^(?:https?:)?\/\/([^/?#]*)/i.exec(src);
  if (!match) return null;

  let authority = match[1]!;
  const at = authority.lastIndexOf('@');
  if (at !== -1) authority = authority.slice(at + 1);

  let host: string;
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    if (end === -1) return null;
    host = authority.slice(0, end + 1);
  } else {
    const colon = authority.indexOf(':');
    host = colon === -1 ? authority : authority.slice(0, colon);
  }
  host = host.toLowerCase().replace(/\.$/, '');
  return host === '' ? null : host;
}

/**
 * Whether `host` matches an allowlist entry: an exact host
 * (`images.example.com`) or `*.example.com` for any subdomain (not the
 * apex itself). Comparison is case-insensitive.
 */
function hostMatches(host: string, entry: string): boolean {
  const pattern = entry.trim().toLowerCase();
  if (pattern.startsWith('*.')) {
    return host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1;
  }
  return host === pattern;
}

/** Whether an image with this `src` may load under `policy`. */
export function imageAllowed(policy: ImagesPolicy, src: string): boolean {
  if (policy === 'allow') return true;
  if (policy === 'deny') return false;
  const host = hostOf(src);
  if (host === null) return false;
  return policy.allowHosts.some((entry) => hostMatches(host, entry));
}
