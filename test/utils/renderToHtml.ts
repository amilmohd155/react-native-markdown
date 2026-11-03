import type { SpecSuite } from './specReader';

/**
 * Whether the v1 parser and the test HTML serializer exist yet.
 *
 * While `false`, the spec runner registers every example as an expected
 * failure, so the suite is green and shows the full size of the work.
 * Flip to `true` in M1 (#9), when `renderToHtml` is implemented: from then
 * on only allowlisted examples may fail.
 */
export const PARSER_IMPLEMENTED = false;

export class NotImplementedError extends Error {
  constructor() {
    super('parse() and documentToHtml() are implemented in Phase 1 · M1 (#9)');
    this.name = 'NotImplementedError';
  }
}

export interface RenderOptions {
  preset: 'commonmark' | 'gfm';
}

/**
 * Parses markdown with the v1 parser and serializes the document to HTML
 * the way the spec expects (see docs/rewrite/phase-1/testing-harness.md).
 */
export function renderToHtml(
  _markdown: string,
  _options: RenderOptions
): string {
  throw new NotImplementedError();
}

export const presetFor = (suite: SpecSuite): RenderOptions['preset'] =>
  suite === 'commonmark' ? 'commonmark' : 'gfm';

/**
 * Normalizes HTML before comparison so the check is semantic, not
 * byte-exact. This is a minimal version; M1 ports the rest of the spec's
 * `normalize.py` (attribute order, entity forms) as examples require.
 */
export function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n?/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s+\/>/g, '>')
    .trim();
}
