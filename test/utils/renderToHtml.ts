import { tableOf } from '../../src/api/document';
import { parse } from '../../src/api/parse';
import { documentToHtml } from './documentToHtml';
import type { SpecSuite } from './specReader';

/** Spec suites (and the pathological cases) run against the v1 parser. */
export type SuiteName = SpecSuite | 'pathological';

/**
 * Suites the v1 parser is expected to pass. Others are registered as
 * expected failures, so the run stays green while showing the remaining
 * work. CommonMark is on from M1 (#9); the GFM suites join in M2 (#10).
 */
export const IMPLEMENTED_SUITES: ReadonlySet<SuiteName> = new Set<SuiteName>([
  'commonmark',
  'pathological',
]);

export interface RenderOptions {
  preset: 'commonmark' | 'gfm';
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

export const presetFor = (suite: SpecSuite): RenderOptions['preset'] =>
  suite === 'commonmark' ? 'commonmark' : 'gfm';

/**
 * Normalizes line endings only. The serializer matches the spec's HTML
 * conventions, so comparison is otherwise exact (stricter than the spec's
 * own normalize.py, which would hide whitespace differences).
 */
export function normalizeHtml(html: string): string {
  return html.replace(/\r\n?/g, '\n');
}
