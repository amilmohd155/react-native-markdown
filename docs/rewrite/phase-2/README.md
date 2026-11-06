# Phase 2 · Streaming

This folder holds the **implementation detail** for Phase 2 of the rewrite: how it is built, in what order, and how "done" is checked.

> **Rule: this folder says *how/when*, the design docs say *what*.**
> The streaming design lives in [`../05-streaming.md`](../05-streaming.md); the model, API and decisions in [`../03-architecture.md`](../03-architecture.md), [`../04-api.md`](../04-api.md), [`../08-model-and-api.md`](../08-model-and-api.md) and the [decision log](../07-roadmap.md#decisions). Files here link to them instead of restating them. If implementation changes the design, update the design doc first, then reference it from here.

## Scope

Phase 2 delivers streaming on the Phase 1 core ([07 · Phase 2](../07-roadmap.md#phase-2-streaming)):

- `useMarkdownStream` feeding `<Markdown document>`, built on a React-free stream core
- Tail re-parse with node-table splicing (`parseFrom` for the markdown-it backend)
- Batching of updates: a per-frame flush on native and a 16 ms window on web ([P2-4](./decisions.md#p2-4-coalescing-policy)); cost-adaptive coalescing stays deferred
- Optional `smoothing: 'hide-incomplete'`
- Randomized-chunking equivalence tests, perf CI additions, and the F4 device benchmark

Out of scope: virtualization and polish (phase 3), the native backend (phase 4).

## Exit criteria

Defined in [07](../07-roadmap.md#phase-2-streaming). Restated here only as a checklist to track:

- [x] Accepted with waiver: streaming a 10 KB message costs at most 2× a single full parse in total with 195-character chunks, and at most 5× with 20-character chunks, at the 50 ms window, **as accepted in [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture)** (2026-11-06): the bars apply to the steady-state flush cost, excluding the necessary full re-parse that a footnote definition's first appearance triggers, with the footnote re-parse count and cost reported next to them; and they are **waived for documents that end in a footnote definition** (F2 does), with the measured S25 FE figures accepted: `F4a` 6.30× / 7.11× and `F4b` 2.46× / 2.51×. A footnote-free variant, held to the original bars, passes on the S25 FE at 50 ms (`F4a` 4.32× / 4.34×, `F4b` 1.42× / 1.44×; [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture) not reopened). `F4d` is judged by its absolute bar: at most 20 ms total flush cost at 50 ms (core 15.5 / 15.7 ms with the fast path). [Device results](../02-benchmarks.md#phase-2-device-benchmark-s5-s25-fe)
- [x] Equivalence: after every append, the streamed document equals `parse(source so far)`, apart from a reviewed allowlist ([testing-harness.md](./testing-harness.md#equivalence-harness); S4: all fixtures, targeted cases and chunkers, the allowlist is empty, run in the `unit` job with the fence fast path on and off)
- [x] Only the open block re-renders per update (memo test, S2; the `isSameBlock` prefix fast path does not fire through `<Block>`; accepted at S5, the comparator costs 0.43 ms p50 per flush at 862 blocks on the S25 FE: [P2-2 note](./decisions.md#p2-2-splice-strategy))
- [x] Runs unchanged in Expo Go and on the web (existing `check:expo-go` and `web` jobs stay green; the hook and scheduler also ran in Expo Go, on a release build and on the web in S2)
- [x] Met with waiver: device measurement of F4 on the **S25 FE and web**, written into [`../02-benchmarks.md`](../02-benchmarks.md) (summary table: [Phase 2 device results](../02-benchmarks.md#phase-2-device-results-summary)). **Accepted scope: S25 FE + web measured; iPhone and `F4c` waived per [P2-8](./decisions.md#p2-8-iphone-run-and-f4c-deferred)** (2026-11-06; no iPhone, no real transcript or API access; synthetic transcripts stay a labelled stand-in). In: the web run with the full method (5 warm-up, 20 measured, p50 and p90, [web results](../02-benchmarks.md#phase-2-web-benchmark-s5-web-part)); the S25 FE full-method run (the core misses the bars at 50 ms on F2 because of footnote full re-parses, accepted with a redefined bar and a waiver in P2-1, [S25 FE results](../02-benchmarks.md#phase-2-device-benchmark-s5-s25-fe)); the footnote-free F2 variant (passes the original bars at 50 ms, [results](../02-benchmarks.md#footnote-free-variant-s25-fe)); native background and resume on the S25 FE (no bug, [results](../02-benchmarks.md#native-background-and-resume-s25-fe)); [earlier scheduler results](../02-benchmarks.md#phase-2-scheduler-s2). Revisit when an iPhone is first cabled, when a real transcript is captured, or at the v1.0 gate

## Phase 1 carry-over (accepted, [P2-7](./decisions.md#p2-7-where-the-phase-1-carry-over-lives))

[P1-25](../phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) waived the ≥ 5× parse-plus-first-render criterion and carried five items out of Phase 1. **Decided in P2-7 (accepted 2026-11-06):** none of them becomes an S-milestone or a Phase 2 exit criterion. They move to one standalone perf-hardening issue, split by when each can be done:

| Item | Home |
|---|---|
| CommonMark-only baseline against v0 (fair like-for-like ratio) | Perf-hardening issue (#36), first, before Phase 3 starts |
| Profile `firstRender` against element count | Perf-hardening issue (#36); fixes it finds go into Phase 3 |
| Profile parse on Hermes (markdown-it against the node builder) | Perf-hardening issue (#36) |
| F5 `retainedHeap` bar and method | Phase 3, measured with `virtualize` |
| Low-end Android re-measure (also re-confirms P1-24 and the P1-10 margin) | v1.0 release gate (#37): measured, or waived by name, when the hardware exists |

The 5× target itself is restated at the v1.0 gate against the fair baseline, not against the current F3 comparison. Phase 2 can close without any of this. The homes above are decided; the items are tracked in #36 and #37, not in Phase 2.

## Documents

| Document | Contents |
|---|---|
| [work-breakdown.md](./work-breakdown.md) | Milestones S0–S5 in order, with dependencies and done criteria |
| [stream-algorithm.md](./stream-algorithm.md) | Tail boundary, carried context, full-reparse triggers, open-fence fast path (proposed) |
| [table-splicing.md](./table-splicing.md) | `parseFrom`, splicing into a new table, the `isSameBlock` prefix fast path |
| [hook-and-scheduler.md](./hook-and-scheduler.md) | The React-free core, the scheduler (per-frame or windowed flushes), `useMarkdownStream`, lifecycle |
| [smoothing.md](./smoothing.md) | `hide-incomplete` semantics |
| [testing-harness.md](./testing-harness.md) | Equivalence harness, chunkers, allowlist, perf additions |
| [benchmark-protocol.md](./benchmark-protocol.md) | F4, metrics, method and pass bars |
| [decisions.md](./decisions.md) | Implementation-level decisions P2-1 onward, separate from D1–D8 and P1-n |

## Reading order

1. [work-breakdown.md](./work-breakdown.md), for the plan (and why S0 comes first).
2. [stream-algorithm.md](./stream-algorithm.md), which is needed to start S1.
3. The rest as each milestone starts.

## Status

Status is tracked in GitHub issues, not in these files: tracking issue [#28](https://github.com/amilmohd155/react-native-markdown/issues/28) with one sub-issue per milestone (S0–S5), on the same pattern as Phase 1 (#7). Phase 2 PRs target `v1`, and "Closes #n" doesn't auto-close from `v1`, so close milestone issues by hand. The docs change only when the design or plan changes.

| Milestone | Issue |
|---|---|
| S0 Spike & criterion | [#29](https://github.com/amilmohd155/react-native-markdown/issues/29) |
| S1 Stream core | [#30](https://github.com/amilmohd155/react-native-markdown/issues/30) |
| S2 Hook & scheduler | [#31](https://github.com/amilmohd155/react-native-markdown/issues/31) |
| S3 Smoothing | [#32](https://github.com/amilmohd155/react-native-markdown/issues/32) |
| S4 Tests & CI | [#33](https://github.com/amilmohd155/react-native-markdown/issues/33) |
| S5 Device benchmark & exit review | [#34](https://github.com/amilmohd155/react-native-markdown/issues/34) |

## Exit review (2026-11-06)

**Phase 2 exit criteria satisfied.** Every criterion is MET or MET-WITH-WAIVER, and every S0 to S5 deliverable is done or waived by name. No blockers. The review ran on the worktree (the pushed head of PR #35 is `f056677`; the docs, the `streamMemo.test.tsx` comment, the `tsconfig.json` exclude and the S5 bench files are uncommitted at the time of the review and still have to be committed and pushed).

### Exit criteria

| Criterion | Status | Evidence |
|---|---|---|
| Streaming cost bars (at most 2x / 5x, `F4d` at most 20 ms) | **MET-WITH-WAIVER** (P2-1, P2-8) | S25 FE `core` at 50 ms: `F4a` 6.30x / 7.11x and `F4b` 2.46x / 2.51x, accepted as measured for a document that ends in a footnote definition (P2-1). Footnote-free F2 passes the original bars: `F4a` 4.32x / 4.34x, `F4b` 1.42x / 1.44x (0 full re-parses). `F4d` 15.5 / 15.7 ms. Web (sim): `F4a` 4.28x / 4.80x, `F4b` 1.42x / 1.59x. [Summary](../02-benchmarks.md#phase-2-device-results-summary), `bench/results/stream-device-s25fe-release-2026-11-06.json`, `...footnote-free...`, `stream-web-chrome-4x-2026-11-06.json`. `F4c` re-check waived by P2-8 |
| Equivalence with `parse(source so far)` after every append, reviewed allowlist only | **MET** | `yarn test:stream`: 1407 tests, 1 suite, all pass; `test/fixtures/stream-allowlist.json` is `[]`; runs with the fence fast path on and off; part of the `unit` job (green on PR #35) |
| Only the open block re-renders per update | **MET-WITH-WAIVER** (P2-2 gap) | Memo test passes (`src/api/__tests__/streamMemo.test.tsx`, in `yarn test`); the `isSameBlock` prefix fast path never fires through `<Block>`, an `it.failing` by design. Accepted: comparator 0.151 ms p50 at 58 blocks, 0.428 ms at 862 blocks, at most 0.8% of stream time, a fix saves at most about 0.5% ([results](../02-benchmarks.md#issameblock-comparator-s5-s25-fe), [P2-2 note](./decisions.md#p2-2-splice-strategy)) |
| Runs unchanged in Expo Go and on the web | **MET** | `yarn check:expo-go`: no native code reachable (67 modules); `yarn test:web`: 380 tests pass; PR #35 `expo-go-check` and `web` pass; hook and scheduler ran in Expo Go, on a release build and on the web in S2 |
| Device measurement of F4 on the S25 FE and web, written into 02-benchmarks | **MET-WITH-WAIVER** (P2-8) | S25 FE and web measured with the full method (5 warm-up, 20 measured, p50 / p90), plus footnote-free variant, splice and heap, hook timer against `raf`, `isSameBlock`, background and resume; written up with a [summary table](../02-benchmarks.md#phase-2-device-results-summary). iPhone and `F4c` waived by [P2-8](./decisions.md#p2-8-iphone-run-and-f4c-deferred) |

### Milestone deliverables

| Item | Status | Evidence |
|---|---|---|
| S0 spike, F4 definition, P2-1 / P2-4 / P2-5 recorded (#29) | MET-WITH-WAIVER | `bench/stream.mjs`, [S0 results](../02-benchmarks.md#phase-2-streaming-spike-s0). Real transcripts for the `docs/` fixture waived by P2-8 (synthetic stand-ins). #29 still shows two unticked boxes (real transcripts; splice and heap check, which S5 did) |
| S1 stream core (#30) | MET | Equivalence harness, per-append work counter, pathological inputs, fast path on and off: `yarn test:stream` green |
| S2 hook and scheduler (#31) | MET | Hook, scheduler and memo tests in `yarn test`; `check:public-types`: OK, 73 named types, none internal; P2-4 accepted |
| S3 smoothing (#32) | MET | Smoothing tests in `yarn test`; P2-6 accepted |
| S4 tests and CI (#33) | MET | PR #35 required checks green on `f056677`: lint, typecheck, unit, spec, web, perf, expo-go-check, dts-leak, GitGuardian |
| S5: Stream tab in the example app | MET | PR #35 (Stream tab, `example/src/screens/StreamBench.tsx`) |
| S5: protocol on the S25 FE and web, full method | MET | [S25 FE](../02-benchmarks.md#phase-2-device-benchmark-s5-s25-fe), [web](../02-benchmarks.md#phase-2-web-benchmark-s5-web-part) |
| S5: iPhone run | MET-WITH-WAIVER (P2-8) | Waived, deferred |
| S5: `F4c` real transcript | MET-WITH-WAIVER (P2-8) | Waived, deferred |
| S5: background and resume | MET | [Results](../02-benchmarks.md#native-background-and-resume-s25-fe): 20 of 20 final documents equal `parse(full)`, no bug (S25 FE; iOS covered by P2-8) |
| S5: splice cost and Hermes heap | MET | Splice 0.026 ms per splice at p50; heap +39,166 bytes (`F4a`), +13,639 (`F4d`) |
| S5: `isSameBlock` fix or accept | MET-WITH-WAIVER (P2-2 gap accepted) | As above; the `it.failing` stays by design |
| S5: settle the `F4d` bar, confirm or revise P2-1 | MET | P2-1 accepted 2026-11-06 |
| S5: results written under "Device results" | MET | [Summary table](../02-benchmarks.md#phase-2-device-results-summary) and linked sections |
| S5: exit review | MET | This section |
| S5: Phase 1 carry-over placement | MET | P2-7; #36, #37 |

### Waivers

- **P2-1, footnote-ending documents.** The 2x / 5x bars are redefined to steady-state flush cost (excluding the necessary footnote full re-parse, reported separately) and waived for documents that end in a footnote definition (F2 does); the measured S25 FE figures are the accepted ones. The footnote-free variant passes the original bars.
- **P2-2, `isSameBlock` gap.** The prefix fast path does not fire through `<Block>`; accepted with measured cost, no code fix.
- **P2-8, iPhone and `F4c`.** Unmeasured: `raf` on iOS, iOS flush cost and frame pacing, iOS background and resume, the iOS check of the P2-5 fast path; a real LLM transcript replay and the P2-1 bar re-confirmation against it. Joined to the [v1.0 gate](../07-roadmap.md#v10-release-gate) as measured, or waived by name.

### Follow-ups (none blocks Phase 2)

- **#36** perf hardening (Phase 1 carry-over items 1 to 3), before Phase 3; **#37** v1.0 gate (low-end Android; the iPhone and `F4c` join it per P2-8, and #37 has not been updated to say so yet); **P2-7 carry-over**: F5 `retainedHeap` at the start of Phase 3.
- **Footnote seeding route** (a cheaper footnote tail) was tried and dropped ([P2-3 note](./decisions.md#p2-3-parsefrom-contract)); deferred, reopen only if footnote-ending streams matter.
- **`tsconfig.json` exclude for the bench fragments** (`bench/stream-web-head.ts`, `bench/stream-web-tail.ts`): uncommitted, needed so `yarn typecheck` passes with the web bench files present; commit with the bench files.
- **Fixtures over 6000 characters** (F2 and larger) run chunk sizes 1 and 2 in the equivalence harness only with `STREAM_FULL=1` (about 14 s more); the default CI run does not include them ([testing-harness](./testing-harness.md)).
- Commit and push the uncommitted S5 files, then merge PR #35 into `v1` and close #29 to #34 by hand.

### Checks run for this review (2026-11-06, worktree)

`yarn lint`, `typecheck`, `test` (839 passed, 1 skipped, 56 suites), `test:stream` (1407 passed), `test:spec` (1413 passed), `test:web` (380 passed), `check:expo-go` (OK), `prepare` (build OK; `lib/` is gitignored, no tracked changes) and `check:public-types` (OK) all exit 0. PR #35 `gh pr checks`: all nine checks pass on the pushed head `f056677`.
