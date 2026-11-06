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

S0 measured it: the table is in [02 · Phase 2 streaming spike (S0)](../02-benchmarks.md#phase-2-streaming-spike-s0). The summary is that tail re-parse costs 10.7× at 20-character chunks and 2.0× at 195 with frame coalescing, a 50 ms flush window brings the 20-character case to 4.4×, and [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture) sets the bars accordingly. Before S0, a throwaway check on `bench/fixtures` F2 (9.5 KB), markdown-it only, Node `--jitless`, tail re-parse from the last top-level block (conversion not included), gave:

| Chunks | Naive re-parse | Tail re-parse (vs one full parse) |
|---|---|---|
| 500 (≈20 chars) | 265× | **10.4×** |
| 50 (≈195 chars) | 26× | **2.0×** |

Inside a block the cost is quadratic: about `Σ b² / (2·chunk)` over the blocks. So the roadmap's "under 2× a full parse" cannot be met by tail re-parse alone at 500 chunks; it needs a definition of what arrives when, plus coalescing. These rough numbers agreed with the S0 measurement, which includes node-table conversion.

---

## S0 · Spike & criterion

**Issue:** [#29](https://github.com/amilmohd155/react-native-markdown/issues/29)

**Goal:** measured streaming costs, and a precise exit criterion, before building anything.

- `bench/stream.mjs` (like `bench/convert.mjs`): streams F2 through the real parser and converter with the strategies below, in Node `--jitless`, and prints cost as a multiple of one full `parse()`.
  - tail re-parse per chunk, at several chunk sizes (1, 2, 20, 195 characters)
  - the same with coalescing (one parse per N ms of arrival, or per parse-cost budget)
  - the same with a fence fast path, on F2 and on the code-heavy fixture
  - the same, with the cost split by the kind of the open block (fence, table, list, other)
- Collect real LLM transcripts for the `docs/` fixture (still "to be collected" in Phase 1) and add them as chunk-size evidence. Real recordings were not available, so synthetic transcripts (`bench/fixtures/transcripts/`) stand in for now; they are labelled synthetic and do not set any bar. Real ones can replace them later, and `F4c` is re-checked at S5.
- Define the F4 fixture and the exit-criterion wording: [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture).
- Decide the coalescing policy ([P2-4](./decisions.md#p2-4-coalescing-policy)) and whether the fence fast path ships ([P2-5](./decisions.md#p2-5-open-fence-fast-path)). The code-heavy fixture (`bench/fixtures/code-heavy.md`) makes the case for shipping it.

**Done when:** the results are in [`../02-benchmarks.md`](../02-benchmarks.md), and P2-1, P2-4 and P2-5 are all `Proposed` (2×/5×, a 50 ms window and the open-fence fast path are the candidates). No `Accepted` decision is needed: all three are settled by experiments on Hermes on a real device at S5, not by the Node proxy. Real-transcript collection is deferred: synthetic transcripts stand in until then.

## S1 · Stream core

**Issue:** [#30](https://github.com/amilmohd155/react-native-markdown/issues/30)

**Goal:** a React-free `createMarkdownStream()` whose document equals a full parse after every append.

- `parseFrom(source, offset, carried, options)` for the markdown-it backend ([table-splicing.md](./table-splicing.md#parsefrom)). Contract: [P2-3](./decisions.md#p2-3-parsefrom-contract).
- Stable-block tracking and the rules in [stream-algorithm.md](./stream-algorithm.md): tail boundary, carried context (references, slugs, footnotes), full-reparse triggers.
- Splicing into a new table, and the `isSameBlock` prefix fast path ([table-splicing.md](./table-splicing.md)); the fast path does not fire through `<Block>` and the gap is accepted at S5 (measured on the S25 FE). Strategy: [P2-2](./decisions.md#p2-2-splice-strategy).
- The open-fence fast path ([stream-algorithm.md](./stream-algorithm.md#open-fenced-code-fast-path)), if P2-5 is confirmed.
- `append`, `reset`, `done` on the core, with no timers: scheduling is S2.

**Done when:**
- The equivalence harness ([testing-harness.md](./testing-harness.md#equivalence-harness)) passes for the CommonMark and GFM spec examples with seeded random chunkings, apart from a reviewed allowlist.
- Per-append work is proportional to the open block, not the document (checked by a counter in the harness: characters re-parsed per append).
- Pathological inputs stay time-bounded when streamed.
- If P2-5 is confirmed, the fence fast path passes the same equivalence harness, including its targeted cases.

## S2 · Hook & scheduler

**Issue:** [#31](https://github.com/amilmohd155/react-native-markdown/issues/31)

**Goal:** `useMarkdownStream` as in [05](../05-streaming.md#api), batching updates per [P2-4](./decisions.md#p2-4-coalescing-policy).

- Scheduler: coalesce appends between flushes ([hook-and-scheduler.md](./hook-and-scheduler.md)): `raf` and `timeout` schedules behind one contract, compared in Node, in Expo Go, on a release build and on the web before one was chosen.
- `useMarkdownStream`: stable `append`/`reset`/`done`, a new `document` handle per flush, safe under StrictMode, cancelled on unmount. Platform default: `raf` on iOS and Android, a 16 ms window on web, and `flushIntervalMs` selects the timer everywhere.
- Public typing and export through `src/api/index.ts`; `yarn check:public-types` stays green.

**Done when:**
- Hook tests pass with fake timers and a fake frame source. Done.
- Memo test: during a stream, only the open block's elements re-render ([06 · Memoization tests](../06-testing.md#renderer-tests)). Done. The `isSameBlock` prefix-fast-path assertion in it is an `it.failing` until S5 fixes the path ([P2-2 note](./decisions.md#p2-2-splice-strategy)).
- The main entry is still pure JS (`yarn check:expo-go`). Done.

**Result:** [P2-4](./decisions.md#p2-4-coalescing-policy) accepted with Node, S25 FE and web numbers ([02 · Phase 2 scheduler](../02-benchmarks.md#phase-2-scheduler-s2)); [P2-5](./decisions.md#p2-5-open-fence-fast-path) has its first device measurement. Left for S5 at the time: an iPhone (waived, P2-8), a backgrounded native app (since measured on the S25 FE: [results](../02-benchmarks.md#native-background-and-resume-s25-fe)), F4c (waived, P2-8), and the `isSameBlock` fix (gap accepted).

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

- Run [benchmark-protocol.md](./benchmark-protocol.md) on the S25 FE (Hermes release build) and web. **Done with a finding (2026-11-06):** web and S25 FE are measured with the full method; the S25 FE `core` misses the 2×/5× bars at the 50 ms window (`F4a` 6.30× / 7.11×, `F4b` 2.46× / 2.51×) because of footnote-triggered full re-parses. The bar was accepted on 2026-11-06 with a redefinition (steady-state flush cost, excluding the necessary footnote full re-parse, which is reported separately) and a waiver for documents that end in a footnote definition, the measured figures being the accepted ones ([P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture)). Option A (cheaper footnote tail) was tried and dropped ([P2-3 note](./decisions.md#p2-3-parsefrom-contract)). The footnote-free F2 variant was then measured on the S25 FE and passes the original bars at 50 ms (`F4a` 4.32× / 4.34×, `F4b` 1.42× / 1.44×; P2-1 not reopened), and native background and resume was checked on the S25 FE (no bug, no scheduler change needed). The iPhone and `F4c` are **waived and deferred** ([P2-8](./decisions.md#p2-8-iphone-run-and-f4c-deferred)).
- Write the results into [`../02-benchmarks.md`](../02-benchmarks.md) under "Device results". Web and S25 FE are written ([web](../02-benchmarks.md#phase-2-web-benchmark-s5-web-part), [S25 FE](../02-benchmarks.md#phase-2-device-benchmark-s5-s25-fe), [`isSameBlock`](../02-benchmarks.md#issameblock-comparator-s5-s25-fe)); the footnote-free variant and native background and resume are also written ([footnote-free](../02-benchmarks.md#footnote-free-variant-s25-fe), [background](../02-benchmarks.md#native-background-and-resume-s25-fe)); the iPhone and `F4c` are waived (P2-8). The results have a [summary table](../02-benchmarks.md#phase-2-device-results-summary) at the top.
- Exit review: check every item in [README](./README.md#exit-criteria). Record any waived item in [decisions.md](./decisions.md).
- Phase 1 carry-over (P1-25): **decided** in [P2-7](./decisions.md#p2-7-where-the-phase-1-carry-over-lives) (accepted 2026-11-06). No S6: items 1 to 3 go to the standalone perf-hardening issue (#36), the F5 `retainedHeap` method to the start of Phase 3, the low-end Android re-measure to a v1.0 release gate (#37). Phase 2 can close without any of it.

**Done when:** all exit criteria are checked or waived with a recorded reason. Done 2026-11-06: see the [exit review](./README.md#exit-review-2026-11-06).
