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
- **Context:** The roadmap says "streaming a 10 KB message costs under 2× a single full parse in total". It does not say how many chunks or when they arrive. A throwaway check (F2, markdown-it only, `--jitless`) gave tail re-parse **10.4×** at 500 chunks and **2.0×** at 50 chunks, naive re-parse 265× and 26×; see [work-breakdown](./work-breakdown.md#why-s0-comes-first). Cost inside a block is quadratic in block size over chunk size, so the answer depends on chunking and on whether chunks are coalesced.
- **Decision (proposed):** the criterion is measured on `F4a`/`F4c` ([benchmark-protocol](./benchmark-protocol.md#f4)): total flush cost, with frame coalescing as shipped, as a multiple of one full `parse()`. The bar (2×, or a revised number if S0 shows 2× is unreachable on real chunk sizes) is fixed by S0, with the evidence recorded here.
- **Consequences:** if the bar is revised or waived, it is recorded here, as P1-25 did for Phase 1. Updates `07-roadmap.md` and `06-testing.md`.

## P2-2: Splice strategy

- **Status:** Proposed
- **Date:** 2026-11-05
- **Context:** A stream update must produce a new immutable `NodeTable` sharing the closed prefix. Options A (copy), B (shared append buffer), C (chunked): [table-splicing](./table-splicing.md#splice-strategy).
- **Decision (proposed):** A (copy the prefix columns per flush), unless S0 shows the copy matters. The table is private, so this is reversible.
- **Consequences:** none on the public API. Updates `03 · Document model` only if the strategy changes the "immutable after build" wording.

## P2-3: `parseFrom` contract

- **Status:** Proposed
- **Date:** 2026-11-05
- **Context:** `parseFrom(source, offset, options)` exists on `ParserBackendImpl` without carried context. A tail-only parse loses link references, heading-slug counters and footnote state ([stream-algorithm](./stream-algorithm.md#carried-context)). A native backend (phase 4) must implement the same contract.
- **Decision (proposed):** `parseFrom(source, offset, carried, options) → { table, carried }` as in [table-splicing](./table-splicing.md#parsefrom). The carried context is an opaque backend-defined value; the stream core only passes it back.
- **Consequences:** updates `03 · Backend interface` and `src/parse/backend.ts`.

## P2-4: Coalescing policy

- **Status:** Proposed
- **Date:** 2026-11-05
- **Context:** 05 specifies at most one update per animation frame. Real LLM streams are ~one token per frame, so per-frame coalescing may not reduce parse count at all.
- **Decision (proposed):** per-frame coalescing as the baseline; add cost-adaptive throttling (minimum flush interval derived from recent flush cost, capped so text lags at most a few frames) only if S0 shows the baseline misses the bar.
- **Consequences:** if adopted, updates `05 · Rendering` and [hook-and-scheduler](./hook-and-scheduler.md#scheduler).

## P2-5: Open fence fast path

- **Status:** Proposed
- **Date:** 2026-11-05
- **Context:** 05 describes appending text to an open fenced block without a re-parse. It removes the quadratic cost for large code blocks but adds a special case that must match a full parse exactly ([stream-algorithm](./stream-algorithm.md#open-fenced-code-fast-path)).
- **Decision (proposed):** decided by S0: ship if open code blocks dominate streamed cost in F4, otherwise defer.
- **Consequences:** tests in the equivalence harness either way.

## P2-6: `hide-incomplete` semantics

- **Status:** Proposed
- **Date:** 2026-11-05
- **Context:** 05 only says "buffers trailing unclosed inline markers". Two readings: hide the dangling marker, or auto-close it.
- **Decision (proposed):** hide, applied to the open block's view only ([smoothing](./smoothing.md)).
- **Consequences:** none on `source` or on the final document.
