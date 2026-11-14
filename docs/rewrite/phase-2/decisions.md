# Phase 2 · Implementation decisions

Numbered `P2-n`. Design-level decisions (`D1`–`D8`) live in the [roadmap decision log](../07-roadmap.md#decisions); Phase 1's are in [../phase-1/decisions.md](../phase-1/decisions.md). A decision that changes the design must update the design doc it affects.

Each entry is short on purpose: **what we chose and why**. Measurements live in [`bench/results/REPORT.md`](../../../bench/results/REPORT.md) and the raw JSON beside it. Don't paste tables here.

**Status:** `Proposed`, `Accepted`, `Superseded by P2-n`. Entry format: `Status · Date`, `Decision`, `Why`, optional extras.

---

## P2-1: Exit criterion wording and the F4 fixture

Accepted · 2026-11-06 (with a redefined bar and a recorded waiver)

- **Decision:** the criterion is `streamCost` (total flush cost ÷ one full `parse()` of the same text), at an **explicit 50 ms window**:
  - `F4a` (F2, 20-character chunks): at most **5×**. `F4b` (F2, 195-character chunks): at most **2×**.
  - These apply to the steady-state flush cost, with the full re-parses that a footnote definition forces reported next to every figure, not hidden.
  - **Waived for documents that end in a footnote definition** (F2 does). Accepted figures for F2 on the S25 FE: `F4a` 6.30× / 7.11×, `F4b` 2.46× / 2.51× (p50 / p90), recorded as accepted, not as passes.
  - A **footnote-free variant** is held to the original bars and passes: `F4a` 4.32×, `F4b` 1.42×, 0 full re-parses. So the waiver is exactly the footnote cost (about 1.45× on `F4a`).
  - **`F4d` (code-heavy)** uses an absolute bar: total flush cost at most **20 ms** at the 50 ms window on the S25 FE. Measured 15.5 ms with the open-fence fast path, 26.6 ms without.
  - Without a window the bars fail (`F4a` about 10.6× to 15.6×), and they assume the 50 ms window: the default schedule ([P2-4](#p2-4-coalescing-policy)) reports absolute cost instead of gating on it.
- **Why:** a 2× ceiling on a 500-chunk stream is unreachable: each flush has a per-flush floor, and only a 200 ms window gets to 1.84×, at about 96 ms visible lag. The ratio fails on `F4d` because one full parse is 1.9–3.5 ms, so its multiples are noise. On the S25 FE each footnote flush is a full re-parse of about 17 ms ([P2-3](#p2-3-parsefrom-contract)).
- **Not covered (waived, [P2-8](#p2-8-iphone-run-and-f4c-deferred)):** iPhone, and `F4c` (a real transcript; `bench/fixtures/transcripts/` is synthetic and sets no bar).
- Evidence: [web](../../../bench/results/REPORT.md#phase-2-web-benchmark-s5-web-part), [S25 FE](../../../bench/results/REPORT.md#phase-2-device-benchmark-s5-s25-fe), [footnote-free](../../../bench/results/REPORT.md#footnote-free-variant-s25-fe). Docs: [benchmark-protocol](../benchmark-protocol.md#f4), [work-breakdown](./work-breakdown.md#why-s0-comes-first), [README](./README.md#exit-criteria).

## P2-2: Splice strategy

Accepted · 2026-11-05

- **Decision:** Option A: copy the prefix columns per flush into a new immutable `NodeTable` (`src/stream/splice.ts`). The table is private, so B (shared append buffer) or C (chunked) can replace it ([table-splicing](./table-splicing.md#splice-strategy)).
- **Measured on S25 FE:** about 0.026 ms per splice (3.5 ms per `F4a` stream, about 3% of flush cost); a finished stream retains +39 KB over a static build ([report](../../../bench/results/REPORT.md#splice-cost-and-done)).
- **Accepted gap (2026-11-06): the `isSameBlock` prefix fast path never fires through `<Block>`.** `Block`'s memo compares against the table it last rendered with, so `i < stableCount` is never true and closed blocks fall back to the source comparison. Rendering stays correct. Cost: 0.15 ms p50 per flush at 58 blocks, 0.43 ms at 862 blocks, at most 0.8% of stream time ([report](../../../bench/results/REPORT.md#issameblock-comparator-s5-s25-fe)). The "about 6 ms per flush" estimate didn't reproduce.
- **Why no fix:** comparing against the previous flush's table is unsound (a skipped or suspended render leaves a block compared against a table it never rendered with, and the chain of tables is retained). The two sound options (per-block version stamps; a `WeakMap<BlockProps, NodeTable>` in `Block.tsx`, about 16 lines) save only about 0.2 ms per flush.
- **Revisit when** a larger-document or real-transcript workload pushes the comparator over about 2 ms p50 per flush (take the `WeakMap`). `it.failing` in `src/api/__tests__/streamMemo.test.tsx` records the gap.

## P2-3: `parseFrom` contract

Accepted · 2026-11-05

- **Decision:** `parseFrom(source, offset, carried, options) → { table, carried, prefixCarried, newReferences, hasFootnoteDefinition }` (`ParseFromResult`, `src/stream/types.ts`; [table-splicing](./table-splicing.md#parsefrom)). `carried` is an opaque backend value the core passes back; `prefixCarried` seeds the next append; the two flags drive the full-reparse triggers. The markdown-it backend implements it; with footnotes in the prefix it tokenizes the whole source. A native backend (Phase 4) must implement the same contract.
- **Why:** a tail-only parse loses link references, heading-slug counters and footnote state ([stream-algorithm](./stream-algorithm.md#carried-context)).
- **Tried and dropped (S5): remembering known footnote labels** so an open footnote tail costs a tail parse. It cut full re-parses at 50 ms from 2 to 1 and passed all gates, but total flush time didn't change (`F4a` 6.4× → 6.4–6.6×), because every remaining flush still tokenizes the whole source. The unbuilt route to a real gain is carrying `{label, count}` and seeding `env.footnotes` (the block phase sets `refs[':L'] = -1`, which clobbers seeded ids; about 1–2 days). **Revisit** if real transcripts or long documents ending in a footnote show footnote flushes dominating cost.
- Updates `03 · Backend interface` and `src/parse/backend.ts`.

## P2-4: Coalescing policy

Accepted · 2026-11-05

- **Decision:** the default flush schedule depends on the platform; an explicit window overrides it (`src/stream/scheduler.ts`, `src/api/useMarkdownStream.ts`).
  - **iOS and Android:** one flush per animation frame (`requestAnimationFrame`), no leading flush.
  - **Web:** a 16 ms timer window with a leading flush and a trailing flush, so the last chunk is never stranded.
  - **`flushIntervalMs` given:** that window on a timer, everywhere.
  - Without `requestAnimationFrame` (Node, SSR, tests) the frame schedule falls back to a 16 ms timer. The scheduler stays React-free; the hook picks the default (`Platform.OS`).
  - Cost-adaptive throttling stays deferred: flush p90 was 2.4–5.6 ms for windows up to 50 ms, against a 16.7 ms frame.
- **Why:** dropped frames (1.6–3.3% on S25 FE) don't separate schedules; latency does: append-to-commit p50 15 ms (`raf`) vs 43 ms (`timeout@50`) on device. Plain `raf` stalls in a hidden browser tab (27 s vs 8 s), which matters for a chat answer arriving while the user is in another tab. On web a flush costs under 1 ms, so a larger window only adds latency.
- **Rejected:** `timeout@33` everywhere (gives up about 19 ms latency on native for nothing); a visibility-based hybrid (needs a visibility signal per platform to fix a problem the web default already avoids); plain `raf` everywhere; a 50 ms default.
- **Measured since:** a backgrounded Android app keeps its buffered text and flushes once after resume (the host pauses timers and frames), final document equal to `parse(full)` in 20 of 20 runs, so no `AppState` handling is needed. Through the hook, a 50 ms timer commits about 3.6× less often than `raf` (129 vs 465 on `F4a`) but each commit costs about twice as much, with more janky frames at 120 Hz. iOS untested ([P2-8](#p2-8-iphone-run-and-f4c-deferred)).
- **Caveat:** `raf` flush rate follows the display refresh rate (a 120 Hz run dropped to 60 Hz mid-session; those runs are flagged and excluded).
- Evidence: [scheduler](../../../bench/results/REPORT.md#phase-2-scheduler-s2), [hook](../../../bench/results/REPORT.md#react-hook-50-ms-timer-against-raf), [background](../../../bench/results/REPORT.md#native-background-and-resume-s25-fe). Docs: [hook-and-scheduler](./hook-and-scheduler.md#scheduler), `05 · Rendering`.

## P2-5: Open fence fast path

Accepted · 2026-11-05

- **Decision:** ship the open-fence fast path ([stream-algorithm](./stream-algorithm.md#open-fenced-code-fast-path)): text appended to an open fenced block skips the re-parse. On by default (`FENCE_FAST_PATH_DEFAULT` in `src/stream/createMarkdownStream.ts`).
- **Why:** on F2 it saves about 1.5%, but on a code-heavy stream the open fence is about 89% of flush cost; `streamCost` falls from 56.9× to 7.24× (20-character chunks) and from 6.79× to 1.63× (195), where a 50 ms window alone still leaves 19×. On S25 FE it halves flush cost (108 vs 236 ms at `timeout@50`) with no change in latency or dropped frames.
- **Condition:** the equivalence harness matches a full parse with it on and off (1,400 tests, no allowlist entries; [testing-harness](../testing-harness.md#targeted-cases)). The iOS check is waived ([P2-8](#p2-8-iphone-run-and-f4c-deferred)) and can only turn it off, not relax equivalence.
- Evidence: [code-heavy](../../../bench/results/REPORT.md#code-heavy-fixture). Tables and lists are the next place to look for open-block cost.

## P2-6: `hide-incomplete` semantics

Accepted · 2026-11-05 · implemented in S3

- **Decision:** hide the dangling marker, applied to the open block's view only ([smoothing](./smoothing.md#semantics)); no extra one-word lag; nested runs cut at the earliest unclosed opener. The core keeps its exact table for resuming and returns the smoothed one, re-parsing the open block from the smoothed text only if smoothing changed it. `done()` and `reset()` return the exact parse.
- **Why:** "buffers trailing unclosed inline markers" admits two readings (hide vs auto-close). Cost: a second parse of the open block on flushes where a fragment is hidden. It changes what a flush shows, not when.

---

## P2-7: Where the Phase 1 carry-over lives

Accepted · 2026-11-06

- **Decision:** no S6 milestone; Phase 2 stays streaming-only and closes at S5.
  - Standalone issue **#36 "Perf hardening: Phase 1 carry-over (P1-25)"** holds: (1) a CommonMark-only baseline against v0, (2) a `firstRender` profile against element count, (3) a Hermes parse profile (markdown-it vs the node builder), in that order, before Phase 3 starts.
  - (4) F5 `retainedHeap` bar and its method moves to the start of Phase 3 with `virtualize` (an equal hold on both sides).
  - (5) Low-end Android re-measure (also re-confirms P1-24 and the P1-10 margin) becomes a **v1.0 release gate**, tracked in #37, measured or waived by name.
  - The 5× target is restated at the v1.0 gate ([P2-9](#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion) did so).
- **Why:** none of it is streaming work, and item 5 can wait on hardware indefinitely. Item 1 goes first because it decides whether 2 and 3 are worth the time. Rejected: an S6 milestone (couples unrelated work to the streaming phase); folding all into Phase 3 (the cheap baseline would wait behind `virtualize`); dropping the items (the 5× target would silently disappear).
- Cost: the P1-25 waiver stays open debt until v1.0, which means v1.0 can't ship on the current evidence.
- **Amended by D9 ([roadmap](../07-roadmap.md#decisions)):** the optimization-only items (2, 3 and 4 above, and the fixes #36 found) are deferred to a single optimization pass after the last feature phase instead of being worked before Phase 3. Item 1 is done; item 5 stays a v1.0 gate.

---

## P2-8: iPhone run and F4c deferred

Accepted · 2026-11-06

- **Decision:** waive for Phase 2 and defer:
  - **iPhone:** `raf` on `CADisplayLink`, iOS flush cost and frame pacing, iOS background and resume, and the iOS check of the P2-5 fast path.
  - **`F4c`:** replaying a real LLM transcript (about 10 KB) with recorded timing, and re-confirming the P2-1 bars against it.
  - S25 FE, web and Node-proxy evidence stands.
- **Why:** no iPhone, and no real transcript or API access to record one.
- **Risk accepted:** iOS timing or a real transcript's chunk and block mix could move the default or the bars. The fix would be a default or a bar change, not a design change: the default is one constant and `flushIntervalMs` selects the schedule.
- **Revisit when:** (1) an iPhone is first cabled: run the [protocol](../benchmark-protocol.md) and supersede P2-4 / P2-5 if it contradicts them; (2) a real transcript with timing is captured: replay it as `F4c`; (3) before v1.0: both join the [v1.0 gate](../07-roadmap.md#v10-release-gate), measured or waived by name again. Gates no phase.

---

## P2-9: Absolute F3 budgets replace the 5× against v0 criterion

Accepted · 2026-11-06

- **Decision:** at the v1.0 gate, replace the ≥ 5× parse-plus-first-render criterion against v0.8.5 ([P1-25](../phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1)) with absolute ceilings on F3. S25 FE release build, bench tab "full" mode (5 warm-up + 20 measured), medians, `gfm` preset:

  | Metric | Ceiling |
  |---|---|
  | `parse` | 100 ms (tightened from 270 after the autolink fix `9f4845b`: 79.4 ms measured + 25%) |
  | `firstRender` | 325 ms |
  | `reRenderOneBlock` | 25 ms (and ≤ 10% of `firstRender`; met at 6.2%) |
  | `parse+firstRender` | 595 ms |

  Ceilings are the worst median seen in three runs; they guard against regression and are not targets. The unchanged three tighten when a render fix is measured. They live in `bench/budgets.json`; `node bench/check-budgets.mjs <bench-result.json>` exits 1 when over.
- **No v0 reference (amended 2026-11-06):** the comparison with v0.8.5 is finished (F3-cm gave 2.03× with the `commonmark` preset, 1.19× with `gfm`, F3 1.07×; `reRenderOneBlock` 17–27× faster), and those results are the record. The comparison tooling and the reference ratio in `bench/budgets.json` are removed, so budgets are absolute only, with no ratio reported with each run. There are no web budgets (one run per screen, p90 two to three times the median), and a budget missed on a low-end device is judged there, not by scaling these.
- **Why:** 5× is unreachable on a like-for-like baseline (it needs 71.2 ms, and v1cm's `firstRender` alone is 133.8 ms), the cost is not where P1-25 expected it (`core:linkify` about 69% of F3 parse on Hermes, tables about 46% of `firstRender`; fixes filed as #38, #39, #40), and a ratio depends on v0's cost, which we don't control. Rejected: keeping 5× against F3-cm; dropping the target with no replacement.
- **Consequences:** the roadmap, Phase 1 README and [benchmark protocol](../benchmark-protocol.md) bars point here. README performance claims need their own wording; the budgets aren't a speed claim against v0.8.5.
- Evidence: [F3-cm baseline](../../../bench/results/REPORT.md#a-commonmark-only-baseline-f3-cm), [render profile](../../../bench/results/REPORT.md#b-where-firstrender-goes), [parse split](../../../bench/results/REPORT.md#c-parse-on-hermes-markdown-it-against-the-node-builder), [derivation](../../../bench/results/REPORT.md#proposed-budgets-for-f3), [autolink fix](../../../bench/results/REPORT.md#after-the-autolink-fix-9f4845b).

---

## P2-10: Absolute conversion budget replaces the relative P1-10 budget

Accepted · 2026-11-06

- **Decision:** `convertTokens` takes at most **12 ms** on F3 (S25 FE release, `ParseSplit` screen, median of 21 after 3 warm-up). Derived from 8.7 ms + about 35% headroom. The 15% share check in `bench/convert.mjs` (Node `--jitless`) stays as an informational figure and no longer gates. [P1-10](../phase-1/decisions.md#p1-10-relative-conversion-budget) keeps its text with a pointer here.
- **Why:** the autolink fix cut markdown-it's F3 parse from 178.4 to 42.2 ms with the builder unchanged (10.0 → 8.7 ms), pushing the share from 5.6% to 20.6%. A ratio fails when its denominator improves, which isn't a regression in the code it guards.
- **Not in `bench/budgets.json`** (Bench-tab metrics only); checked from the ParseSplit result (the tab was removed after Phase 2; restore it from commit `81220d3` to re-check). The headroom is a single-run derivation and run-to-run noise on this device is large, so the ceiling may need adjusting after a repeat run.
