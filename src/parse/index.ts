/**
 * Parser backends and token → node table conversion (Phase 1 · M1).
 *
 * Contents:
 * - ParserBackend interface and parse options (./backend)
 * - Shared markdown-it instances per preset (./markdownIt)
 * - Single-pass token → node table conversion, incl. the safe raw-HTML subset
 *   (lands with M1)
 *
 * Design:
 * - docs/rewrite/03-architecture.md#1-parser-layer
 * - docs/rewrite/phase-1/token-mapping.md
 *
 * Backends are private; only `parse()` (see ../api) is public.
 */

export type { HtmlMode, ParseOptions, ParserBackend, Preset } from './backend';
export { getMarkdownIt, MAX_NESTING } from './markdownIt';
