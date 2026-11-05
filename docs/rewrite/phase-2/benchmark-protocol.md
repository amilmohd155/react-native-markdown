# Phase 2 · Streaming benchmark protocol

How S0 and S5 measure the Phase 2 exit criterion. It reuses [Phase 1's protocol](../phase-1/benchmark-protocol.md) for devices, build configuration and method; this file adds only what streaming changes. Results go into [`../02-benchmarks.md`](../02-benchmarks.md) under "Device results".

## Devices and build

As in Phase 1: the Samsung Galaxy S25 FE (Hermes release build, New Architecture on, JS dev mode off) is the measured device, plus web (Chrome, CPU throttled 4×). There is still no low-end device, so, as in [P1-25](../phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1), a result on the S25 FE is a lower bound on a slow phone's cost.

## F4

Phase 1 sketched F4 as "`F2` streamed in 500 chunks". That leaves arrival timing open, and timing decides the result (see [why S0 comes first](./work-breakdown.md#why-s0-comes-first)). The exact definition is [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture); the definitions below are as accepted there:

| Id | Content | Arrival |
|---|---|---|
| `F4a` | `F2` (~10 KB) split into ~20-character chunks (500 chunks) | Paced at one chunk per 16 ms (≈ one per frame; a fast LLM stream). Bar: `streamCost` at most 5× |
| `F4b` | the same text, 50 chunks of ~195 characters | Paced at one chunk per 16 ms. Bar: `streamCost` at most 2× |
| `F4d` | `bench/fixtures/code-heavy.md` (5.6 KB, one ~4.5 KB fence), the code-heavy variant of F4 | ~20-character chunks, paced at one chunk per 16 ms. Bar: TBD with [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture); a ratio may not suit it (see [results](../02-benchmarks.md#code-heavy-fixture)) |
| `F4c` | a real LLM transcript of ~10 KB, chunk sizes taken from the recorded token stream | Replayed with recorded timing. Not yet collected (the transcripts in `bench/fixtures/transcripts/` are synthetic); re-checked at S5, where the bar is re-confirmed or revised |

Chunks are split on UTF-16 code units, including inside surrogate pairs and tokens, exactly as a real stream is.

## Metrics

| Metric | Definition | How measured |
|---|---|---|
| `streamCost` | Sum of flush time (tail parse + splice + document creation), as a multiple of one `parse()` of the full text | `performance.now()` around each `flush`, summed |
| `streamRender` | Sum of commit time per flush for `<Markdown document>` | As `firstRender` in Phase 1 |
| `perFlushP90` | 90th-percentile single flush time | Same samples |
| `droppedFrames` | Frames dropped during the stream | Android: `dumpsys gfxinfo` |
| `retainedHeap` | Hermes heap growth after the stream ends and GC runs, vs one static document | `HermesInternal.getInstrumentedStats()` |
| `finalDone` | Time of `done()` (the final full parse) | `performance.now()` |

The **pass/fail metric** is `streamCost` for `F4a` and `F4b` (and `F4c` once recorded), against the bars fixed in P2-1, with the default flush window (50 ms, provisional until measured on a device, [P2-4](./decisions.md#p2-4-coalescing-policy)). Because the criterion is about parse cost, `streamRender` and `droppedFrames` are recorded but not pass/fail.

## Strategies compared

Each fixture is run, interleaved (A, B, A, B, …, as in Phase 1), for:

1. naive: full re-parse per flush (the baseline the criterion is relative to)
2. tail re-parse, one flush per chunk
3. tail re-parse with per-frame (16 ms) coalescing
4. tail re-parse with fixed flush windows of 33, 50, 100 and 200 ms (the candidate default is 50 ms, [P2-4](./decisions.md#p2-4-coalescing-policy))

5. tail re-parse with the open-fence fast path, on `F4a`, `F4b` and `F4d` ([P2-5](./decisions.md#p2-5-open-fence-fast-path); proposed, confirmed or dropped by this run)

Cost-adaptive coalescing was tried in S0 and is deferred ([P2-4](./decisions.md#p2-4-coalescing-policy)); rerun it only if S5 shows a reason.

## Method

As in Phase 1: 5 warm-up runs, then 20 measured runs, median and p90, raw JSON saved to `bench/results/<device>-<date>.json`, with commit SHAs, device model and OS version.

## Harness

- **S0 / CI proxy:** `bench/stream.mjs`, Node `--jitless`, no React.
- **Device:** the example app's bench tab gets a **Stream** run next to the existing ones (`Bench.tsx`), logging one `[bench] {…}` JSON line.
