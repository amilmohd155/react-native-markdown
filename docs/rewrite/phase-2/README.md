# Phase 2 · Streaming

This folder holds the **implementation detail** for Phase 2 of the rewrite: how it is built, in what order, and how "done" is checked.

> **Rule: this folder says *how/when*, the design docs say *what*.**
> The streaming design lives in [`../05-streaming.md`](../05-streaming.md); the model, API and decisions in [`../03-architecture.md`](../03-architecture.md), [`../04-api.md`](../04-api.md), [`../08-model-and-api.md`](../08-model-and-api.md) and the [decision log](../07-roadmap.md#decisions). Files here link to them instead of restating them. If implementation changes the design, update the design doc first, then reference it from here.

## Scope

Phase 2 delivers streaming on the Phase 1 core ([07 · Phase 2](../07-roadmap.md#phase-2-streaming)):

- `useMarkdownStream` feeding `<Markdown document>`, built on a React-free stream core
- Tail re-parse with node-table splicing (`parseFrom` for the markdown-it backend)
- Frame batching (and, if the spike says so, cost-adaptive coalescing)
- Optional `smoothing: 'hide-incomplete'`
- Randomized-chunking equivalence tests, perf CI additions, and the F4 device benchmark

Out of scope: virtualization and polish (phase 3), the native backend (phase 4).

## Exit criteria

Defined in [07](../07-roadmap.md#phase-2-streaming). Restated here only as a checklist to track:

- [ ] Streaming a 10 KB message costs under 2× a single full parse in total, **as defined by [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture)** (the roadmap wording leaves chunk size and timing open; see [why](./work-breakdown.md#why-s0-comes-first))
- [ ] Equivalence: after every append, the streamed document equals `parse(source so far)`, apart from a reviewed allowlist ([testing-harness.md](./testing-harness.md#equivalence-harness))
- [ ] Only the open block re-renders per update (memo test)
- [ ] Runs unchanged in Expo Go and on the web (existing `check:expo-go` and `web` jobs stay green)
- [ ] Device measurement of F4 on the S25 FE and web, written into [`../02-benchmarks.md`](../02-benchmarks.md)

## Carried over from Phase 1

[P1-25](../phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) waived the ≥ 5× parse-plus-first-render criterion and carried it into Phase 2 as an open performance item: a CommonMark-only baseline against v0, profiling `firstRender` against element count, profiling parse on Hermes, and a re-measure on a low-end Android if one becomes available. The F5 `retainedHeap` bar and its method also stay open. Neither is an exit criterion of the streaming work above, and neither is scheduled in S0–S5 yet: where they go (a milestone here, or their own item) is still to be decided.

## Documents

| Document | Contents |
|---|---|
| [work-breakdown.md](./work-breakdown.md) | Milestones S0–S5 in order, with dependencies and done criteria |
| [stream-algorithm.md](./stream-algorithm.md) | Tail boundary, carried context, full-reparse triggers, fence fast path |
| [table-splicing.md](./table-splicing.md) | `parseFrom`, splicing into a new table, the `isSameBlock` prefix fast path |
| [hook-and-scheduler.md](./hook-and-scheduler.md) | The React-free core, `useMarkdownStream`, frame batching, lifecycle |
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
