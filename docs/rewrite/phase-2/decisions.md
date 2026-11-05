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
- **Note (2026-11-05, S2.5), found by the memo test, not changing the decision above:** the `isSameBlock` prefix fast path ([table-splicing](./table-splicing.md)) never fires through `<Block>`. `Block`'s memo compares the props of its last render with the new ones, so a block's retained table is the one it was last rendered with, from when it was still the open block; `i < stableCount` is then never true for that table, and closed blocks fall back to the source-text comparison. Over a test stream no comparison took the fast path. Rendering is still right (only the open block re-renders) but the saving the splice section claims (about 6 ms per flush at 900 blocks on the S25 FE) is not realized. Deferred to S5: options are to compare against the previous flush's table (preferred), or to track the last verified table per block. `src/api/__tests__/streamMemo.test.tsx` holds an `it.failing` that starts failing once the fast path works, which is the cue to make it a plain `it`.

## P2-3: `parseFrom` contract

- **Status:** Accepted (2026-11-05). Implemented in S1 for the markdown-it backend; types in `src/stream/types.ts`.
- **Date:** 2026-11-05
- **Context:** `parseFrom(source, offset, options)` exists on `ParserBackendImpl` without carried context. A tail-only parse loses link references, heading-slug counters and footnote state ([stream-algorithm](./stream-algorithm.md#carried-context)). A native backend (phase 4) must implement the same contract.
- **Decision (proposed):** `parseFrom(source, offset, carried, options) → { table, carried, prefixCarried, newReferences, hasFootnoteDefinition }` (`ParseFromResult`, `src/stream/types.ts`) as in [table-splicing](./table-splicing.md#parsefrom). The carried context is an opaque backend-defined value; the stream core only passes it back. `prefixCarried` seeds the next append, and the two flags drive the full-reparse triggers. The markdown-it backend implements it; with footnotes defined in the prefix it tokenizes the whole source (accepted for S1, revisit at S5).
- **Consequences:** updates `03 · Backend interface` and `src/parse/backend.ts`.

## P2-4: Coalescing policy

- **Status:** Accepted (2026-11-05). Implemented in S2 (`src/stream/scheduler.ts`, `src/api/useMarkdownStream.ts`) and measured in Node, on the S25 FE (Hermes release) and on the web ([results](../02-benchmarks.md#phase-2-scheduler-s2)). iOS, native background behaviour and a real LLM transcript (F4c) are not measured; they are S5 items.
- **Date:** 2026-11-05
- **Context:** 05 specified at most one update per animation frame. Real LLM streams are about one token per frame, so per-frame coalescing may not reduce parse count, and S0 confirmed it ([results](../02-benchmarks.md#phase-2-streaming-spike-s0)). At 20-character chunks (487 flushes with no window): no window 11.3×, 16 ms 11.3×, 33 ms 6.14× (mean/max lag 16.1/32.5 ms), 50 ms 4.36× (24.1/48.7 ms), 100 ms 2.72× (48.2/96.7 ms), 200 ms 1.84× (96.3/192.7 ms). Each flush costs about 0.37 ms in Node, far below a frame, so cost-adaptive throttling never engaged.
- **Decision:** the default depends on the platform, and an explicit window overrides it.
  - **iOS and Android:** one flush per animation frame (`requestAnimationFrame`). There is no leading flush: the first chunk after an idle period waits for the next frame.
  - **Web:** a fixed window of **16 ms** on a timer: a leading flush on the first chunk, then at most one flush per window, with a trailing flush at the end of a window that buffered anything, so the last chunk is never left unflushed.
  - **`flushIntervalMs` given:** that window on a timer, on every platform. This is the escape hatch for anyone who wants timer batching on a device.
  - Where `requestAnimationFrame` does not exist (Node, SSR, some test environments) the frame schedule falls back to a 16 ms timer. The scheduler stays React-free; the hook picks the default (`Platform.OS`).
  - Cost-adaptive throttling stays deferred. The revisit criterion ("flush p90 above one frame") did not trigger: on the S25 FE release build the flush p90 was 2.4 to 5.6 ms for every window up to 50 ms, and at most 12.3 ms at the 100 ms window, against a 16.7 ms frame. A single flush occasionally costs 25 to 54 ms in every configuration (max), which accounts for most of the frame-gap maximum.
- **Evidence** (full tables in [02-benchmarks](../02-benchmarks.md#phase-2-scheduler-s2); `bench/results/scheduler-*`):

  | Where | What it showed |
  |---|---|
  | Node `--jitless` (simulated 60 Hz frames, F2, 20-character chunks at 1250 chars/s) | `raf` flushes 467 times against 157 for `timeout@50`, about 2.7× the total cost (18.4× against 6.7× one full parse), for a lower, bounded latency (p50 8 ms, max 17 ms, against p50 24 ms, max 49 ms). Frames are simulated and React commit is not included, so this is indicative only. |
  | S25 FE, Expo Go (dev build) | Misleading. `timeout@50` dropped 8 to 14% of frames against 1.6 to 2.1% for `raf`; on the release build both drop 2 to 3%. Dev-mode overhead made the larger `timeout` commits miss frames. Not used for the decision. |
  | S25 FE, Hermes release, F2 | Dropped frames 1.6 to 3.3% for every schedule, so frame health does not separate them. Append-to-commit latency p50 / p90: `timeout@16` 22 / 36 ms, `@33` 34 / 51 ms, `@50` 43 / 64 ms, `@100` 76 / 116 ms, `raf` 15 / 21 ms. Flush cost sum over a 7.9 s stream: 571, 511, 463 and 436 ms for the four windows, 684 ms for `raf` (about 1.5× `timeout@50`). |
  | Web, headless Chromium 156, 4× CPU throttle, minified export, F2 | A flush costs under 1 ms at p90, so the schedule changes latency and commit count, not frame health. Latency p50 / p90: `timeout@16` 9 / 16 ms, `@33` 17 / 25 ms, `@50` 23 / 42 ms, `@100` 50 / 87 ms, `raf` 13 / 17 ms. Dropped frames 0 to 2.4%. |
  | Web, hidden tab (headed, one run each) | `raf` still finished and the document was correct, but took 27.1 s against 7.8 s in the foreground, with a longest gap between flushes of 6.5 s. `timeout@50` took 7.8 s with no stall. A single run each, and some of the stall may come from tab-switch timing. |

- **Rejected alternatives:**
  - **`timeout@33` everywhere** (simplest; about 34 ms latency on the device). It works on every platform, but gives up about 19 ms of latency on iOS and Android, where `raf` has no known downside, for no gain over the split.
  - **Visibility hybrid** (`raf` while visible, a timer while hidden). It needs a visibility signal on every platform (`document.visibilityState` on the web, `AppState` on native) and re-scheduling on every change. The only problem it fixes is a hidden web tab, which the web default already avoids, and on native the OS suspends frames and timers in the background anyway.
  - **Plain `raf` everywhere.** A hidden browser tab stalls it (27 s instead of 8 s), which matters for a chat answer that keeps arriving while the user is in another tab.
  - **A 50 ms window as the default** (this decision's earlier proposal). On web it cuts the flush count to about a third of 16 ms's (147 against 468) at the price of about 14 ms more median latency, to save work that is already small, because a web flush costs under 1 ms.
- **Caveats:**
  - **Display refresh rate.** Midway through the F4d device runs the S25 FE's display dropped from 120 Hz to 60 Hz (frame-gap p50 about 16.7 ms instead of about 8.5 ms, about half the frame samples, about half the `raf` flushes). Those four runs are excluded from every comparison and flagged `display60Hz` in the saved JSON. The F2 runs were all at 120 Hz. It also means the `raf` flush rate follows the display's refresh rate (up to the chunk rate), so `raf` costs less CPU on a 60 Hz phone than the numbers above.
  - **Not measured:** an iPhone (none available; `raf` there runs on `CADisplayLink`, which is expected to behave but is untested), and what a backgrounded native app does with buffered text (it should flush when frames resume; there is a unit test for the suspend and resume path, not a device check).
- **Consequences:** Updates `05 · Rendering`, [hook-and-scheduler](./hook-and-scheduler.md#scheduler) and [02-benchmarks](../02-benchmarks.md#phase-2-scheduler-s2). The 5× `F4a` bar of [P2-1](#p2-1-exit-criterion-wording-and-the-f4-fixture) assumed a 50 ms window; with a 16 ms or per-frame schedule the `streamCost` multiple is higher (about 18× in Node for `raf`), so P2-1 must be re-read in that light at S5, with the device cost in absolute milliseconds (the sum of flush costs over the stream was 436 to 684 ms for 7.9 s of F2 on the S25 FE). [smoothing](./smoothing.md) is about what the open block shows, not about flush cadence, and does not say whether text appears per frame.

## P2-5: Open fence fast path

- **Status:** Accepted (2026-11-05). Ships in Phase 2: implemented in S1 and the equivalence harness matches a full parse with it on and off (1400 tests, no allowlist entries). First device measurement taken in S2 (see **Device result** below): it halves flush cost on the code-heavy stream and changes nothing else. The remaining S5 check (iOS, absolute cost on `F4d`) can only turn it off (`FENCE_FAST_PATH_DEFAULT` in `src/stream/createMarkdownStream.ts`), not change the equivalence requirement.
- **Date:** 2026-11-05
- **Context:** 05 describes appending text to an open fenced block without a re-parse ([stream-algorithm](./stream-algorithm.md#open-fenced-code-fast-path)). On F2 the case for it is weak: fenced code is 4.6% of tail flush cost at 20-character chunks and 13.4% at 195, tables are 33.6% and 17.2%, lists 23.8% and 18.7%, and the fast path skipped 78 of 487 flushes and saved about 1.5% of total cost (10.5× against 10.7×). A code-heavy stream is different ([results](../02-benchmarks.md#code-heavy-fixture)): on `bench/fixtures/code-heavy.md` (5.6 KB, one ~4.5 KB fence) the open fence is 89.0% of flush cost at 20 characters and 86.2% at 195. The fast path takes `streamCost` from 56.9× to 7.24× at 20 characters (249 of 281 flushes skipped) and from 6.79× to 1.63× at 195, with no added lag, while a 50 ms window alone still leaves 19.1×. The multiples are inflated by a tiny full-parse denominator: absolute cost is 37 ms against 4.7 ms for the whole stream, about 100 ms against 13 ms on Hermes. The spike's fast path only appended text and did not build a document, so it showed no equivalence with a full parse.
- **Decision (proposed):** ship the open-fence fast path in Phase 2, to be confirmed with device measurements (together with [P2-1](#p2-1-exit-criterion-wording-and-the-f4-fixture) and [P2-4](#p2-4-coalescing-policy), on Hermes on a real device at S5) and an equivalence test. It ships only if the equivalence harness shows it matches a full parse.
- **Device result (2026-11-05, S25 FE, Hermes release build, 120 Hz, `F4d`: 5619 characters in 20-character chunks every 16 ms, 281 chunks):** with the fast path on, the sum of flush costs over the stream is about half of what it is with it off.

  | Schedule | Fast path on | Fast path off |
  |---|---|---|
  | `timeout@50` (3 runs each) | 108 ms (77 flushes; p90 5.2 ms) | 236 ms (76 flushes; p90 8.8 ms) |
  | `raf` (the two final runs at 120 Hz in each state) | 171 ms (169, 172) | 354 ms (355, 353) |

  Append-to-commit latency and dropped frames did not change with it (`timeout@50` p50 41 ms on against 39 ms off, dropped 1.4% against 0.8%; `raf` dropped 0 of about 500 frames in the clean runs). The saving is small in absolute terms, about 130 to 180 ms over a 4.5 s stream, so the ratio is the signal. `F4d`'s bar stays TBD as above, and should be absolute cost, not a multiple of a 13 ms full parse. Excluded: the four `raf` runs taken while the display had dropped to 60 Hz (see [P2-4](#p2-4-coalescing-policy)). Data: `bench/results/scheduler-device-s25fe-release-f4d-2026-11-05.json`. The fast path is on by default and stays on.
- **Consequences:** the equivalence harness must cover it ([testing-harness](./testing-harness.md#targeted-cases)): randomized chunking, including fences split mid-marker, closing-fence candidates, indented fences, and fences inside lists and quotes falling back to the normal path. The [stream-algorithm](./stream-algorithm.md#open-fenced-code-fast-path) section is active again. Tables and lists remain the next place to look for open-block cost. Whether a ratio is the right bar for code-heavy streams is a P2-1 question (`F4d`, [benchmark-protocol](./benchmark-protocol.md#f4)).

## P2-6: `hide-incomplete` semantics

- **Status:** Accepted (2026-11-05), implemented in S3.
- **Date:** 2026-11-05
- **Context:** 05 only says "buffers trailing unclosed inline markers". Two readings: hide the dangling marker, or auto-close it.
- **Decision:** hide, applied to the open block's view only ([smoothing](./smoothing.md)). No extra one-word lag; nested runs are cut at the earliest unclosed opener ([details](./smoothing.md#semantics)). The stream core keeps its exact table for resuming, and only the table it returns is the smoothed view: the open block is parsed again from the smoothed text, and only when smoothing changed the text (otherwise the returned table is the exact one). `done()` and `reset()` return the exact parse.
- **Consequences:** none on `source` or on the final document. Costs a second parse of the open block on flushes where a fragment is hidden. Smoothing does not give per-frame visual updates between flushes (the open point in [P2-4](#p2-4-coalescing-policy)): it changes what a flush shows, not when.
