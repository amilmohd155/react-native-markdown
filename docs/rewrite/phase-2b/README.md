# Phase 2b · Streaming polish

Implementation detail for Phase 2b ([07 · Phase 2b](../07-roadmap.md#phase-2b-streaming-polish-scheduled-before-the-rest-of-phase-3)). This folder says *how/when*; the design docs say *what*. If implementation changes the design, update the design doc first. Tasks and issue drafts live in GitHub issues, not here.

> **Status: built, exit checks closed ([P2b-8](./decisions.md#p2b-8-phase-2b-exit-the-s25-fe-latency-is-accepted-three-checks-are-waived)).** P2b-2 to P2b-7 are implemented. Runs before the remaining Phase 3 work ([P2b-1](./decisions.md#p2b-1-streaming-polish-is-phase-2b-scheduled-before-the-rest-of-phase-3)).

Phase 2 made streaming *cheap*. This phase makes it *look right*: steady growth, no half-written tables, a light animation, and a clean end signal. Prompted by a comparison with enriched-markdown's `streaming` and `streamingConfig` ([source](https://docs.swmansion.com/enriched-markdown/react-native/api-reference/enriched-markdown-text#streamingconfig)). Our engine already beats theirs on exactness (`done()` equals a full parse, `reset()` handles retries); the gaps are presentation.

## Scope

| Item | Decision |
|---|---|
| `hide-incomplete` always on, `smoothing` option removed | [P2b-2](./decisions.md#p2b-2-hide-incomplete-is-always-on-the-smoothing-option-is-removed) |
| Tables: hold the header until the delimiter row, drop a partial trailing row | [P2b-3](./decisions.md#p2b-3-tables-wait-for-header-and-delimiter-drop-a-partial-trailing-row) |
| `smooth`: paced, word-bounded release of text | [P2b-4](./decisions.md#p2b-4-smooth-paces-text-before-it-reaches-the-core) |
| `animation`: `'none' \| 'fade'` on new blocks  | [P2b-5](./decisions.md#p2b-5-animation-is-a-block-level-fade-none--fade) |
| One `streamingConfig` object, `onStreamingEnd`  | [P2b-6](./decisions.md#p2b-6-one-streamingconfig-object-and-onstreamingend) |
| `flushIntervalMs` removed from the public API  | [P2b-7](./decisions.md#p2b-7-flushintervalms-becomes-internal) |

Resulting API:

```ts
useMarkdownStream({
  preset, html, plugins,                             // unchanged (no flushIntervalMs: internal since P2b-7)
  streamingConfig: { smooth: true, animation: 'fade' }, // or { type: 'fade', duration: 300 }
  onStreamingEnd: () => {},                             // once per stream, after done() is committed
});
```

Not here: gradient and per-word fade, per-block `hidden` modes for code and media ([P2b-5](./decisions.md#p2b-5-animation-is-a-block-level-fade-none--fade), [P2b-6](./decisions.md#p2b-6-one-streamingconfig-object-and-onstreamingend)); the `backend` option; pure performance tuning, which waits for the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase) ([D9](../07-roadmap.md#decisions)).

## Order (as done)

1. P2b-2 and P2b-3 (both in the smoothed view; the harness reaches the exact core through the core's internal switch), after the device baseline.
2. P2b-4 `smooth` and P2b-7 (hide `flushIntervalMs`).
3. P2b-5 `animation` and P2b-6 the config object and `onStreamingEnd`.
4. The example's Stream tab gets the Smooth and Animation controls and an `onStreamingEnd` line; docs in [05](../05-streaming.md) and [04](../04-api.md#streaming). Still to do: the exit checks below.

## Exit criteria

- [x] **Equivalence holds:** randomized-chunking tests still show `done()` equals `parse(source)`. Intermediate flushes are checked for the smoothed view only where the table and incomplete-syntax rules say they differ.
- [x] **Tests per rule:** every row of the table in [P2b-3](./decisions.md#p2b-3-tables-wait-for-header-and-delimiter-drop-a-partial-trailing-row) and of [smoothing.md](../phase-2/smoothing.md#semantics), split at every position; `smooth` with bursty, stalled and ended streams; `done()` and `reset()` mid-backlog; `onStreamingEnd` fires once, never on unmount.
- [x] **Cost holds with the new default:** the F4 bars of [P2-1](../phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture) re-run in the Node bench at 50 ms with `hide-incomplete` always on, and on the S25 FE and web as an A/B at the default schedule (baseline taken first, [P2b-7](./decisions.md#p2b-7-flushintervalms-becomes-internal)), and F4d's total-flush-cost bar (at most 20 ms for the stream, defined at a 50 ms window) with `smooth` on. A miss is judged in a decision, not waived silently. Judged in [P2b-8](./decisions.md#p2b-8-phase-2b-exit-the-s25-fe-latency-is-accepted-three-checks-are-waived): the S25 FE latency is accepted, and F4d with `smooth` on is waived. Evidence: Node, S25 FE and web (Chrome 4x, old vs new in one session: no cost), see [REPORT](../../../bench/results/REPORT.md).
- [x] **Phase 3 still follows:** the P3-5 follow-tail device pass (follow, pause on drag, resume, fling back to the end) is re-run on a stream with `smooth` on. Done on the S25 FE for `scroll` and `virtualize` (fling 10/10 each); resuming by a slow drag while code streams and the iOS re-run are waived in P2b-8.
- [x] **No native imports** in the main entry (`yarn check:expo-go`), `fallow` at 0, lint and typecheck clean.

## Documents

| Document | Contents |
|---|---|
| [decisions.md](./decisions.md) | Decisions P2b-1 onward |
