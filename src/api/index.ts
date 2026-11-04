/**
 * Public v1 API surface (Phase 1 · M5).
 *
 * Contents so far:
 * - parse() → opaque MarkdownDocument (./parse, ./document)
 *
 * Planned: read-only visit(), public element/plugin/theme types (M5).
 *
 * Design:
 * - docs/rewrite/04-api.md
 *
 * Becomes the package entry point in M5; until then the v0 API in
 * ../index.tsx stays exported. `tableOf` (./document) is internal and must
 * never be re-exported from here.
 */

export type { MarkdownDocument } from './document';
export { parse, type ParseOptions } from './parse';
export type { HtmlMode, Preset } from '../parse';
