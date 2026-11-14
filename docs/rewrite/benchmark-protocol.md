# Device benchmark protocol

How the device benchmarks are run: Phase 1 (M7) measured parse, render and memory on the S25 FE and web; Phase 2 added streaming (last section). The full results log is [`bench/results/REPORT.md`](../../bench/results/REPORT.md), summarized in [02-benchmarks](./02-benchmarks.md).

> **Pass/fail is absolute.** The original ≥ 5× exit criterion against v0.8.5 was waived by [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) and replaced by absolute F3 budgets ([P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion); `bench/budgets.json`, checked by `yarn workspace @docren/react-native-markdown-bench check:budgets <result.json>`) and a conversion budget ([P2-10](./phase-2/decisions.md#p2-10-absolute-conversion-budget-replaces-the-relative-p1-10-budget)). The v0.8.5 comparison is finished: v1 is measured alone, and the v0 parts of the original protocol (side-by-side app, v0/v1 interleaving, ratio bars) are no longer run. Results: [REPORT.md](../../bench/results/REPORT.md).

## Devices

| Class | Target | Why |
|---|---|---|
| Low-end Android (**pass/fail device**) | A budget phone with a Snapdragon 6xx / Helio G-class SoC and 4 GB RAM | Where frame drops actually happen |
| Recent iPhone | Current or previous generation | Upper bound and iOS text layout |
| Web | Chrome desktop, CPU throttled 4× in DevTools | D1 sanity check, not pass/fail |

The exact models used are recorded in the results. Simulators and emulators don't count toward the pass bar.

## Build configuration

- **Release builds only**, with Hermes enabled, New Architecture (Fabric) on, and Metro inline requires on. JS dev mode is off.
- Before each run: device charged above 50%, not on charge, airplane mode on, app freshly launched, and 10 s idle after launch.

## Fixtures

| Id | Content | Size |
|---|---|---|
| `F1` | One chat message (paragraphs, list, inline code, link) | ~1 KB |
| `F2` | Typical README (headings, code blocks, table, images with fixed sizes) | ~10 KB |
| `F3` | Long document (`F2`-style content repeated) | ~100 KB |
| `F4` | `F2` streamed in small chunks (defined exactly in the Phase 2 section) | ~10 KB |
| `F5` | Chat list: 200 × `F1`-style messages in a `FlatList` | ~200 KB total |

Fixtures are committed under `bench/fixtures/`. Images use local assets with known sizes, so network time is excluded.

## Metrics

| Metric | Definition | How measured |
|---|---|---|
| `parse` | `source → document` | `performance.now()` around `parse()` |
| `firstRender` | From starting the render to the first commit on screen | `performance.now()` before `setState` that mounts `<Markdown>`, to `onLayout` of the root container |
| `parse+firstRender` | **Pass/fail metric** | Sum of the two above, measured in one run |
| `reRenderOneBlock` | Time to commit after editing the last paragraph of `F3` | Same method as `firstRender` |
| `retainedHeap` | Hermes heap growth after rendering `F5` and forcing GC | `HermesInternal.getInstrumentedStats()` before and after, with `gc()` |
| `droppedFrames` | Frames dropped while scrolling `F5` for 5 s at fixed speed | Android: `adb shell dumpsys gfxinfo`. iOS: Instruments (Animation Hitches). |

## Method

- **Runs:** 5 warm-up runs, then 20 measured runs per metric per fixture. Report the median and p90.
- **Interleaving:** when comparing variants, alternate them (A, B, A, B, …) to cancel out thermal drift.
- **Unmount between runs:** wait 2 frames after unmounting before the next run.
- **Results:** save raw numbers as JSON (`bench/results/<device>-<date>.json`), with commit SHAs, device model and OS version.

## Harness (M3)

> Removed after Phase 2 (commit `81220d3` is the last one that has them): the example's Bench, ParseSplit and Profile tabs, `BenchList.tsx`, `BenchTree.tsx`, the helpers in `benchUtil.ts` (`frames`, `forceGc`, `heapSample`, `quantile`), the `md-v0` alias, `bench/objectTree/` and `bench/web-bench.mjs`. To re-run the device protocol (v1.0 gate, optimization pass), restore what you need from that commit with a path-limited checkout. Only the Stream tab remains.

- **Screen:** the example app's **bench** tab (`example/src/screens/Bench.tsx`). "Run full" follows the method above (5 + 20, unmount and 2 frames between runs); "Run quick" (2 + 5) checks the harness. It prints the result as one `[bench] {…}` JSON log line (`adb logcat -s ReactNativeJS`); commit SHAs are added when the file is saved to `bench/results/`.
- **Fixtures:** `bench/fixtures/index.ts` (F1–F3).
- **Release build:** `yarn example android:release` (or `expo prebuild` + `./gradlew assembleRelease`, then install the APK); `ios:release` for iOS.
- **Deviations:**
  - Fixtures have **no images**: markdown can't reference local assets without an asset resolver, and remote images would add network time.
  - `reRenderOneBlock` is measured to the **commit** (a layout effect after the content), not to `onLayout`, because an edit may not change the layout. The edited document is pre-parsed, so it measures render cost only.
  - `retainedHeap` and `droppedFrames` (F5) ran from the bench tab's list buttons (`BenchList.tsx`), one library per app launch (relaunch between runs, since heap from a process that ran something else isn't comparable).
    - `retainedHeap` is the growth in `HermesInternal.getInstrumentedStats().js_allocatedBytes` from an empty list to 200 rendered messages (including the parsed documents). It forces a GC only if the engine exposes `gc()`; the result records `gcForced`, and without it the number includes uncollected garbage.
    - `droppedFrames` scrolls the list for 5 s at 1500 px/s and counts missed frames from `requestAnimationFrame` gaps on the JS side, a proxy. The real number comes from `adb shell dumpsys gfxinfo <pkg>` (`reset` before, dump after; `[bench:list] scroll-start/end` mark the window) or Instruments. Output: one `[bench:list]` JSON log line per run.

## Pass bars

| Check | Bar |
|---|---|
| F3 `parse`, `firstRender`, `reRenderOneBlock`, `parse+firstRender` | The absolute ceilings of [P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion) (replacing the original 5× against v0.8.5) |
| `reRenderOneBlock` on `F3` | ≤ 1/10 of v1's own `firstRender` (shows memoization works) |
| `retainedHeap` on `F5` | Method and bar open; moved to the [optimization pass](./07-roadmap.md#optimization-pass-after-the-last-feature-phase) (the original "v0 / 3" bar compared different things) |
| `droppedFrames` on `F5` | Reported, not pass/fail |

The flat table vs. an object tree A/B is decided ([P1-24](./phase-1/decisions.md#p1-24-keep-the-flat-table-render-ab-against-an-object-tree)): the table stays.

---

## Streaming benchmark protocol (Phase 2)

How S0 and S5 measured the Phase 2 exit criterion. It reuses everything above (devices, build configuration, method); this section adds only what streaming changes.

### Devices and build

As in Phase 1: the Samsung Galaxy S25 FE (Hermes release build, New Architecture on, JS dev mode off) is the measured device, plus web (Chrome, CPU throttled 4×). **iPhone: deferred ([P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred)).** None was available, so Phase 2 was measured on the S25 FE and web only; run this protocol on an iPhone the first time one is cabled and record it in [02-benchmarks](./02-benchmarks.md). There is still no low-end device, so, as in [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1), a result on the S25 FE is a lower bound on a slow phone's cost.

### F4

Phase 1 sketched F4 as "`F2` streamed in 500 chunks". That leaves arrival timing open, and timing decides the result (see [why S0 comes first](./phase-2/work-breakdown.md#why-s0-comes-first)). The exact definition is [P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture); the definitions below are as accepted there:

| Id | Content | Arrival |
|---|---|---|
| `F4a` | `F2` (~10 KB) split into ~20-character chunks (500 chunks) | Paced at one chunk per 16 ms (≈ one per frame; a fast LLM stream). Bar: `streamCost` at most 5× |
| `F4b` | the same text, 50 chunks of ~195 characters | Paced at one chunk per 16 ms. Bar: `streamCost` at most 2× |
| `F4d` | `bench/fixtures/code-heavy.md` (5.6 KB, one ~4.5 KB fence), the code-heavy variant of F4 | ~20-character chunks, paced at one chunk per 16 ms. Bar: absolute, at most 20 ms total flush cost at 50 ms on the S25 FE ([P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture), accepted 2026-11-06); a ratio does not suit it (see [results](../../bench/results/REPORT.md#code-heavy-fixture)) |
| `F4c` | a real LLM transcript of ~10 KB, chunk sizes taken from the recorded token stream | Replayed with recorded timing. **Deferred, waived for Phase 2 ([P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred)):** no real transcript is collected (the transcripts in `bench/fixtures/transcripts/` are synthetic and set no bar); run it, and re-confirm or revise the P2-1 bar, when one is captured or at the v1.0 gate |

Chunks are split on UTF-16 code units, including inside surrogate pairs and tokens, exactly as a real stream is.

### Metrics

| Metric | Definition | How measured |
|---|---|---|
| `streamCost` | Sum of flush time (tail parse + splice + document creation), as a multiple of one `parse()` of the full text | `performance.now()` around each `flush`, summed |
| `streamRender` | Sum of commit time per flush for `<Markdown document>` | As `firstRender` in Phase 1 |
| `perFlushP90` | 90th-percentile single flush time | Same samples |
| `droppedFrames` | Frames dropped during the stream | Android: `dumpsys gfxinfo` |
| `retainedHeap` | Hermes heap growth after the stream ends and GC runs, vs one static document | `HermesInternal.getInstrumentedStats()` |
| `finalDone` | Time of `done()` (the final full parse) | `performance.now()` |

The **pass/fail metric** is `streamCost` for `F4a` and `F4b` (and `F4c` once recorded), against the bars fixed in P2-1, with the default flush window (50 ms, the window the P2-1 bars assume, [P2-4](./phase-2/decisions.md#p2-4-coalescing-policy)). Because the criterion is about parse cost, `streamRender` and `droppedFrames` are recorded but not pass/fail.

### Strategies compared

Each fixture is run, interleaved (A, B, A, B, …, as in Phase 1), for:

1. naive: full re-parse per flush (the baseline the criterion is relative to)
2. tail re-parse, one flush per chunk
3. tail re-parse with per-frame (16 ms) coalescing
4. tail re-parse with fixed flush windows of 33, 50, 100 and 200 ms (the bars assume 50 ms, [P2-4](./phase-2/decisions.md#p2-4-coalescing-policy))
5. tail re-parse with the open-fence fast path, on `F4a`, `F4b` and `F4d` ([P2-5](./phase-2/decisions.md#p2-5-open-fence-fast-path); accepted)

Cost-adaptive coalescing was tried in S0 and is deferred ([P2-4](./phase-2/decisions.md#p2-4-coalescing-policy)); rerun it only if S5 shows a reason.

### Method

As in Phase 1: 5 warm-up runs, then 20 measured runs, median and p90, raw JSON saved to `bench/results/<device>-<date>.json`, with commit SHAs, device model and OS version.

### Harness

- **S0 / CI proxy:** `bench/stream.mjs`, Node `--jitless`, no React.
- **Device:** the example app's **Stream** tab (`example/src/screens/StreamBench.tsx`), a permanent screen. It streams F2 (`F4a`, `F4b`, a 1-character drip) or the code-heavy `F4d` text through the public `useMarkdownStream`, with the options in a sheet, and logs one `[streamBench i/n] {…}` JSON line per run (read with `adb logcat -d -s ReactNativeJS -v raw | grep '^\[streamBench'`). Per run: commits, frame gaps, append-to-commit latency, total time and whether the final document equals `parse(full)`. Because it uses only the public API it cannot flip the fence fast path or read per-flush cost; the S2 runs that did are in `bench/results/scheduler-device-s25fe-release-*.json`.
