import type { Delimiter, MarkdownIt, StateInline } from 'markdown-it';

const TILDE = 0x7e;

/**
 * GFM strikethrough, following cmark-gfm's `strikethrough` extension rather
 * than markdown-it's core rule, which needs `~~` and splits longer runs.
 * Spec: GFM spec "Strikethrough (extension)", test/fixtures/gfm/extensions.txt
 *
 * - A run of one or two `~` is a delimiter; a run of three or more is text.
 * - Left-flanking runs can open, right-flanking runs can close.
 * - A closer pairs with the nearest open `~` delimiter, only if both runs
 *   have the same length. Otherwise the closer is dropped (stays text), as
 *   in cmark-gfm.
 *
 * Installed with `ruler.at`, so the rules keep markdown-it's names and
 * positions (`strikethrough` in `inline.ruler` and `inline.ruler2`).
 */
export function gfmStrikethrough(md: MarkdownIt): void {
  md.inline.ruler.at('strikethrough', tokenize);
  md.inline.ruler2.before('balance_pairs', 'strikethrough_pairs', pairAll);
  md.inline.ruler2.at('strikethrough', postProcessAll);
  md.enable('strikethrough');
}

function tokenize(state: StateInline, silent: boolean): boolean {
  if (silent || state.src.charCodeAt(state.pos) !== TILDE) return false;
  const scanned = state.scanDelims(state.pos, true);
  const run = '~'.repeat(scanned.length);

  const token = state.push('text', '', 0);
  token.content = run;
  if (scanned.length <= 2 && (scanned.can_open || scanned.can_close)) {
    state.delimiters.push({
      marker: TILDE,
      length: scanned.length,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close,
    });
  }
  state.pos += scanned.length;
  return true;
}

/** Runs before `balance_pairs`, on each delimiter list (one per link level). */
function pairAll(state: StateInline): void {
  pair(state.delimiters);
  for (const meta of state.tokens_meta) {
    if (meta?.delimiters) pair(meta.delimiters);
  }
}

/**
 * Pairs `~` delimiters with a stack of open ones, so it stays linear on
 * pathological input. Afterwards every `~` delimiter is neither open nor
 * close, so `balance_pairs` (emphasis) leaves them alone.
 */
function pair(delimiters: Delimiter[]): void {
  const openers: number[] = [];
  for (let i = 0; i < delimiters.length; i++) {
    const delim = delimiters[i]!;
    if (delim.marker !== TILDE) continue;

    if (delim.close && openers.length > 0) {
      const openerIndex = openers.pop()!;
      const opener = delimiters[openerIndex]!;
      if (opener.length === delim.length) opener.end = i;
      else openers.push(openerIndex); // mismatch: drop the closer only
    } else if (delim.open) {
      openers.push(i);
    }
    delim.open = false;
    delim.close = false;
  }
}

function postProcessAll(state: StateInline): void {
  postProcess(state, state.delimiters);
  for (const meta of state.tokens_meta) {
    if (meta?.delimiters) postProcess(state, meta.delimiters);
  }
}

/** Turns paired runs into `s_open` / `s_close`, as markdown-it's rule does. */
function postProcess(state: StateInline, delimiters: Delimiter[]): void {
  for (const start of delimiters) {
    if (start.marker !== TILDE || start.end === -1) continue;
    const end = delimiters[start.end]!;
    const open = state.tokens[start.token]!;
    const close = state.tokens[end.token]!;
    const markup = open.content;
    open.type = 's_open';
    open.tag = 's';
    open.nesting = 1;
    open.markup = markup;
    open.content = '';
    close.type = 's_close';
    close.tag = 's';
    close.nesting = -1;
    close.markup = markup;
    close.content = '';
  }
}
