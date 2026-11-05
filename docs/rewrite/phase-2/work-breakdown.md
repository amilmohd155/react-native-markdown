# Phase 2 · Work breakdown

**Tracking issue:** [#28 Phase 2 · Streaming](https://github.com/amilmohd155/react-native-markdown/issues/28). Each milestone below gets its own issue, which holds its status and checklist.

Milestones are listed in build order. Each one has its deliverables and a **done** check that can be verified.

## Dependency graph

```
S0 Spike & criterion ─► S1 Stream core ─► S2 Hook & scheduler ─┬─► S4 Tests & CI ─► S5 Device benchmark & exit
                              │                                │
                              └──────────► S3 Smoothing ───────┘
```

- S0 comes first: its numbers decide the coalescing policy, the splice strategy and the exit-criterion wording.
- S2 needs S1's core, but not S3: smoothing plugs in afterwards as an option.
- The S4 harness starts in S1 (the equivalence test is how S1 is developed) and grows with each milestone.

## Why S0 comes first

A throwaway check on `bench/fixtures` F2 (9.5 KB), markdown-it only, Node `--jitless`, tail re-parse from the last top-level block (conversion not included):

| Chunks | Naive re-parse | Tail re-parse (vs one full parse) |
|---|---|---|
| 500 (≈20 chars) | 265× | **10.4×** |
| 50 (≈195 chars) | 26× | **2.0×** |

Inside a block the cost is quadratic: about `Σ b² / (2·chunk)` over the blocks. So the roadmap's "under 2× a full parse" cannot be met by tail re-parse alone at 500 chunks; it needs a definition of what arrives when, plus some of: frame coalescing, cost-adaptive throttling, and cheaper work on the open block. These are rough numbers; S0 replaces them with measured ones that include node-table conversion.

---

## S0 · Spike & criterion

**Issue:** [#29](https://github.com/amilmohd155/react-native-markdown/issues/29)

**Goal:** measured streaming costs, and a precise exit criterion, before building anything.

- `bench/stream.mjs` (like `bench/convert.mjs`): streams F2 through the real parser and converter with the strategies below, in Node `--jitless`, and prints cost as a multiple of one full `parse()`.
  - tail re-parse per chunk, at several chunk sizes (1, 2, 20, 195 characters)
  - the same with coalescing (one parse per N ms of arrival, or per parse-cost budget)
  - the same with a fence fast path
- Collect real LLM transcripts for the `docs/` fixture (still "to be collected" in Phase 1) and add them as chunk-size evidence.
- Define the F4 fixture and the exit-criterion wording: [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture).
- Decide the coalescing policy ([P2-4](./decisions.md#p2-4-coalescing-policy)) and whether the fence fast path ships ([P2-5](./decisions.md#p2-5-open-fence-fast-path)).

**Done when:** the results are in [`../02-benchmarks.md`](../02-benchmarks.md), and P2-1, P2-4 and P2-5 are `Accepted`.

## S1 · Stream core

**Issue:** [#30](https://github.com/amilmohd155/react-native-markdown/issues/30)

**Goal:** a React-free `createMarkdownStream()` whose document equals a full parse after every append.

- `parseFrom(source, offset, context, options)` for the markdown-it backend ([table-splicing.md](./table-splicing.md#parsefrom)). Contract: [P2-3](./decisions.md#p2-3-parsefrom-contract).
- Stable-block tracking and the rules in [stream-algorithm.md](./stream-algorithm.md): tail boundary, carried context (references, slugs, footnotes), full-reparse triggers.
- Splicing into a new table, and the `isSameBlock` prefix fast path ([table-splicing.md](./table-splicing.md)). Strategy: [P2-2](./decisions.md#p2-2-splice-strategy).
- `append`, `reset`, `done` on the core, with no timers: scheduling is S2.
- The open-fence fast path, if S0 says to ship it.

**Done when:**
- The equivalence harness ([testing-harness.md](./testing-harness.md#equivalence-harness)) passes for the CommonMark and GFM spec examples with seeded random chunkings, apart from a reviewed allowlist.
- Per-append work is proportional to the open block, not the document (checked by a counter in the harness: characters re-parsed per append).
- Pathological inputs stay time-bounded when streamed.

## S2 · Hook & scheduler

**Issue:** [#31](https://github.com/amilmohd155/react-native-markdown/issues/31)

**Goal:** `useMarkdownStream` as in [05](../05-streaming.md#api), batching updates per animation frame.

- Scheduler: coalesce appends within a frame, policy per P2-4 ([hook-and-scheduler.md](./hook-and-scheduler.md)).
- `useMarkdownStream`: stable `append`/`reset`/`done`, a new `document` handle per flush, safe under StrictMode, cancelled on unmount.
- Public typing and export through `src/api/index.ts`; `yarn check:public-types` stays green.

**Done when:**
- Hook tests pass with fake timers and `requestAnimationFrame`.
- Memo test: during a stream, only the open block's elements re-render ([06 · Memoization tests](../06-testing.md#renderer-tests)).
- The main entry is still pure JS (`yarn check:expo-go`).

## S3 · Smoothing

**Issue:** [#32](https://github.com/amilmohd155/react-native-markdown/issues/32)

**Goal:** optional `smoothing: 'hide-incomplete'`, default off ([smoothing.md](./smoothing.md)). Semantics: [P2-6](./decisions.md#p2-6-hide-incomplete-semantics).

**Done when:** the smoothing cases in [smoothing.md](./smoothing.md#test-cases) pass, and with smoothing off the output is byte-identical to S2's.

## S4 · Tests & CI

**Issue:** [#33](https://github.com/amilmohd155/react-native-markdown/issues/33)

**Goal:** the streaming rows of [06](../06-testing.md) green on all platforms.

- Equivalence harness over all fixtures, targeted cases and chunkers.
- `perf/perf.test.tsx` gains the streaming metric (the 06 placeholder "phase 2, nothing to measure yet"), with a baseline.
- Web job runs the hook tests under `react-native-web`.

**Done when:** every job in [testing-harness.md · CI jobs](./testing-harness.md#ci-jobs) is green and required on `v1`.

## S5 · Device benchmark & exit review

**Issue:** [#34](https://github.com/amilmohd155/react-native-markdown/issues/34)

**Goal:** show the exit criteria are met on real devices.

- Run [benchmark-protocol.md](./benchmark-protocol.md) on the S25 FE (Hermes release build) and web.
- Write the results into [`../02-benchmarks.md`](../02-benchmarks.md) under "Device results".
- Exit review: check every item in [README](./README.md#exit-criteria). Record any waived item in [decisions.md](./decisions.md).

**Done when:** all exit criteria are checked or waived with a recorded reason.
