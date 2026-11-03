/**
 * Parser backends and token → node table conversion (Phase 1 · M1).
 *
 * Planned contents:
 * - ParserBackend interface
 * - markdown-it backend
 * - Single-pass token → node table conversion, incl. the safe raw-HTML subset
 *
 * Design:
 * - docs/rewrite/03-architecture.md#1-parser-layer
 * - docs/rewrite/phase-1/token-mapping.md
 *
 * Backends are private; only `parse()` (see ../api) is public.
 */

export {};
