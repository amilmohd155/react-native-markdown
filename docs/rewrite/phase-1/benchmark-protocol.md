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
