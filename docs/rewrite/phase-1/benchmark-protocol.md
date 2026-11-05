# Phase 1 · Device benchmark protocol

This is how M7 measures the Phase 1 exit criterion (≥ 5× faster parse plus first render on a low-end Android device) and the remaining open item (render cost of the flat table vs. an object tree). Results go into [`../02-benchmarks.md`](../02-benchmarks.md) under a new "Device results" section.

## Devices

| Class | Target | Why |
|---|---|---|
| Low-end Android (**pass/fail device**) | A budget phone with a Snapdragon 6xx / Helio G-class SoC and 4 GB RAM | Where frame drops actually happen |
| Recent iPhone | Current or previous generation | Upper bound and iOS text layout |
| Web | Chrome desktop, CPU throttled 4× in DevTools | D1 sanity check, not pass/fail |

The exact models used are recorded in the results. Simulators and emulators don't count toward the pass bar.

## Build configuration

- **Release builds only**, with Hermes enabled, New Architecture (Fabric) on, and Metro inline requires on. JS dev mode is off.
- The same example app binary runs both versions: a benchmark screen imports v0.8.5 and v1 side by side, from two aliased packages.
- Before each run: device charged above 50%, not on charge, airplane mode on, app freshly launched, and 10 s idle after launch.

## Fixtures

| Id | Content | Size |
|---|---|---|
| `F1` | One chat message (paragraphs, list, inline code, link) | ~1 KB |
| `F2` | Typical README (headings, code blocks, table, images with fixed sizes) | ~10 KB |
| `F3` | Long document (`F2`-style content repeated) | ~100 KB |
| `F4` | `F2` streamed in 500 chunks (phase 2 baseline; record only in phase 1) | ~10 KB |
| `F5` | Chat list: 200 × `F1`-style messages in a `FlatList` | ~200 KB total |

Fixtures are committed under `bench/fixtures/`. Images use local assets with known sizes, so network time is excluded.

## Metrics

| Metric | Definition | How measured |
|---|---|---|
| `parse` | `source → document` | `performance.now()` around `parse()` (v1), or `fromMarkdown` + transforms (v0.8.5) |
| `firstRender` | From starting the render to the first commit on screen | `performance.now()` before `setState` that mounts `<Markdown>`, to `onLayout` of the root container |
| `parse+firstRender` | **Pass/fail metric** | Sum of the two above, measured in one run |
| `reRenderOneBlock` | Time to commit after editing the last paragraph of `F3` | Same method as `firstRender` |
| `retainedHeap` | Hermes heap growth after rendering `F5` and forcing GC | `HermesInternal.getInstrumentedStats()` before and after, with `gc()` |
| `droppedFrames` | Frames dropped while scrolling `F5` for 5 s at fixed speed | Android: `adb shell dumpsys gfxinfo`. iOS: Instruments (Animation Hitches). |

## Method

- **Runs:** 5 warm-up runs, then 20 measured runs per metric per fixture. Report the median and p90.
- **Interleaving:** alternate v0.8.5 and v1 runs (A, B, A, B, …) to cancel out thermal drift.
- **Unmount between runs:** wait 2 frames after unmounting before the next run.
- **Results:** save raw numbers as JSON (`bench/results/<device>-<date>.json`), with commit SHAs, device model and OS version.

## Harness (M3)

- **Screen:** the example app's **bench** tab (`example/src/screens/Bench.tsx`). "Run full" follows the method above (5 + 20, interleaved, unmount and 2 frames between runs); "Run quick" (2 + 5) checks the harness. It prints the result as one `[bench] {…}` JSON log line (`adb logcat -s ReactNativeJS`); commit SHAs are added when the file is saved to `bench/results/`.
- **Fixtures:** `bench/fixtures/index.ts` (F1–F3). v0.8.5 comes from npm as the `md-v0` alias in the example app.
- **Release build:** `yarn example android:release` (or `expo prebuild` + `./gradlew assembleRelease`, then install the APK); `ios:release` for iOS.
- **Deviations, for now:**
  - Fixtures have **no images** yet: markdown can't reference local assets without an asset resolver, and remote images would add network time.
  - `reRenderOneBlock` is measured to the **commit** (a layout effect after the content), not to `onLayout`, because an edit may not change the layout. v1 gets the edited document pre-parsed, so it measures render cost only; v0 can't take a pre-parsed document, so its number includes parsing.
  - v0 has no separate `parse` / `firstRender` split (it parses during render); only `parse+firstRender` compares both.
  - `retainedHeap` and `droppedFrames` (F5) run from the bench tab's **List · v0 / List · v1** buttons (`BenchList.tsx`), one library per app launch (relaunch between runs: heap from a process that ran the other library isn't comparable).
    - `retainedHeap` is the growth in `HermesInternal.getInstrumentedStats().js_allocatedBytes` from an empty list to 200 rendered messages (v1 includes its parsed documents). It forces a GC only if the engine exposes `gc()`; the result records `gcForced`, and without it the number includes uncollected garbage.
    - `droppedFrames` scrolls the list for 5 s at 1500 px/s and counts missed frames from `requestAnimationFrame` gaps on the JS side, a proxy. The protocol's number still comes from `adb shell dumpsys gfxinfo <pkg>` (`reset` before, dump after; `[bench:list] scroll-start/end` mark the window) or Instruments.
    - Output: one `[bench:list]` JSON log line per run (same chunked format as `[bench]`).
  - The table vs. object tree A/B runs from the bench tab's **Table vs. object tree** card (`BenchTree.tsx`): **A/B · 5+20** (F2 and F3 `firstRender` and `reRenderOneBlock`, interleaved, tree conversion timed apart as `convert`), **F3 heap · table / tree** (one model per app launch) and **List · tree** for F5 heap. The object-tree renderer is the bench-only `bench/objectTree/` (the `objectTreeModel` flag); logs are `[bench:tree]`, `[bench:tree:heap]` and `[bench:list]`.

## Pass bars

| Check | Bar |
|---|---|
| **Exit criterion** | `parse+firstRender` on `F3`, low-end Android: v1 median ≤ v0.8.5 median / 5 |
| `reRenderOneBlock` on `F3` | v1 ≤ 1/10 of v1's own `firstRender` (shows memoization works) |
| `retainedHeap` on `F5` | v1 ≤ v0.8.5 / 3 (expected about 5×, based on the Node measurements in [08](../08-model-and-api.md#measurements)) |
| `droppedFrames` on `F5` | Reported and compared, not pass/fail in phase 1 |

## Table vs. object tree A/B (the remaining open item)

- **Build:** a test-only `objectTreeModel` flag that builds an object tree (option B in [08](../08-model-and-api.md#options)) behind the same renderer interface.
- **Measure** `firstRender`, `reRenderOneBlock` and `retainedHeap` on `F3` and `F5` with both models.
- **Decision rule:**
  - Keep the flat table unless its `firstRender` is more than 10% slower **and** its memory advantage is under 2× on the low-end device.
  - Record the outcome as a P1 decision.
