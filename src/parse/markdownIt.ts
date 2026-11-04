import markdownIt, { type MarkdownIt } from 'markdown-it';
import type { Preset } from './backend';

/**
 * Maximum block/inline nesting depth. markdown-it parses nested containers
 * recursively and overflows the JS stack on very deep input (25,000 nested
 * `>` throws `RangeError: Maximum call stack size exceeded`), so a cap is
 * required. Beyond the cap the rest of the input is kept as text.
 *
 * 100 matches markdown-it's default preset; its `commonmark` preset uses 20,
 * which real documents (deep lists) can exceed. Pathological spec inputs
 * deeper than this cannot match the spec's output and are allowlisted.
 * See docs/rewrite/phase-1/decisions.md (P1-8).
 */
export const MAX_NESTING = 100;

const instances = new Map<Preset, MarkdownIt>();

/**
 * Returns the shared markdown-it instance for a preset, creating it once.
 *
 * - `html: true`: raw HTML is always tokenized; the converter applies the
 *   `html` option (safe subset, text, strip) afterwards (D3).
 * - `linkify: false`: GFM autolinks come from the `autolinks` plugin's
 *   wrapper (P1-1, M2), never from raw linkify.
 * - `typographer: false`: no smart quotes or replacements (not CommonMark).
 * - Default `validateLink` is kept: first layer of URL sanitization (P1-3).
 *
 * In M1, `gfm` only differs by markdown-it's built-in table and
 * strikethrough rules. The GFM plugins (task lists, autolinks, footnotes,
 * tagfilter) are registered on top in M2.
 */
export function getMarkdownIt(preset: Preset): MarkdownIt {
  let md = instances.get(preset);
  if (!md) {
    md = createMarkdownIt(preset);
    instances.set(preset, md);
  }
  return md;
}

function createMarkdownIt(preset: Preset): MarkdownIt {
  const options = {
    html: true,
    linkify: false,
    typographer: false,
    maxNesting: MAX_NESTING,
  };

  if (preset === 'commonmark') {
    return markdownIt('commonmark', options);
  }

  // `default` = CommonMark rules plus table and strikethrough.
  return markdownIt('default', options);
}
