# Phase 2 · Implementation decisions

These are decisions made while building Phase 2, numbered `P2-n`. Design-level decisions (`D1`–`D8`) live in the [roadmap decision log](../07-roadmap.md#decisions); Phase 1's are `P1-n` in [../phase-1/decisions.md](../phase-1/decisions.md). A P2 decision that changes the design must also update the design doc it affects.

**Status values:** `Proposed` (awaiting agreement), `Accepted`, `Superseded by P2-n`.

## Template

```md
## P2-n: Title
- **Status:** Proposed | Accepted | Superseded by P2-x
- **Date:** YYYY-MM-DD
- **Context:** what forced the decision (link evidence)
- **Decision:** what we do
- **Consequences:** what changes, what it costs, which docs were updated
```

---

## P2-1: Exit criterion wording and the F4 fixture

- **Status:** Proposed
- **Date:** 2026-11-05
- **Context:** The roadmap says "streaming a 10 KB message costs under 2× a single full parse in total". It does not say how many chunks or when they arrive. A throwaway check gave tail re-parse 10.4× at 500 chunks and 2.0× at 50 chunks. S0 re-measured with the real parser and converter ([results](../02-benchmarks.md#phase-2-streaming-spike-s0)): at 20-character chunks the tail re-parse costs 10.7× with frame coalescing and 11.3× with no window, and a flush has a per-flush floor, so cheaper work alone does not reach 2×. Only a long flush window does: 200 ms gives 1.84× at about 96 ms mean lag, which is too visible. At 195-character chunks every window up to 100 ms stays at 2.0 to 2.2×.
- **Decision (proposed; the bars are provisional and get settled by experiments on a real device, together with [P2-4](#p2-4-coalescing-policy)):** the criterion is `streamCost`: total flush cost with the default coalescing window ([P2-4](#p2-4-coalescing-policy); 50 ms is provisional until it is tested on a device), as a multiple of one full `parse()` of the same text. It must be at most **2×** on `F4b` (50 chunks of about 195 characters, 16 ms paced) and at most **5×** on `F4a` (500 chunks of about 20 characters). The original "2× on a 500-chunk stream" is waived for the 20-character case. `F4c` (a real transcript) is re-checked at S5, and the bar is re-confirmed or revised then. The 5× figure assumes the 50 ms window, so it moves if P2-4 changes the window.
- **Consequences:** if accepted, the waiver is recorded here and in the roadmap, as [P1-25](../phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) did for Phase 1. The `F4c` transcripts in `bench/fixtures/transcripts/` are synthetic (no API key or recording was available), so they do not set the bar; real ones must be recorded before S5. Splice cost and React commit are not in the S0 numbers; S1 and S5 measure them. Updates `07-roadmap.md`, `06-testing.md`, [benchmark-protocol](./benchmark-protocol.md#f4), [work-breakdown](./work-breakdown.md#why-s0-comes-first) and the checklist in the [README](./README.md#exit-criteria).

## P2-2: Splice strategy

- **Status:** Accepted (2026-11-05). Implemented in S1 (`src/stream/splice.ts`): about 0.105 ms per splice at 900 blocks on Node, [measured](../02-benchmarks.md#s1-stream-core-node-proxy). Re-measure on Hermes at S5; the table is private, so B or C can still replace A.
- **Date:** 2026-11-05
- **Context:** A stream update must produce a new immutable `NodeTable` sharing the closed prefix. Options A (copy), B (shared append buffer), C (chunked): [table-splicing](./table-splicing.md#splice-strategy). S0 did not measure splice cost (the splice does not exist yet), so it gave no evidence that the copy matters; S1 measures it.
- **Decision (proposed):** A (copy the prefix columns per flush), unless S0 shows the copy matters. The table is private, so this is reversible.
- **Consequences:** none on the public API. Updates `03 · Document model` only if the strategy changes the "immutable after build" wording.

## P2-3: `parseFrom` contract

- **Status:** Accepted (2026-11-05). Implemented in S1 for the markdown-it backend; types in `src/stream/types.ts`.
- **Date:** 2026-11-05
- **Context:** `parseFrom(source, offset, options)` exists on `ParserBackendImpl` without carried context. A tail-only parse loses link references, heading-slug counters and footnote state ([stream-algorithm](./stream-algorithm.md#carried-context)). A native backend (phase 4) must implement the same contract.
- **Decision (proposed):** `parseFrom(source, offset, carried, options) → { table, carried, prefixCarried, newReferences, hasFootnoteDefinition }` (`ParseFromResult`, `src/stream/types.ts`) as in [table-splicing](./table-splicing.md#parsefrom). The carried context is an opaque backend-defined value; the stream core only passes it back. `prefixCarried` seeds the next append, and the two flags drive the full-reparse triggers. The markdown-it backend implements it; with footnotes defined in the prefix it tokenizes the whole source (accepted for S1, revisit at S5).
- **Consequences:** updates `03 · Backend interface` and `src/parse/backend.ts`.

## P2-4: Coalescing policy

- **Status:** Proposed
- **Date:** 2026-11-05
- **Context:** 05 specified at most one update per animation frame. Real LLM streams are about one token per frame, so per-frame coalescing may not reduce parse count, and S0 confirmed it ([results](../02-benchmarks.md#phase-2-streaming-spike-s0)). At 20-character chunks (487 flushes with no window): no window 11.3×, 16 ms 11.3×, 33 ms 6.14× (mean/max lag 16.1/32.5 ms), 50 ms 4.36× (24.1/48.7 ms), 100 ms 2.72× (48.2/96.7 ms), 200 ms 1.84× (96.3/192.7 ms). Each flush costs about 0.37 ms in Node, far below a frame, so cost-adaptive throttling never engaged.
- **Decision (proposed):** a fixed flush window, with **50 ms** as the candidate default, to be confirmed or changed once it can be tested on Hermes on a real device (S5; the S0 numbers are Node `--jitless` only). The shape: a leading flush on the first chunk, then at most one flush per window, with a trailing flush guaranteed so the last chunk is never left unflushed. The window is configurable through a `flushIntervalMs` option on the hook and the scheduler. Cost-adaptive throttling is deferred: it only helps on a device where a flush costs a large part of a frame (about 0.4 ms in Node, estimated about 1 ms on Hermes). Revisit if S5 shows a flush p90 above one frame.
- **Consequences:** if 50 ms is kept, 4.4× at 20-character chunks with about 24 ms mean lag. Updates `05 · Rendering` and [hook-and-scheduler](./hook-and-scheduler.md#scheduler). [smoothing](./smoothing.md) is about what the open block shows, not about flush cadence, and does not say whether text appears per frame. Whether smoothing should give per-frame visual updates between 50 ms flushes is an open point for S3, not decided here.

## P2-5: Open fence fast path

- **Status:** Accepted (2026-11-05). Ships in Phase 2: implemented in S1 and the equivalence harness matches a full parse with it on and off (1400 tests, no allowlist entries). The device measurement on Hermes at S5 is still to be taken and can only turn it off (`FENCE_FAST_PATH_DEFAULT` in `src/stream/createMarkdownStream.ts`), not change the equivalence requirement.
- **Date:** 2026-11-05
- **Context:** 05 describes appending text to an open fenced block without a re-parse ([stream-algorithm](./stream-algorithm.md#open-fenced-code-fast-path)). On F2 the case for it is weak: fenced code is 4.6% of tail flush cost at 20-character chunks and 13.4% at 195, tables are 33.6% and 17.2%, lists 23.8% and 18.7%, and the fast path skipped 78 of 487 flushes and saved about 1.5% of total cost (10.5× against 10.7×). A code-heavy stream is different ([results](../02-benchmarks.md#code-heavy-fixture)): on `bench/fixtures/code-heavy.md` (5.6 KB, one ~4.5 KB fence) the open fence is 89.0% of flush cost at 20 characters and 86.2% at 195. The fast path takes `streamCost` from 56.9× to 7.24× at 20 characters (249 of 281 flushes skipped) and from 6.79× to 1.63× at 195, with no added lag, while a 50 ms window alone still leaves 19.1×. The multiples are inflated by a tiny full-parse denominator: absolute cost is 37 ms against 4.7 ms for the whole stream, about 100 ms against 13 ms on Hermes. The spike's fast path only appended text and did not build a document, so it showed no equivalence with a full parse.
- **Decision (proposed):** ship the open-fence fast path in Phase 2, to be confirmed with device measurements (together with [P2-1](#p2-1-exit-criterion-wording-and-the-f4-fixture) and [P2-4](#p2-4-coalescing-policy), on Hermes on a real device at S5) and an equivalence test. It ships only if the equivalence harness shows it matches a full parse.
- **Consequences:** the equivalence harness must cover it ([testing-harness](./testing-harness.md#targeted-cases)): randomized chunking, including fences split mid-marker, closing-fence candidates, indented fences, and fences inside lists and quotes falling back to the normal path. The [stream-algorithm](./stream-algorithm.md#open-fenced-code-fast-path) section is active again. Tables and lists remain the next place to look for open-block cost. Whether a ratio is the right bar for code-heavy streams is a P2-1 question (`F4d`, [benchmark-protocol](./benchmark-protocol.md#f4)).

## P2-6: `hide-incomplete` semantics

- **Status:** Accepted (2026-11-05), implemented in S3.
- **Date:** 2026-11-05
- **Context:** 05 only says "buffers trailing unclosed inline markers". Two readings: hide the dangling marker, or auto-close it.
- **Decision:** hide, applied to the open block's view only ([smoothing](./smoothing.md)). No extra one-word lag; nested runs are cut at the earliest unclosed opener ([details](./smoothing.md#semantics)). The stream core keeps its exact table for resuming, and only the table it returns is the smoothed view: the open block is parsed again from the smoothed text, and only when smoothing changed the text (otherwise the returned table is the exact one). `done()` and `reset()` return the exact parse.
- **Consequences:** none on `source` or on the final document. Costs a second parse of the open block on flushes where a fragment is hidden. Smoothing does not give per-frame visual updates between flushes (the open point in [P2-4](#p2-4-coalescing-policy)): it changes what a flush shows, not when.
