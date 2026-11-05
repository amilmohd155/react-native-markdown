/**
 * Pinned S1 interfaces (phase 2). Shared by the parseFrom, splice, stream
 * core and equivalence-harness work. Change only by agreement: several
 * workstreams code against these in parallel.
 *
 * Design: docs/rewrite/phase-2/{stream-algorithm,table-splicing}.md,
 * decisions P2-2 (splice), P2-3 (parseFrom).
 */
import type { NodeTable } from '../model';
import type { ParseOptions } from '../parse/backend';

declare const carriedBrand: unique symbol;

/**
 * What the stable prefix contributes to a tail parse: link reference
 * definitions, heading-slug counters, footnote numbering state. Opaque and
 * backend-defined (P2-3): the stream core only stores it and passes it back
 * to the backend that produced it. Never mutated after being returned.
 */
export interface CarriedContext {
  readonly [carriedBrand]: true;
}

export interface ParseFromResult {
  /**
   * Table for the tail only. Offsets (`blockStart`, `blockEnd`) are absolute
   * in `source`; `token.map` lines are shifted by the line of `offset`.
   * Node ids are local to this table (start at 0); the splice offsets them.
   * `source` is the WHOLE source (not the slice). `context` is the full
   * document context string (including merged references), so it equals
   * what a full parse of `source` would produce when nothing relevant changed.
   */
  readonly table: NodeTable;
  /**
   * Carried context AFTER the whole tail: the input merged with whatever
   * the tail defined.
   */
  readonly carried: CarriedContext;
  /**
   * Carried context after the closed blocks of this parse only (all blocks
   * except the last): the seed for the NEXT append, which re-parses from
   * the last block. Equal to the input `carried` when the tail has a single
   * block.
   */
  readonly prefixCarried: CarriedContext;
  /** True if the tail defines link references not present in the seed (full-reparse trigger). */
  readonly newReferences: boolean;
  /** True if the tail contains a footnote definition (full-reparse trigger). */
  readonly hasFootnoteDefinition: boolean;
}

/** `ParserBackendImpl.parseFrom` (P2-3). `offset` must be a top-level block boundary. */
export type ParseFrom = (
  source: string,
  offset: number,
  carried: CarriedContext | undefined, // undefined = offset 0 / empty prefix
  options?: ParseOptions
) => ParseFromResult;

/**
 * Splice (S1.3, P2-2 option A). New immutable table =
 *   prefix blocks [0, stableCount)  +  every block of `tail`.
 * Prefix node ids are unchanged; tail ids are shifted by the prefix node
 * count (parent/firstChild/nextSibling/text/attr indexes remapped; `-1`
 * stays `-1`). `blocks/blockStart/blockEnd/blockContext` are concatenated.
 * `source`/`context`/`pluginNodes` come from `tail`. The result carries
 * `prefixId` and `stableCount` (see NodeTable additions) so `isSameBlock`
 * can take the fast path. Pure; never mutates its inputs.
 */
export type SpliceTables = (
  prefix: NodeTable,
  stableCount: number,
  tail: NodeTable,
  prefixId: object
) => NodeTable;

/** Per-flush work stats, for tests (equivalence harness work counter). */
export interface FlushStats {
  /** Characters handed to the parser by this flush. */
  readonly charsReparsed: number;
  /** True when a full-reparse trigger (or done/reset) re-parsed everything. */
  readonly fullReparse: boolean;
  /** Which path ran. */
  readonly path: 'tail' | 'full' | 'fence-fast-path';
}

/** React-free stream core (S1.5). No timers: every `append` parses now. */
export interface MarkdownStreamCore {
  /** Appends text and re-parses the open block (or all, on a trigger). Returns the new table. */
  append(chunk: string): NodeTable;
  /** Final flush: result equals a full parse of the source. */
  done(): NodeTable;
  /** New stream; optional initial source. Starts a new `prefixId`. */
  reset(source?: string): NodeTable;
  /** Current table (equal to `parse(source so far)`). */
  readonly table: NodeTable;
  readonly source: string;
  /** Stats of the most recent append/done/reset. Test-only; not public API. */
  readonly lastFlush: FlushStats;
}

export type CreateMarkdownStreamCore = (
  options?: ParseOptions
) => MarkdownStreamCore;
