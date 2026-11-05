# Phase 2 · Table splicing & block identity

How a stream update becomes a new `NodeTable` cheaply, and how the renderer skips the unchanged prefix. Background: [03 · Document model](../03-architecture.md#2-document-model), [08](../08-model-and-api.md).

## `parseFrom`

`ParserBackendImpl.parseFrom` is implemented by the markdown-it backend. Contract: [P2-3](./decisions.md#p2-3-parsefrom-contract). Types: `src/stream/types.ts`.

```ts
parseFrom(
  source: string,                       // the whole source so far
  offset: number,                       // a top-level block boundary
  carried: CarriedContext | undefined,  // references, slug counters, footnote state from the prefix; undefined at offset 0
  options?: ParseOptions
): ParseFromResult
// { table, carried, prefixCarried, newReferences, hasFootnoteDefinition }
```

- Parses `source.slice(offset)`; every block offset in the result is absolute, and line numbers (`token.map`) are relative to the tail and converted internally.
- Returns a table for the **tail only** (node ids are tail-local, `source` is the whole source); the stream core splices it.
- `carried` is the context after the whole tail. `prefixCarried` is the context after the closed blocks only (all but the last real block): the seed for the next append.
- `newReferences` and `hasFootnoteDefinition` are the full-reparse trigger signals ([stream-algorithm](./stream-algorithm.md#full-reparse-triggers)).
- Line offsets: the markdown-it backend computes tail-relative offsets and adds the base, so the stream core does not keep a line-offset table.
- Footnotes: the footnote section is synthetic, with an empty range at `source.length`. The core resumes from the last **real** block. Once the prefix defines footnotes, `parseFrom` tokenizes the whole source (O(source) per append) because a tail-only parse cannot see the definitions. Accepted for S1; revisit with S5 numbers.

## Splice strategy

A stream update replaces everything from the open block onward and keeps the stable prefix. Choice: [P2-2](./decisions.md#p2-2-splice-strategy). The options, to be decided with S0's numbers:

| Option | How | Cost | Risk |
|---|---|---|---|
| **A. Copy** | New typed arrays; `set()` the prefix columns, then append the tail | One memcpy of the prefix per flush, plus copying `strings[]` and `attrs[]` (JS arrays, pointer copies) | Simple, immutable by construction. O(n) per flush, but memcpy-cheap next to a parse. |
| **B. Shared append buffer** | One growable buffer; each handle is `subarray(0, count)` views; the open block's rows are overwritten in place | O(tail) per flush | An older handle's views cover rows that a later flush overwrites, so the previous document would change under the renderer. Needs rows past `stableCount` to be copied on write. |
| **C. Chunked** | Closed blocks live in sealed chunks; a table is a list of chunks plus a live tail | O(tail) | Every reader of the table (`read.ts`, `blockIndex.ts`, serializer, `visit`) must handle chunks. Largest change. |

Recommendation until S0 measures: **A**. It keeps the "immutable after build" rule ([03](../03-architecture.md#2-document-model)) with the least change, and the flat table stays private, so B or C can replace it later without an API change. Revisit only if the copy shows up in the S0 numbers.

Whichever option is chosen, node ids in the prefix are unchanged and the tail's ids start at the first id after the prefix, so parent/child/sibling links in the tail are offset by the prefix node count. The `blocks`, `blockStart`, `blockEnd` and `blockContext` columns are concatenated the same way.

As implemented (`src/stream/splice.ts`, option A):
- Every table has a root at id 0. The prefix root is kept and the tail root dropped, so the spliced table equals a full parse, ids included. The last stable block's `nextSibling` (or the root's `firstChild` when there is no stable block) is re-linked to the first tail block.
- The prefix keeps the nodes before `blocks[stableCount]`, which drops its open block and any capacity padding. `strings` and `attrs` are truncated to the run those nodes use (they are pushed in node order), then the tail's are appended with shifted indexes.
- `stableCount` outside `[0, prefix.blockCount]` throws a `RangeError`.
- Measured: about 0.1 ms per splice at 900 blocks (Node/V8, warm). Not a Hermes number; S5 measures it.

## `isSameBlock` fast path

`isSameBlock(a, i, b, j)` ([P1-9](../phase-1/decisions.md#p1-9-block-identity-by-source-text-plus-context-and-index-keys)) compares context, block context and source text. On a stream, every flush would compare every closed block's text: 6 ms for 900 blocks on the S25 FE, because Hermes copies substrings.

Fast path: tables produced by the stream core carry a `prefixId` token. If `a` and `b` share the same `prefixId` and both indexes are below the shared `stableCount`, and `i === j` (blocks at different indexes of one prefix are different blocks), the blocks are the same by construction (the prefix was not re-parsed), and the comparison returns immediately. Otherwise it falls back to the full comparison.

Rules:
- `prefixId` changes whenever a full re-parse happens, so the fast path never survives one.
- It lives on the private `NodeTable`, not on the public handle.
- `isSameBlock` semantics for non-stream tables are unchanged.

## Handle per flush

`createDocument(table)` creates a new opaque handle each flush ([document.ts](../../../src/api/document.ts)). Handles are cheap (a frozen object and a `WeakMap` entry). Old handles are garbage once React stops referencing them.

## Memory

Each flush allocates new columns (option A). The previous flush's columns become garbage as soon as the previous document is unreferenced. S0 checks the Hermes heap growth over a 10 KB stream against one static document.
