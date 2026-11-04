import { tableOf } from '../../src/api/document';
import { parse } from '../../src/api/parse';
import { GFM_PLUGINS, type Preset } from '../../src/plugins';
import { documentToHtml } from './documentToHtml';
import type { SpecSuite } from './specReader';

/** Spec suites (and the pathological cases) run against the v1 parser. */
export type SuiteName = SpecSuite | 'pathological';

/**
 * Suites the v1 parser is expected to pass. Others are registered as
 * expected failures, so the run stays green while showing the remaining
 * work. CommonMark is on from M1 (#9); the GFM suites from M2 (#10).
 */
export const IMPLEMENTED_SUITES: ReadonlySet<SuiteName> = new Set<SuiteName>([
  'commonmark',
  'gfm',
  'gfm-extensions',
  'pathological',
]);

export interface RenderOptions {
  preset: Preset;
}

/**
 * Parses markdown with the v1 parser and serializes the document to HTML the
 * way the spec expects. `html: 'text'` keeps every tag as a literal node,
 * which the serializer prints unescaped: the spec's raw-HTML passthrough.
 */
export function renderToHtml(markdown: string, options: RenderOptions): string {
  const doc = parse(markdown, { preset: options.preset, html: 'text' });
  return documentToHtml(tableOf(doc));
}

/** Extension names on cmark-gfm's `example <name>` fences → our built-in plugins. */
const EXTENSION_PLUGINS: Record<string, string> = {
  table: 'tables',
  strikethrough: 'strikethrough',
  autolink: 'autolinks',
  tagfilter: 'tagfilter',
  tasklist: 'taskLists',
};

/**
 * The preset an example runs with, as cmark-gfm's own spec runner does:
 * - `commonmark`: the CommonMark preset.
 * - `gfm` (spec.txt): only the extension named on the example's fence, so
 *   untagged examples are plain CommonMark (e.g. `http://example.com` is not
 *   a link there).
 * - `gfm-extensions`: every extension.
 * See docs/rewrite/phase-1/decisions.md (P1-12).
 */
export function presetFor(
  suite: SpecSuite,
  extension: string | null = null
): RenderOptions['preset'] {
  if (suite === 'commonmark') return 'commonmark';
  if (suite === 'gfm-extensions') return 'gfm';
  if (extension === null) return 'commonmark';
  const only = EXTENSION_PLUGINS[extension];
  if (!only) throw new Error(`Unknown GFM spec extension "${extension}"`);
  return {
    base: 'gfm',
    exclude: GFM_PLUGINS.map((p) => p.name).filter((name) => name !== only),
  };
}

/**
 * Normalizes line endings only. The serializer matches the spec's HTML
 * conventions, so comparison is otherwise exact (stricter than the spec's
 * own normalize.py, which would hide whitespace differences).
 */
export function normalizeHtml(html: string): string {
  return html.replace(/\r\n?/g, '\n');
}
