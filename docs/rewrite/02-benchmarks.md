# 02 · Benchmarks

## Question

How much of the cost is the parser, and what are the realistic alternatives on a JS engine with no JIT, like Hermes?

## Method

- Script: [`bench/bench.mjs`](../../bench/bench.mjs), with dependency versions pinned in [`bench/package.json`](../../bench/package.json).
- Fixture: markdown-it's README plus a GFM snippet (table, task list, strikethrough, autolink literal), repeated N times.
- Each parser gets 3 warm-up runs, then the median of 11 timed runs.
- Run on Node 22 in a Linux cloud container. `--jitless` turns off V8's optimizing JIT, which is a **rough proxy** for Hermes. Hermes runs precompiled bytecode with no JIT.
- GFM is enabled wherever the parser supports it. commonmark.js has no GFM.

> ⚠️ These are not device measurements. Read the ratios between parsers, not the absolute times. Phase 1 of the [roadmap](./07-roadmap.md) includes re-running these on Hermes on a real mid-range Android device.

## Results: parse only

| Parser | 8 KB | 97 KB | 97 KB, `--jitless` |
|---|---|---|---|
| **micromark + mdast** (current) | 15.2 ms | 207 ms | **607 ms** |
| markdown-it 15 (tokens) | 2.5 ms | 14 ms | 73 ms |
| marked 18 (lexer, GFM) | 1.8 ms | 10 ms | 43 ms |
| commonmark.js 0.31 (no GFM) | 1.0 ms | 6 ms | 35 ms |

## Results: naive streaming

Re-parsing the full 8 KB buffer at each of 200 append steps, as a chat UI does today:

| Parser | JIT | `--jitless` |
|---|---|---|
| micromark + mdast | 1,172 ms | **4,608 ms** |
| marked | 88 ms | 368 ms |

## Takeaways

1. **The parser alone rules out the current design for long or streamed content.** At about 600 ms for 97 KB without a JIT, micromark drops many frames before React does any work.
2. **markdown-it and marked are both an order of magnitude faster.** markdown-it is preferred because it claims full CommonMark compliance and has a mature plugin system for GFM extras. See [03](./03-architecture.md#1-parser-layer).
3. **Even a fast parser loses if every streamed chunk re-parses the whole document.** It's still O(n²) over a message. Streaming needs to re-parse only the tail. See [05](./05-streaming.md).
4. **Native parsers exist and are faster still.** md4c and cmark-gfm are C, called over JSI. `react-native-nitro-markdown` reports about 38–57 ms p50 for a 328 KB document on Pixel 7 / iPhone simulators. Those are the project's own numbers on a different fixture, so they aren't directly comparable.

## Reproduce

From the repo root, after `yarn install` (the `bench/` workspace is installed with the rest of the repo):

```bash
yarn workspace @docren/react-native-markdown-bench bench          # 8 KB + streaming simulation
yarn workspace @docren/react-native-markdown-bench bench:large    # ~97 KB
yarn workspace @docren/react-native-markdown-bench bench:jitless  # ~97 KB, no JIT
```

## Device results (preliminary, M1)

First measurements on real Hermes, taken during M1 to tune P1-9 and P1-10. M7 repeats them with the full [benchmark protocol](./phase-1/benchmark-protocol.md) on a low-end Android and an iPhone.

- **Device:** Samsung Galaxy S25 FE (SM-S731B, Exynos 2400), Android 37. Upper-mid range, **not** the low-end pass/fail device.
- **Build:** the example app as a release build (`expo run:android --variant release`): Hermes, precompiled bytecode, `__DEV__ = false`.
- **Method:** a temporary benchmark screen (not committed) running the same fixtures as the Node scripts. Median of 51 runs (1 KB) or 11 runs (97 KB) after 3 warm-up runs; v0 with fewer runs. Date: 2026-11-04.

| Measurement | 1 KB (6 blocks) | 97 KB (900 blocks) |
|---|---|---|
| markdown-it parse | 1.52 ms | 107.95 ms |
| token → table conversion | 0.10 ms (6.7% of parse) | 15.95 ms (**14.8%** of parse) |
| v1 `parse()` end to end | 1.13 ms | 122.41 ms |
| v0 `fromMarkdown` (current library) | 5.62 ms | 1,543.57 ms |
| **v1 vs v0** | **5.0× faster** | **12.6× faster** |
| block identity: FNV-1a hash of every block (before P1-9) | 0.09 ms | 12.24 ms |
| block identity: `isSameBlock` on every block (P1-9) | 0.00 ms | 6.13 ms |

What this shows:

- **v1 parses 5–12.6× faster than v0 on Hermes.** The gap grows with document size.
- **Node `--jitless` underestimates Hermes.** Conversion is 14.8% of parse on the device versus 11.2% in Node `--jitless`. The P1-10 budget (15%) passes on Hermes with little margin; the node builder is the place to optimize if M7's low-end device needs it.
- **Text comparison costs more on Hermes than on V8.** Hermes copies substrings, so comparing all 900 blocks costs 6.13 ms (0.10 ms in Node; timed all at once; per-flush cost in a stream measured at 0.43 ms in S5, see [isSameBlock comparator](#issameblock-comparator-s5-s25-fe)). It's still 2× cheaper than hashing, and it only runs on re-render against a previous document, which always follows a ~122 ms parse. Hashing would cost 12.24 ms on every parse. Caching each block's text on its table after the first comparison would halve the copies for consecutive re-renders, if ever needed.

## Device results (preliminary, M3)

First parse-plus-render measurement of the M3 renderer against v0.8.5, with the [benchmark protocol](./phase-1/benchmark-protocol.md#harness-m3)'s harness. M7 repeats it on the low-end pass/fail device.

- **Device:** Samsung Galaxy S25 FE (SM-S731B), Android 37. Upper-mid range, **not** the pass/fail device.
- **Build:** the example app as a release build (`expo prebuild` + `gradlew assembleRelease`): Hermes, bytecode, `__DEV__ = false`, New Architecture.
- **Method:** the **bench** tab, "full" mode: 5 warm-up + 20 measured runs per fixture, v0 and v1 alternating, unmount and 2 frames between runs. Fixtures from `bench/fixtures/` (no images). Raw data: [`bench/results/sm-s731b-2026-11-04.json`](../../bench/results/sm-s731b-2026-11-04.json).
- **Conditions:** airplane mode on, battery 68% but charging over USB (needed for adb), phone warm (36.9 °C) at the start. Date: 2026-11-04.

Medians (p90 in the raw data), milliseconds:

| Metric | F1 (0.8 KB) v1 / v0 | F2 (9.5 KB) v1 / v0 | F3 (98 KB) v1 / v0 |
|---|---|---|---|
| `parse` (v1) | 4.6 | 18.8 | 194.8 |
| `firstRender` (v1) | 23.0 | 89.3 | 254.1 |
| `parse+firstRender` | 28.3 / 25.5 (**0.9×**) | 113.4 / 79.1 (**0.7×**) | 448.1 / 457.6 (**1.0×**) |
| `reRenderOneBlock` | 2.8 / 11.0 (**4.0×**) | 4.6 / 35.1 (**7.6×**) | 33.9 / 380.0 (**11.2×**) |

Parse only, same fixtures, Node `--jitless` (`bench/fixtures-parse.mjs`): v1 `parse()` 0.5 / 7.8 / 77.9 ms vs v0's `fromMarkdown` (no GFM) 1.4 / 18.0 / 179.9 ms, **2.3–2.8×** faster.

What this shows:

- **Memoization works, but misses its bar narrowly.** Editing one block of F3 costs 33.9 ms, 11× less than v0. The protocol's bar is ≤ 1/10 of v1's own `firstRender` (254.1 ms → 25.4 ms): at 13% it misses. With 554 blocks, comparing every block (P1-9: 6.1 ms on this device in M1) and reconciling the block list are a fixed cost per edit; worth profiling before M7.
- **First render is not faster than v0.8.5 yet: 0.7–1.0×, against the ≥ 5× exit criterion.** Two reasons:
  - **The comparison isn't like for like.** v0.8.5 parses without GFM: its `fromMarkdown` call has no micromark GFM syntax, and its `extensions` prop only takes mdast extensions, so GFM can't be turned on. F2/F3's tables (F3: 34 tables, 952 cells), task lists, strikethrough, autolinks and footnotes are plain text in v0, and v1 renders them all as elements, tables with a measuring pass.
  - **v1's render dominates.** On F3, `firstRender` (254 ms) is more than its parse (195 ms). The M1 estimate of 12.6× (parse only, against a GFM-capable parse) doesn't carry over to parse + render.
- **The exit criterion needs a fair baseline before M7.** Options: compare on CommonMark-only content (where v0 does the same work), and/or measure v1's render cost against element count, and profile it (tables, the per-code-block `ScrollView`, prop and element creation). To decide in M7 planning; recorded as an open item, not a decision.

## Device results (M7)

The [benchmark protocol](./phase-1/benchmark-protocol.md) run on the hardware available. The pass/fail device (a low-end Android) and an iPhone were **not** available, so the Phase 1 exit criterion was not measured as specified; see [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1).

- **Android:** Samsung Galaxy S25 FE (SM-S731B), Android 37, release build (Hermes, bytecode, `__DEV__ = false`, New Architecture). Not the pass/fail device. Raw data: [`bench/results/sm-s731b-2026-11-05.json`](../../bench/results/sm-s731b-2026-11-05.json).
- **Web:** Chrome 156 headless on a Mac, 4× CPU throttle (CDP), production export of the example. A sanity check, not pass/fail. Raw data: [`bench/results/web-chrome156-4x-2026-11-05.json`](../../bench/results/web-chrome156-4x-2026-11-05.json).
- **Method:** bench tab, "full" mode (5 warm-up + 20 measured, v0 and v1 alternating), fresh launch and 10 s idle. Heap runs: one library per app launch, `gc()` forced. Date: 2026-11-05.
- **Conditions (S25 FE):** battery 100%, charging over USB (needed for adb), 35.0 °C, no call. Airplane mode was **off** (the protocol asks for on).

### `parse+firstRender` and re-render (medians, ms)

| Metric | F1 v1 / v0 | F2 v1 / v0 | F3 v1 / v0 |
|---|---|---|---|
| S25 FE `parse` (v1) | 3.7 | 19.6 | 215.8 |
| S25 FE `firstRender` (v1) | 21.4 | 87.4 | 242.7 |
| S25 FE `parse+firstRender` | 25.2 / 24.6 (**1.0×**) | 107.3 / 75.1 (**0.7×**) | 458.6 / 447.5 (**1.0×**) |
| S25 FE `reRenderOneBlock` | 6.0 / 12.8 (**2.1×**) | 4.0 / 33.7 (**8.5×**) | 15.9 / 437.5 (**27.5×**) |
| Web 4× `parse+firstRender` | 19.5 / 19.5 (**1.0×**) | 39.4 / 41.7 (**1.06×**) | 384.2 / 416.6 (**1.08×**) |
| Web 4× `reRenderOneBlock` | 2.4 / 5.1 (**2.1×**) | 2.4 / 22.0 (**9.2×**) | 4.1 / 221 (**54×**) |

- **Exit criterion (≥ 5× on `parse+firstRender`, F3): not met.** 1.0× on the S25 FE and 1.08× on web. The M3 explanation holds: v0.8.5 has no GFM (so v1 does more work on F2/F3), and v1's render dominates its total (243 ms against 216 ms of parse on device; about 90% on web). Parse on Hermes is about 2.8× the Node `--jitless` figure above (216 against 78 ms on F3). Waived for Phase 1, carried into Phase 2: [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1). Follow-up (2026-11-06): the CommonMark-only baseline, the `firstRender` profile and the Hermes parse profile are in [Phase 1 carry-over](#phase-1-carry-over-36-p1-25); the like-for-like ratio is 2.0×, not 5×.
- **Memoization bar (`reRenderOneBlock` ≤ 1/10 of v1's `firstRender`, F3): met.** 15.9 ms against 242.7 ms is 6.6% on device (M3: 13%) and 1.2% on web.

### F5: chat list, 200 messages (S25 FE)

160 KB of F1-style messages in a `FlatList`. `retainedHeap` is the growth of Hermes `js_allocatedBytes` after a forced GC, from an empty list to the rendered one. v1 and the tree keep **all 200** parsed documents (parsed ahead, as a chat app would); v0 keeps only the mounted window, since it parses in render. Dropped frames: JS-side count while scrolling 5 s at 1500 px/s (a proxy), and `dumpsys gfxinfo` for v0 and v1.

| | v0.8.5 | v1 (table) | v1 (object tree) |
|---|---|---|---|
| `retainedHeap` | 0.57 MB | 1.87 MB | 2.16 MB |
| Dropped frames (JS-side) | 77 / 522 | 47 / 551 | 44 / 560 |
| gfxinfo janky frames | 25 / 548 (4.6%) | 21 / 577 (3.6%) | not taken |
| gfxinfo p99 frame time | 15 ms | 10 ms | not taken |

- **`retainedHeap` bar (v1 ≤ v0 / 3): not met with this method.** The two sides don't hold the same things (all parsed documents against the mounted window), so the number isn't an apples-to-apples memory comparison. The method stays as it is for now; the bar carries into Phase 2 with the other open items. `droppedFrames` is reported only, and v1 is not worse than v0.

### Table vs. object tree (S25 FE, 5 + 20, medians)

| | Table | Object tree |
|---|---|---|
| F2 `firstRender` | 74.2 ms | 77.8 ms (+5%) |
| F3 `firstRender` | 260.5 ms | 263.0 ms (+1%) |
| F3 `reRenderOneBlock` | 17.6 ms | 17.9 ms |
| F3 `retainedHeap` | 11.64 MB | 12.14 MB (+4%) |
| F5 `retainedHeap` | 1.87 MB | 2.16 MB (+16%) |

Web (4× throttle): F3 `firstRender` 262.2 ms (table) against 255.3 ms (tree), a tie within the p90 spread. The table is not slower and uses less memory, so the flat table stays: [P1-24](./phase-1/decisions.md#p1-24-keep-the-flat-table-render-ab-against-an-object-tree).

### Not re-measured in M7

- `isSameBlock` against hashing every block ([P1-9](./phase-1/decisions.md)) and the node builder's share of parse time ([02 · Device results](#device-results-preliminary-m1)), on a low-end device: there is no such device, and the S25 FE results above are the M1 ones.

## Phase 2 device results (summary)

Where to look first. Each row links to the section that holds the tables and the method. All raw data is in `bench/results/*-2026-11-06.json`. The bars come from [P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture); the verdict is the exit review in the [Phase 2 README](./phase-2/README.md#exit-review-2026-11-06). Multiples (`streamCost`) are total flush cost over one full `parse()` of the same text, at the 50 ms window, p50 / p90 of 20 runs after 5 warm-up runs.

| Platform | Build / environment | What was measured | Headline result against the bar | Detail |
|---|---|---|---|---|
| Web, Chrome 156, 4x CPU throttle (simulation) | `bench/stream-web.mjs`, headless Chrome on an Apple M1; tail parse and conversion only, no splice, no React | `F4a`, `F4b`, `F4d` | `F4a` 4.28x / 4.80x (bar 5x, pass, thin p90 margin); `F4b` 1.42x / 1.59x (bar 2x, pass); `F4d` 5.6 / 6.8 ms total. Not the verdict for the hook (it leaves out the splice and the full re-parses) | [Web](#phase-2-web-benchmark-s5-web-part) |
| S25 FE, `sim` harness | Hermes release, New Architecture, 120 Hz; same code as the web run | `F4a`, `F4b`, `F4d` | `F4a` 3.48x / 3.72x, `F4b` 1.32x / 1.39x (both pass on the same phone: the gap below is not the tail parse) | [S25 FE](#phase-2-device-benchmark-s5-s25-fe) |
| S25 FE, `core` (the real stream core) | Same device and build; `parseFrom`, splice, full-reparse triggers, `done()` | `F4a`, `F4b` (F2 ends in a footnote definition) | `F4a` **6.30x / 7.11x** (bar 5x) and `F4b` **2.46x / 2.51x** (bar 2x): miss, caused by footnote full re-parses (2 and 1). **Waived and accepted** by P2-1 for documents that end in a footnote definition | [S25 FE](#phase-2-device-benchmark-s5-s25-fe) |
| S25 FE, `core`, footnote-free F2 | Same; variants `R` (footnote removed) and `P` (plain paragraph) | `F4a`, `F4b` against the **original** bars | `F4a` 4.32x / 4.34x (`R`) and 4.28x / 4.40x (`P`), bar 5x; `F4b` 1.42x / 1.44x and 1.42x / 1.45x, bar 2x: **pass**, 0 full re-parses. Only at the 50 ms window (no window: 10.6x) | [Footnote-free](#footnote-free-variant-s25-fe) |
| S25 FE, `F4d` absolute | `core`, code-heavy fixture, fast path on | Total flush cost at 50 ms | **15.5 / 15.7 ms** against at most 20 ms: pass (26.6 / 33.3 ms with the fast path off) | [S25 FE](#f4d-code-heavy-5619-characters-20-character-chunks-281-chunks-absolute-cost-1) |
| S25 FE, splice and heap | `core`, instrumented scratch copy | Splice time, `done()`, retained heap | Splice 0.026 ms each at p50 (3.5 ms per `F4a` stream, about 3% of flush cost); `done()` 16.75 ms (`F4a`); retained heap +39,166 bytes (`F4a`), +13,639 (`F4d`). No bar | [Splice](#splice-cost-and-done), [heap](#heap) |
| S25 FE, React hook | `useMarkdownStream`, 150 runs, none rejected | 50 ms timer against `raf` | `F4a` 129 against 465 commits, `streamRender` 1344 against 2268 ms; render p90 15.5 against 8.3 ms; janky frames 70.2% against 45.6%. Input to P2-4, no change of default. No bar | [Hook](#react-hook-50-ms-timer-against-raf) |
| S25 FE, `isSameBlock` comparator | Hermes release, 12 runs per variant, 58 and 862 blocks | Cost of the source comparison per flush, because the prefix fast path does not fire through `<Block>` | 0.151 ms p50 at 58 blocks, 0.428 ms at 862 blocks (at most 0.8% of stream time). **Gap accepted**, no code fix (P2-2) | [`isSameBlock`](#issameblock-comparator-s5-s25-fe) |
| S25 FE, background and resume | Scratch app on the public hook, 20 runs | Timer 50 ms and `raf`, JS and native producers, 3 s and 15 s in the background, screen off and on | No bug: final document equals `parse(full)` in 20 of 20, one flush after resume (10 to 59 ms), scheduler freezes with the host. No scheduler change | [Background](#native-background-and-resume-s25-fe) |
| iPhone | none available | `raf` on iOS (`CADisplayLink`), flush cost, frame pacing, iOS background and resume, the P2-5 fast path check | **Waived (P2-8)**, not measured | [Waived](#waived-p2-8) |
| `F4c` (real LLM transcript) | none collected; the transcripts in `bench/fixtures/transcripts/` are synthetic | Replay with recorded timing, re-confirmation of the P2-1 bars | **Waived (P2-8)**, not measured | [Waived](#waived-p2-8) |

Reading order for the Phase 2 material below: the [S0 spike](#phase-2-streaming-spike-s0) (Node proxy, how the bars were set), the [S1 stream core](#s1-stream-core-node-proxy) and the [S2 scheduler](#phase-2-scheduler-s2) (how the default was chosen), then the S5 runs in the table above.

### Waived (P2-8)

[P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred) (accepted 2026-11-06) waives the iPhone run and `F4c` for Phase 2 and defers them. There is no iPhone, and no real transcript or API access to record one. S25 FE and web evidence stands. Revisit when an iPhone is first cabled, when a real transcript with timing is captured, or at the v1.0 gate ([roadmap](./07-roadmap.md#v10-release-gate)).

## Phase 2 streaming spike (S0)

Question: what does streaming a 10 KB message cost, as a multiple of one full `parse()`, for different chunk sizes and flush policies? Decisions that follow: [P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture), [P2-4](./phase-2/decisions.md#p2-4-coalescing-policy), [P2-5](./phase-2/decisions.md#p2-5-open-fence-fast-path).

**Setup:** Node `--jitless`; F2 (9,724 characters, 586 nodes, 58 blocks); the real markdown-it parser and the token-to-node-table conversion. Arrival is simulated at 1,250 characters per second, so a 20-character chunk arrives every 16 ms. One full `parse()` takes 7.0 to 7.2 ms. `streamCost` is the total flush cost divided by one full `parse()`. The naive figures are interpolated from 40 prefix parses.

### `streamCost` by chunk size

| Strategy | 1 char | 2 chars | 20 chars | 195 chars |
|---|---|---|---|---|
| naive full re-parse per chunk | 4633× | 2327× | 234× | 24.5× |
| tail re-parse per chunk | 197× | 96× | 10.7× | 1.96× |
| tail + 16 ms frame coalescing | 10.7× | 10.7× | 10.7× | 1.97× |

Adaptive throttling gave the same result as frame coalescing: each flush costs about 0.37 ms, far below a frame, so the throttle never engages. On F2, tail re-parse with the open-fence fast path was 10.5× at 20 characters; it skipped 78 of 487 flushes and saved about 1.5%, because F2 has little fenced code. A code-heavy stream behaves differently: see [Code-heavy fixture](#code-heavy-fixture).

### Fixed flush window, 20-character chunks

| Window | Flushes | `streamCost` | Lag mean / max (ms) |
|---|---|---|---|
| none | 487 | 11.3× | 0.2 / 0.7 |
| 16 ms | 487 | 11.3× | 0.2 / 0.6 |
| 33 ms | 237 | 6.14× | 16.1 / 32.5 |
| 50 ms | 157 | 4.36× | 24.1 / 48.7 |
| 100 ms | 79 | 2.72× | 48.2 / 96.7 |
| 200 ms | 40 | 1.84× | 96.3 / 192.7 |

At 195-character chunks every window up to 100 ms stays at 2.0 to 2.2×, and 200 ms gives 1.83×.

### Cost by open block kind

Share of tail flush cost, by the kind of block that was open:

| Chunk | Fenced code | Table | List | Other |
|---|---|---|---|---|
| 20 chars | 4.6% | 33.6% | 23.8% | 38.0% |
| 195 chars | 13.4% | 17.2% | 18.7% | 50.8% |

On F2, fenced code is a small share of the cost. The code-heavy fixture below reverses that. The earlier throwaway check (tail re-parse, markdown-it only) gave 10.4× at 500 chunks and 2.0× at 50 chunks, which matches.

### Code-heavy fixture

F2 has little fenced code, so it understates the cost of an open fence. `bench/fixtures/code-heavy.md` is hand-written: 5,619 characters, 6 blocks, 22 nodes, one TypeScript fence of about 4.5 KB plus a short list and a small second fence. One full `parse()` takes 0.65 ms. Node `--jitless`, 3 runs, same arrival rate as above.

`streamCost`, 20-character chunks (281 flushes):

| Strategy | `streamCost` |
|---|---|
| naive full re-parse per chunk | 117× |
| tail re-parse | 56.9× |
| tail + 16 ms frame coalescing | 61.3× |
| tail + adaptive throttling | 55.8× |
| tail + open-fence fast path | 7.24× (249 of 281 flushes skipped; 4.7 ms total against 37.3 ms) |

`streamCost`, 195-character chunks (29 flushes): naive 11.95×; tail 6.79×; tail + open-fence fast path 1.63× (24 of 29 flushes skipped; 1.1 ms against 4.4 ms).

Fixed flush window, tail re-parse without the fast path, 20-character chunks:

| Window | `streamCost` | Lag mean / max (ms) |
|---|---|---|
| none | 55.8× | |
| 16 ms | 67.4× | |
| 33 ms | 31.1× | 15.9 / 32.3 |
| 50 ms | 19.1× | 24.0 / 48.4 |
| 100 ms | 9.96× | 48.0 / 96.4 |
| 200 ms | 5.46× | 96.8 / 192.3 |

At 195-character chunks every window up to 100 ms stays at about 6.7×, and 200 ms gives 5.5×.

Share of tail flush cost by open block kind, against F2:

| Fixture | Chunk | Fenced code | Table | List | Other |
|---|---|---|---|---|---|
| code-heavy | 20 chars | 89.0% | 0% | 7.1% | 3.9% |
| code-heavy | 195 chars | 86.2% | 0% | 13.8% | 0% |
| F2 | 20 chars | 4.6% | 33.6% | 23.8% | 38.0% |
| F2 | 195 chars | 13.4% | 17.2% | 18.7% | 50.8% |

Caveats:

- **The multiples are inflated.** A code block parses very fast (22 nodes), so the full-parse denominator is tiny. In absolute terms the whole 5.6 KB stream costs 37 ms of flush time without the fast path and 4.7 ms with it (about 0.13 ms per flush against 0.02), spread over about 4.5 s. On Hermes, at roughly 2.8× Node `--jitless`, that is about 100 ms against 13 ms.
- **A ratio may be the wrong test for code-heavy streams.** The exit criterion is a ratio ([P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture)); whether it suits code-heavy streams is a question for the P2-1 device experiments.
- **Equivalence is not shown.** The spike's fast path only appends text. It builds no document and does not compare with a full parse, so the equivalence harness must cover it if it ships ([P2-5](./phase-2/decisions.md#p2-5-open-fence-fast-path)).
- **Windows alone do not fix code-heavy streams.** A 50 ms window still gives 19×; the fast path reaches 7.2× with no added lag.

Reproduce: `cd bench && node --jitless --import tsx stream.mjs 3 --text fixtures/code-heavy.md --sizes 20,195`

### Caveats

- **Splice and React commit are not included.** The splice does not exist yet; S1 and S5 measure it and the commit. The default in [P2-2](./phase-2/decisions.md#p2-2-splice-strategy) stays as proposed.
- **Node `--jitless` is a proxy.** Phase 1 found Hermes parsing about 2.8× slower than Node `--jitless`. The ratios should carry over, and S5 re-checks them on the S25 FE.
- **No real LLM transcripts (F4c).** No API key or recording was available. `bench/fixtures/transcripts/` holds synthetic ones (about 1.3 to 1.5 KB each, authored and modelled; 24 to 32× unbatched, 5× at 200 ms). They must not set the bar. F4c was not recorded and is waived for Phase 2 ([P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred)); see `bench/fixtures/transcripts/SOURCES.md`.
- **The spike's tail path ends with 57 blocks, a full parse with 58.** F2 ends with a footnote definition `[^perf]:`, and the tail parse cannot see the earlier reference. The design already handles this (a footnote definition is a full re-parse trigger and the footnote section is always open, see [stream-algorithm](./phase-2/stream-algorithm.md)), so S1 must implement it; the spike does not.

### Reproduce

```bash
cd bench && yarn stream:jitless                         # all strategies on F2
cd bench && yarn stream:jitless --transcript file       # replay a transcript from bench/fixtures/transcripts
```

## S1 stream core (Node proxy)

Measured on Node/V8, not Hermes. These are proxy numbers, to be re-measured at S5 on the S25 FE.

- **Splice:** about 0.105 ms at 900 blocks with one tail block changed.
- **900-block mixed document (45.7 KB):** one full parse takes 63 ms.
  - 20-character chunks: 2285 appends, mean 0.32 ms per append, p95 1 ms. Characters re-parsed per append: mean 58, max 129. The whole stream costs 11.5x one full parse.
  - 100-character chunks: 457 appends, mean 0.59 ms per append, total 4.3x one full parse.
  - The per-append cost late in the document equals the early cost: the work is independent of document size.
- **Pathological single-block inputs, 1 KB chunks, no coalescing:** quadratic by nature.

| Input | Flushes | Streamed | One parse |
|---|---|---|---|
| `![[]()` repeated | 938 | 392.6 s | 881 ms (~446 parses, about flushes / 2) |
| `[ (](` repeated | 196 | 3.9 s | 53 ms |
| nested strong and emphasis | | 66 s | |
| backticks | | 105 s | |
| unclosed `<!--` | | 115 s | |

All other cases stay under 10 s.

The tail re-parse behaves as designed: the cost is flushes x open-block size. So the flush window ([P2-4](./phase-2/decisions.md#p2-4-coalescing-policy) coalescing, S2) and the S5 device numbers are what matter. The test therefore asserts streamed cost <= 2 x (flushes + 1) x one full parse, not a fixed 60x, and runs the full inputs only under `STREAM_PATHOLOGICAL_FULL=1` (about 12 minutes). See [testing-harness](./phase-2/testing-harness.md#pathological-input).

## Phase 2 scheduler (S2)

Which flush schedule `useMarkdownStream` uses by default ([P2-4](./phase-2/decisions.md#p2-4-coalescing-policy)): a per-frame flush (`raf`) or a timer window (`timeout`). Result: `raf` on iOS and Android, a 16 ms `timeout` on web, and an explicit `flushIntervalMs` selects the timer everywhere. Raw runs are in `bench/results/`:

| File | Contents |
|---|---|
| `scheduler-node-jit-2026-11-05.json`, `scheduler-node-jitless-2026-11-05.json` | Node, simulated 60 Hz frames |
| `scheduler-device-s25fe-release-2026-11-05.json` | S25 FE, Hermes release, F2 |
| `scheduler-device-s25fe-release-f4d-2026-11-05.json` | S25 FE, Hermes release, `F4d` code-heavy; four runs flagged `display60Hz` |
| `scheduler-web-chrome-4x-2026-11-05.json` | Web, Chromium 156, 4× CPU throttle, including two hidden-tab runs |

### Method

- **Streams:** F2 (9724 characters, 487 chunks of 20 characters, one every 16 ms) unless noted; `F4b` is 195-character chunks; `F4d` is `code-heavy.md` (5619 characters, 281 chunks). The text is fed through `useMarkdownStream` into a visible `<Markdown document>`; the hook is remounted for every run.
- **Per run (device and web):** flush count; flush spacing; flush cost (the core's `append`, parse plus splice, not React); frame gaps (differences between `requestAnimationFrame` callbacks on the JS thread; "dropped" is a gap over 20 ms, which only means something at 120 Hz); append-to-commit latency (the time from `append` to the layout effect of the commit that carries it); total time; and whether the final document equals `parse(full)` (true in every run).
- **Device:** Samsung S25 FE (Android 37, Hermes, New Architecture), a release build, 120 Hz display, USB-connected and charging. `timeout@50` against `raf` was interleaved (ABBAAB); the other windows were run one after the other. Medians of 3 runs unless noted.
- **Web:** headless Chromium 156, CPU throttled 4× with CDP, a minified `expo export` build, 3 runs per configuration, interleaved.
- The harness is the example app's Stream tab (`example/src/screens/StreamBench.tsx`). It is a permanent screen, reduced to the public API, and is what the S5 runs on other devices use.

### Node, `--jitless` (S0-style virtual clock, simulated 60 Hz frames)

Medians of 5 runs. One full parse of F2 is 8.0 ms. 20-character chunks at 1250 characters per second. Frames are simulated and React commit is not included, so this is indicative only.

| Schedule | Flushes | Latency p50 / p90 / max (ms) | Total flush cost (× one full parse) |
|---|---|---|---|
| `timeout@16` | 487 | 0.2 / 0.6 / 8 | 20.4× |
| `timeout@50` | 157 | 24 / 44 / 49 | 6.7× |
| `timeout@100` | 79 | 48 / 88 / 97 | 5.1× |
| `raf` | 467 | 8 / 15 / 17 | 18.4× |

### S25 FE, Hermes release, F2

| Schedule | Flushes | Flush cost p50 / p90 (ms) | Flush cost sum (ms) | Append-to-commit p50 / p90 (ms) | Frame gap p90 (ms) | Dropped frames |
|---|---|---|---|---|---|---|
| `timeout@16` | 303 | 1.7 / 3.0 | 571 | 22 / 36 | 14.2 | 1.6% |
| `timeout@33` | 186 | 2.3 / 4.4 | 511 | 34 / 51 | 15.9 | 2.3% |
| `timeout@50` | 132 | 3.1 / 5.6 | 463 | 43 / 64 | 15.4 | 2.5% |
| `timeout@100` | 70 | 4.6 / 12.3 | 436 | 76 / 116 | 12.7 | 3.3% |
| `raf` | 464 | 1.3 / 2.4 | 684 | 15 / 21 | 12.1 | 2.3% |

- **Other chunkings** (`timeout@50` against `raf`): `F4b` (195-character chunks, 50 chunks, 2 runs): 14 against 48 flushes, latency p50 / p90 44 / 63 against 16 / 22 ms, dropped 2.9% against 3.4%. One run each of 1 character per 1 ms (9724 chunks): both finished in about 88 to 90 s because Android coarsens a 1 ms timer to about 9 ms; `timeout@50` flushed 1529 times and `raf` 4948 times, dropped 2.6% against 1.8%.
- **Smoothing** `hide-incomplete` (2 runs each): no visible change, `timeout@50` dropped 3.3% and `raf` 1.5%, flush cost sums 444 and 659 ms.
- **Expo Go (dev build) is misleading** and was not used: `timeout@50` dropped 8 to 14% of frames and `raf` 1.6 to 2.1%, a gap that disappears in the release build.
- **Display refresh confound.** In the `F4d` session the display dropped from 120 Hz to 60 Hz after the first eight runs (frame-gap p50 16.7 ms instead of 8.5 ms, about half the frame samples, about half the `raf` flushes). Those four runs are flagged and excluded everywhere. All F2 runs above were at 120 Hz. It also shows that the `raf` flush rate follows the display's refresh rate.

### S25 FE, `F4d` (code-heavy), the open-fence fast path ([P2-5](./phase-2/decisions.md#p2-5-open-fence-fast-path))

| Schedule | Fast path | Flushes | Flush cost sum (ms) | Latency p50 / p90 (ms) | Dropped |
|---|---|---|---|---|---|
| `timeout@50` (3 runs) | on | 77 | 108 | 41 / 65 | 1.4% |
| `timeout@50` (3 runs) | off | 76 | 236 | 39 / 62 | 0.8% |
| `raf` (2 runs at 120 Hz) | on | 280 | 171 | n/a | 0% |
| `raf` (2 runs at 120 Hz) | off | 277 | 354 | about 14 / 20 | 0% |

The fast path roughly halves the flush cost and changes nothing else. The saving is small in absolute terms (about 130 to 180 ms over a 4.5 s stream).

### Web, Chromium 156, 4× CPU throttle, F2

A flush costs under 1 ms at p90 in every configuration, so the schedule changes latency and commit count, not frame health.

| Schedule | Flushes | Flush cost sum (ms) | Latency p50 / p90 (ms) | Frame gap p90 (ms) | Dropped |
|---|---|---|---|---|---|
| `timeout@16` | 468 | 117 | 9 / 16 | 17.6 | 0.2% |
| `timeout@33` | 223 | 59 | 17 / 25 | 18.8 | 0.6% |
| `timeout@50` | 147 | 67 | 23 / 42 | 18.9 | 2.4% |
| `timeout@100` | 75 | 28 | 50 / 87 | 18.5 | 0.6% |
| `raf` | 465 | 266 | 13 / 17 | 17.8 | 0.0% |

**Hidden tab** (headed Chromium, a second tab brought to the front 1.5 s after Run, one run each): `raf` completed with the right document but took 27.1 s against about 7.8 s in the foreground, with 354 flushes, a longest gap between flushes of 6.5 s, and a worst append-to-commit latency of 7.6 s. `timeout@50` took 7.8 s with 133 flushes and a flush spacing p90 of 65 ms. Headless Chromium never hides a tab (`visibilityState` stayed `visible`), so the first, headless attempts were invalid and are not in the file. Single runs: some of the `raf` stall may come from tab-switch timing.

### Caveats and what S5 left unmeasured

- **No iPhone was available (waived, [P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred)).** `raf` on iOS runs on `CADisplayLink`; it is expected to behave like Android and has not been tested. A 60 Hz Android phone would show about half the `raf` flushes of the S25 FE at 120 Hz.
- **A backgrounded native app: measured on the S25 FE** ([results](#native-background-and-resume-s25-fe)): the scheduler freezes with the host on Android, buffered text flushes once after resume, no bug found. iOS is untested.
- **F4c (a real LLM transcript) was not collected (waived, P2-8).** The transcripts in `bench/fixtures/transcripts/` are synthetic.
- **The `isSameBlock` prefix fast path never fires through `<Block>`** ([note in P2-2](./phase-2/decisions.md#p2-2-splice-strategy)): measured on the S25 FE and accepted, see [isSameBlock comparator](#issameblock-comparator-s5-s25-fe).
- **`F4d`'s bar is absolute, accepted 2026-11-06** ([P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture)): at most 20 ms total flush cost at the 50 ms window on the S25 FE. Report absolute cost, not a multiple of the 1.9–3.5 ms full parse (S25 FE).
- The `streamCost` bars of P2-1 were set for a 50 ms window. With the per-frame default on native the multiple is higher (about 18× in Node), so re-read them at S5.

## Phase 2 web benchmark (S5, web part)

The protocol's web run for `F4a`, `F4b` and `F4d` ([benchmark-protocol](./phase-2/benchmark-protocol.md)), taken ahead of the device runs. Raw data: `bench/results/stream-web-chrome-4x-2026-11-06.json`. It settles the web column only. The S25 FE full-method run has since been taken ([S25 FE device part](#phase-2-device-benchmark-s5-s25-fe)); an iPhone and `F4c` are waived (see [Waived (P2-8)](#waived-p2-8-web-run)).

**Environment:** SHA `f056677a8c504e23469a02c1086dab758351390a` (clean except the untracked harness files this run added), Google Chrome 156.0.8078.80 headless via `playwright-core`, CPU throttled 4× with CDP `Emulation.setCPUThrottlingRate`, macOS 27.2, Apple M1. 5 warm-up and 20 measured runs, strategies interleaved, median (p50) and p90 of the 20; the p90 is the 19th of the 20 sorted runs. Wall time 38 s.

**Harness:** `bench/stream-web.mjs` (with `stream-web-head.ts` and `stream-web-tail.ts`), the S0 simulation of `bench/stream.mjs` run in the page. It is **not** the example app's Stream tab:

- Arrival is simulated on a virtual clock, one chunk per 16 ms. The flush cost is the tail parse plus the node-table conversion. **The splice and the React commit are not included.**
- `streamCost` is the summed flush time over one `parse()` of the full text measured in the same run (4.1 ms for F2 and 0.1 ms for `F4d`). The naive row is interpolated from 40 sampled prefixes.
- Strategies: naive full re-parse; tail re-parse per chunk (`tail`); tail with 16 ms frame coalescing (`tail+frame`); fixed windows of 33, 50, 100 and 200 ms (`w33` to `w200`); tail with the open-fence fast path (`tail+fence`, [P2-5](./phase-2/decisions.md#p2-5-open-fence-fast-path)). The pass/fail strategy is `w50`, the window the bars in [P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture) assume.
- **`F4c` was skipped:** the transcripts are synthetic (4.2 KB), so they cannot set a bar.

### `F4a`: F2, 9,724 characters, 20-character chunks (487 chunks), bar at most 5×

| Strategy | Flushes | `streamCost` p50 / p90 | Total flush cost p50 / p90 (ms) |
|---|---|---|---|
| naive full re-parse per chunk | 487 | 246.8× / 258.5× | 1022.0 / 1053.8 |
| tail re-parse per chunk | 487 | 11.3× / 12.0× | 46.7 / 50.3 |
| tail + 16 ms frame | 487 | 11.2× / 11.7× | 46.6 / 47.0 |
| tail + 33 ms window | 237 | 6.07× / 6.37× | 25.0 / 27.0 |
| **tail + 50 ms window** | 157 | **4.28× / 4.80×** | 18.3 / 19.2 |
| tail + 100 ms window | 79 | 2.73× / 2.88× | 11.2 / 12.0 |
| tail + 200 ms window | 40 | 1.85× / 2.00× | 7.6 / 8.2 |
| tail + open-fence fast path | 487 (78 skipped) | 11.1× / 11.6× | 45.5 / 49.8 |

### `F4b`: F2, 195-character chunks (50 chunks), bar at most 2×

| Strategy | Flushes | `streamCost` p50 / p90 | Total flush cost p50 / p90 (ms) |
|---|---|---|---|
| naive full re-parse per chunk | 50 | 25.95× / 26.94× | 106.1 / 107.8 |
| tail re-parse per chunk | 50 | 2.12× / 2.22× | 8.5 / 9.1 |
| tail + 16 ms frame | 50 | 2.07× / 2.25× | 8.7 / 9.4 |
| tail + 33 ms window | 25 | 1.50× / 1.71× | 6.4 / 7.0 |
| **tail + 50 ms window** | 17 | **1.42× / 1.59×** | 6.0 / 6.5 |
| tail + 100 ms window | 9 | 1.27× / 1.36× | 5.2 / 5.7 |
| tail + 200 ms window | 5 | 1.02× / 1.15× | 4.3 / 4.6 |
| tail + open-fence fast path | 50 (0 skipped) | 2.12× / 2.30× | 8.7 / 9.2 |

### `F4d`: code-heavy, 5,619 characters, 20-character chunks (281 chunks), absolute cost

One full parse is about 0.1 ms and the timer granularity in Chrome is about 0.1 ms, so the multiples are quantized (naive 95×, tail 165×, `w50` 56×, fast path 24× at p50) and are not reported as results. Use the absolute totals.

| Strategy | Flushes | Total flush cost p50 / p90 (ms) |
|---|---|---|
| naive full re-parse per chunk | 281 | 9.5 / 11.7 |
| tail re-parse per chunk | 281 | 16.6 / 19.0 |
| tail + 16 ms frame | 281 | 16.7 / 20.0 |
| tail + 33 ms window | 137 | 8.1 / 9.4 |
| **tail + 50 ms window** | 91 | **5.6 / 6.8** |
| tail + 100 ms window | 46 | 3.1 / 3.9 |
| tail + 200 ms window | 24 | 1.6 / 1.9 |
| tail + open-fence fast path | 281 (249 skipped) | 2.6 / 3.4 |

(On this fixture a full re-parse is cheaper than the tail re-parse, because the tail parse has fixed per-call overhead and the document is tiny.)

### What it shows

- **The P2-1 bars hold on web only at the 50 ms window, and only for this simulation.** The device `core` run, which includes the splice and the full re-parses this harness leaves out, misses both bars at 50 ms ([S25 FE results](#phase-2-device-benchmark-s5-s25-fe)); for the P2-1 verdict the device results supersede these (P2-1 is accepted, 2026-11-06, with a redefined bar and a waiver for documents that end in a footnote definition). `F4a` is 4.28× at p50 against the 5× bar, but the p90 is 4.80×, so the margin is thin (the slowest two of 20 runs were 4.80× and 4.81×). `F4b` is 1.42× / 1.59× against 2×, a comfortable pass. The 33 ms window fails `F4a` (6.07×).
- **They do not hold per chunk or per frame.** Tail re-parse with no window is 11.3× on `F4a` and 2.12× on `F4b` (fail by a small margin); a 16 ms frame is the same, because a chunk arrives every 16 ms. This matches the Node S0 figures (11.3× and 10.7×).
- **Naive re-parse is not viable:** 246.8× on `F4a` and 25.95× on `F4b`, in line with S0.
- **The absolute cost is small.** The whole 9.7 KB stream costs 18.3 ms of flush time at the 50 ms window (p90 19.2) and 46.7 ms with no window, over a 7.8 s stream, under the 4× throttle.
- **`F4d`:** the 50 ms window costs 5.6 ms in total (p90 6.8). The open-fence fast path costs 2.6 ms (p90 3.4) with no window at all: it skipped 249 of 281 flushes, and so does better than the 50 ms window without adding lag. It makes no difference on `F4a` (45.5 against 46.7 ms; 78 of 487 flushes skipped) or `F4b` (0 skipped), as in S0.

### Waived (P2-8), web run

- ~~The **S25 FE** run with the full method~~ Done: [S25 FE device part](#phase-2-device-benchmark-s5-s25-fe) (`streamRender` and janky frames included).
- **Waived (P2-8):** an **iPhone** run.
- **Waived (P2-8):** **`F4c`**, a real LLM transcript.
- Splice cost and React commit are not in these numbers (the S25 FE run measured the splice and the hook; there is no web equivalent yet); the S2 web run (above) measured the schedule with them, on F2 only.

## `isSameBlock` comparator (S5, S25 FE)

What the source-text comparison costs per flush on a stream, because the prefix fast path does not fire through `<Block>` ([P2-2](./phase-2/decisions.md#p2-2-splice-strategy)). Raw data: `bench/results/isSameBlock-device-s25fe-2026-11-06.json`.

**Setup:** Samsung Galaxy S25 FE (SM-S731B), Android 17 (API 37), Hermes release build (bytecode via `hermesc -O`), New Architecture, JS dev off, minimum refresh rate pinned to 120 Hz, SHA `f056677`. 12 measured runs per variant and stream (36 warm runs besides), `timeout` scheduler at 50 ms. Streams: `F4a` (`F2`, 9,724 characters, 487 chunks of 20 characters, 58 blocks) and a larger document of 862 blocks (not 900). Variants: `base` (the code as it is), spike A (per-block version stamps in an `Int32Array`), spike B (a `WeakMap` in `Block.tsx`). Comparator time was measured in scratch copies of the code: `performance.now()` around each `blockPropsEqual` call, summed per React commit (one commit per flush), with about 0.065 µs of timer overhead per call. `Block` renders were counted per commit the same way (the "renders per flush" column). The final document was equal to the batch parse in every run.

| Variant / stream | Blocks | Comparator per flush p50 / p90 (ms) | Late flushes p50 / p90 (ms) | Total comparator p50 / p90 (ms) | Stream p50 (ms) | Renders per flush p50 / p90 |
| --- | --- | --- | --- | --- | --- | --- |
| base `F4a` | 58 | 0.151 / 0.389 | 0.220 / 0.494 | 28.0 / 40.7 | 7851 | 1 / 2 |
| A `F4a` | 58 | 0.106 / 0.234 | 0.160 / 0.303 | 14.3 / 17.9 | 7847 | 1 / 2 |
| B `F4a` | 58 | 0.096 / 0.226 | 0.130 / 0.287 | 12.7 / 17.6 | 7849 | 1 / 2 |
| base big | 862 | 0.428 / 1.276 | 0.703 / 2.381 | 57.4 / 142.4 | 7192 | 8 / 12 |
| A big | 862 | 0.211 / 0.337 | 0.293 / 0.410 | 22.0 / 27.3 | 7387 | 10 / 12 |
| B big | 862 | 0.255 / 0.396 | 0.334 / 0.470 | 27.0 / 30.5 | 6914 | 10 / 12 |

(Flushes pooled over the 12 runs: 1,525 base `F4a`, 1,488 base big. Late flushes are the last part of each stream, where the table is longest: 238 and 391 flushes for the base rows. The maximum per-flush comparator cost was 15.1 ms for base `F4a` and 5.6 ms for base big.)

- **The "about 6 ms per flush at 900 blocks" estimate did not reproduce.** It came from timing every block's comparison at once in the Phase 1 run ([above](#device-results-preliminary-m1)); in a stream the real cost is 0.43 ms p50 at 862 blocks and 0.15 ms at 58.
- **Both spikes cut the comparator by about half** (0.211 and 0.255 ms p50 at 862 blocks), but the whole-stream time did not move (about 7 s; the run-to-run spread, 6.9 to 7.4 s, is larger than any effect). The total comparator time for the base is 57.4 ms of a 7,192 ms stream at 862 blocks (about 0.8%) and 28.0 ms of 7,851 ms at 58 blocks (about 0.36%). Spike A cuts it by 35.4 ms (about 0.49% of stream time) and spike B by 30.4 ms (about 0.42%) at 862 blocks; at 58 blocks the cuts are 13.7 ms and 15.3 ms (about 0.17% and 0.19%). So no fix can save more than about 0.5% of stream time.
- **Conclusion: the gap is accepted, no code fix.** The spike code was discarded; the two approaches are described in P2-2 and can be rebuilt from that description. Revisit if a larger-document or real-transcript workload shows the comparator above about 2 ms p50 per flush.

## Phase 2 device benchmark (S5, S25 FE)

The protocol's device run for `F4a`, `F4b` and `F4d` ([benchmark-protocol](./phase-2/benchmark-protocol.md)) on the S25 FE with the full method. Raw data: `bench/results/stream-device-s25fe-release-2026-11-06.json`. For the P2-1 verdict these results **supersede the web numbers** ([web run](#phase-2-web-benchmark-s5-web-part)), because the `core` harness below includes the splice and the full re-parses, which the web simulation leaves out.

**Environment:** Samsung Galaxy S25 FE (SM-S731B), Android 17 (API 37), Hermes release build (bytecode compiled with `hermesc -O` and swapped into the example release APK, scratch copy), New Architecture, JS dev off, minimum refresh rate pinned to 120 Hz (JS `requestAnimationFrame` gap p50 8.3 to 9.7 ms in every React run). SHA `f056677a8c504e23469a02c1086dab758351390a` plus uncommitted docs edits only; the harness lived in a scratch clone (`src/stream/createMarkdownStream.ts` instrumented there to time the table splice). 5 warm-up and 20 measured runs, strategies interleaved, p50 and p90 of the 20 (the p90 is the 19th of the 20 sorted runs). Device on USB power, battery temperature 37.1 to 40.4 °C during the React runs. **0 of 150 React runs were rejected** for frame gaps. `F4c` was skipped (the transcripts are synthetic).

**Two harnesses, same text and same chunking (one chunk per 16 ms on a virtual clock):**

- **`sim`** is the web run's code (`bench/stream.mjs` lines 53 to 270, verbatim): tail parse plus node-table conversion per flush. **No splice and no full re-parse.** It is the like-for-like comparison with the web numbers.
- **`core`** goes through the real `createMarkdownStreamCoreWith`: `parseFrom`, the table splice, the full-reparse triggers and `done()`. This is what the hook runs. Labels: `c0` is a flush per chunk, `c16` to `c200` are fixed windows in ms, `c0nf` and `c50nf` are the same with the open-fence fast path off.

`streamCost` is the total flush cost as a multiple of one full `parse()` measured in the same run. The full parse takes 20.99 / 23.91 ms (p50 / p90) for `F4a` and 26.38 / 27.87 ms for `F4b` in `sim`, and 16.18 / 29.67 ms and 16.26 / 16.44 ms in `core`; for `F4d` 3.55 / 3.81 ms in `sim` and 1.88 / 1.90 ms in `core`.

### `F4a`: F2, 9,724 characters, 20-character chunks, bar at most 5×

`sim` (487 chunks; no splice, no full re-parse):

| Strategy | Flushes | `streamCost` p50 / p90 | Total flush cost p50 / p90 (ms) | Per-flush p90, p50 / p90 (ms) |
|---|---|---|---|---|
| naive full re-parse per chunk | 487 | 242.2× / 246.8× | 5180.2 / 5780.0 | 19.44 / 21.34 |
| tail re-parse per chunk | 487 | 8.80× / 9.51× | 191.0 / 210.1 | 0.81 / 0.90 |
| tail + 16 ms frame | 487 | 8.77× / 9.46× | 190.7 / 209.5 | 0.81 / 0.90 |
| tail + 33 ms window | 237 | 4.71× / 5.10× | 102.3 / 112.0 | 0.88 / 0.98 |
| **tail + 50 ms window** | 157 | **3.48× / 3.72×** | 75.0 / 83.0 | 0.91 / 1.01 |
| tail + 100 ms window | 79 | 2.27× / 2.45× | 48.8 / 54.2 | 1.05 / 1.17 |
| tail + 200 ms window | 40 | 1.62× / 1.72× | 34.6 / 38.6 | 1.35 / 1.50 |
| tail + open-fence fast path | 487 (78 skipped) | 8.62× / 9.32× | 187.7 / 205.7 | 0.81 / 0.90 |

`core` (486 flushes at `c0`; splice and full re-parses included):

| Strategy | Flushes (fast-path skips) | `streamCost` p50 / p90 | Total flush cost p50 / p90 (ms) | Per-flush p90, p50 / p90 (ms) | Full re-parses |
|---|---|---|---|---|---|
| `c0` per chunk | 486 (74) | 15.6× / 16.1× | 255.8 / 431.5 | 0.78 / 1.41 | 5 |
| `c0nf` per chunk, fast path off | 486 (0) | 17.1× / 17.7× | 279.7 / 479.8 | 0.83 / 1.50 | 5 |
| `c16` | 486 (74) | 15.6× / 16.2× | 253.9 / 443.4 | 0.78 / 1.42 | 5 |
| `c33` | 237 (32) | 8.74× / 9.25× | 141.7 / 263.4 | 0.83 / 1.51 | 3 |
| **`c50`** | 157 (18) | **6.30× / 7.11×** | 107.0 / 185.3 | 0.87 / 1.57 | 2 |
| `c50nf` fast path off | 157 (0) | 6.71× / 7.08× | 111.0 / 200.5 | 0.88 / 1.59 | 2 |
| `c100` | 79 (7) | 3.73× / 3.96× | 60.7 / 110.8 | 1.04 / 1.93 | 1 |
| `c200` | 40 (0) | 2.97× / 3.18× | 48.6 / 87.6 | 1.40 / 2.63 | 1 |

### `F4b`: F2, 195-character chunks (50 chunks), bar at most 2×

`sim`:

| Strategy | Flushes | `streamCost` p50 / p90 | Total flush cost p50 / p90 (ms) | Per-flush p90, p50 / p90 (ms) |
|---|---|---|---|---|
| naive full re-parse per chunk | 50 | 25.4× / 25.8× | 668.9 / 706.8 | 24.01 / 25.37 |
| tail re-parse per chunk | 50 | 1.78× / 1.91× | 47.0 / 50.3 | 1.44 / 1.54 |
| tail + 16 ms frame | 50 | 1.79× / 1.87× | 46.7 / 50.2 | 1.42 / 1.54 |
| tail + 33 ms window | 25 | 1.36× / 1.44× | 35.9 / 38.0 | 2.14 / 2.28 |
| **tail + 50 ms window** | 17 | **1.32× / 1.39×** | 34.8 / 37.2 | 2.64 / 2.80 |
| tail + 100 ms window | 9 | 1.17× / 1.24× | 30.9 / 33.6 | 4.51 / 5.15 |
| tail + 200 ms window | 5 | 1.04× / 1.10× | 27.5 / 29.2 | 7.17 / 7.59 |
| tail + open-fence fast path | 50 (0 skipped) | 1.78× / 1.91× | 46.8 / 49.5 | 1.43 / 1.52 |

`core`:

| Strategy | Flushes | `streamCost` p50 / p90 | Total flush cost p50 / p90 (ms) | Per-flush p90, p50 / p90 (ms) | Full re-parses |
|---|---|---|---|---|---|
| `c0` per chunk | 50 | 3.21× / 3.39× | 52.3 / 55.2 | 1.06 / 1.25 | 1 |
| `c0nf` fast path off | 50 | 3.22× / 3.62× | 52.2 / 59.4 | 1.09 / 1.25 | 1 |
| `c16` | 50 | 3.21× / 3.52× | 52.2 / 57.9 | 1.06 / 1.25 | 1 |
| `c33` | 25 | 2.58× / 2.64× | 42.0 / 42.7 | 1.74 / 1.98 | 1 |
| **`c50`** | 17 | **2.46× / 2.51×** | 40.1 / 40.8 | 2.00 / 2.28 | 1 |
| `c50nf` fast path off | 17 | 2.45× / 2.49× | 40.0 / 40.5 | 2.00 / 2.35 | 1 |
| `c100` | 9 | 2.32× / 2.55× | 37.8 / 41.3 | 18.78 / 19.52 | 1 |
| `c200` | 5 | 2.09× / 2.14× | 34.2 / 34.9 | 20.16 / 20.92 | 1 |

(With 9 and 5 flushes the per-flush p90 is the maximum, which is the flush that carries the full re-parse.)

### `F4d`: code-heavy, 5,619 characters, 20-character chunks (281 chunks), absolute cost

The full parse is 1.9 to 3.5 ms, so the multiples are not reported. Total flush cost over the stream, p50 / p90 (ms). `sim` (no splice):

| Strategy | Flushes (skips) | Total p50 / p90 (ms) | Per-flush p90, p50 / p90 (ms) |
|---|---|---|---|
| naive full re-parse per chunk | 281 | 349.2 / 408.3 | 1.90 / 2.30 |
| tail re-parse per chunk | 281 | 114.0 / 147.7 | 0.70 / 0.90 |
| tail + 16 ms frame | 281 | 114.6 / 147.4 | 0.70 / 0.90 |
| tail + 33 ms window | 137 | 56.6 / 75.7 | 0.71 / 0.92 |
| tail + 50 ms window | 91 | 38.3 / 41.8 | 0.71 / 0.75 |
| tail + 100 ms window | 46 | 21.1 / 21.8 | 0.73 / 0.75 |
| tail + 200 ms window | 24 | 12.0 / 12.7 | 1.10 / 1.19 |
| tail + open-fence fast path (no window) | 281 (249) | 19.8 / 20.6 | 0.13 / 0.18 |

`core` (splice included; no full re-parses on this fixture):

| Strategy | Flushes (skips) | Total p50 / p90 (ms) | Per-flush p90, p50 / p90 (ms) | Splice total p50 / p90 (ms) |
|---|---|---|---|---|
| `c0nf` per chunk, fast path off | 281 (0) | 76.2 / 77.2 | 0.45 / 0.46 | 1.83 / 2.64 |
| `c0` per chunk | 281 (189) | 37.2 / 37.6 | 0.46 / 0.48 | 0.64 / 0.67 |
| `c16` | 281 (189) | 37.0 / 37.2 | 0.46 / 0.47 | 0.60 / 0.66 |
| `c33` | 137 (91) | 18.3 / 18.6 | 0.47 / 0.48 | 0.30 / 0.32 |
| **`c50nf` 50 ms, fast path off** | 91 (0) | **26.6 / 33.3** | 0.47 / 0.47 | 0.59 / 0.65 |
| **`c50` 50 ms, fast path on** | 91 (53) | **15.5 / 15.7** | 0.47 / 0.49 | 0.25 / 0.27 |
| `c100` | 46 (27) | 7.9 / 13.1 | 0.51 / 0.57 | 0.13 / 0.16 |
| `c200` | 24 (9) | 6.3 / 6.7 | 0.72 / 0.75 | 0.10 / 0.12 |

### Splice cost and `done()`

Splice time is the time in the table splice summed over a stream, timed in the instrumented scratch copy. At the 50 ms window unless noted:

| Stream | Splices | Splice total p50 / p90 (ms) | Per splice at p50 (ms) |
|---|---|---|---|
| `F4a` `c50` | 137 | 3.51 / 6.20 | 0.026 |
| `F4a` `c0` (per chunk) | 408 | 10.33 / 19.49 | 0.025 |
| `F4b` `c50` | 16 | 0.37 / 0.40 | 0.023 |
| `F4d` `c50` (fast path on) | 38 | 0.25 / 0.27 | 0.007 |
| `F4d` `c50nf` (fast path off) | 91 | 0.59 / 0.65 | 0.006 |

The splice is about 3% of the `F4a` flush cost at 50 ms (3.5 of 107 ms). **`done()` at the end of a stream costs about a full re-parse:** `finalDone` is 16.75 / 29.86 ms (`F4a`, `c50`), 16.38 / 16.84 ms (`F4b`, `c50`) and 1.90 / 1.95 ms (`F4d`, `c50`) at p50 / p90.

### Heap

Retained heap after a stream against the same document built statically, with a GC forced (the harness had `gc` available in every run). Deterministic across the 20 runs (p50 = p90):

| Stream | Static document (bytes) | After the stream (bytes) | Retained vs static (bytes) | Garbage before the GC, p50 / p90 (bytes) | GCs |
|---|---|---|---|---|---|
| `F4a` | 53,562 | 92,728 | **+39,166** | 498,648 / 498,912 | 8 |
| `F4d` | 18,592 | 32,231 | **+13,639** | 1,994,121 / 1,994,153 | 6 |

The heap numbers are from a re-run (launch 3), after fixing a dead-register bug in the static-heap baseline.

### React hook: 50 ms timer against `raf`

Through `useMarkdownStream`, 20 runs each, release build, 120 Hz. `streamRender` is summed over the stream. "Janky frames" are from `gfxinfo` (out of all frames drawn during the stream); "JS gaps" are `requestAnimationFrame` gaps over 20 ms on the JS thread. Every run of every configuration ended with a document equal to the batch parse.

| Stream / schedule | `streamRender` p50 / p90 (ms) | Commits p50 | Render p90, p50 / p90 (ms) | Janky frames p50 (of total; %) | JS gaps over 20 ms, p50 / p90 | Max JS gap p50 / p90 (ms) | `done` to commit p50 / p90 (ms) |
|---|---|---|---|---|---|---|---|
| `F4a` `timeout@50` | 1344.5 / 1483.7 | 129 | 15.5 / 17.2 | 114 of 162 (70.2%) | 22 / 28 | 39.8 / 57.7 | 31.8 / 41.5 |
| `F4a` `raf` | 2268.4 / 2350.6 | 465 | 8.3 / 8.8 | 221 of 486 (45.6%) | 14 / 17 | 33.5 / 43.3 | 20.9 / 28.1 |
| `F4b` `timeout@50` | 126.7 / 149.1 | 13 | 14.6 / 20.1 | 14 of 17 (82.4%) | 6 / 9 | 36.8 / 43.2 | 34.0 / 38.4 |
| `F4b` `raf` | 261.9 / 270.1 | 45 | 9.7 / 10.1 | 30 of 53 (57.7%) | 5 / 7 | 33.6 / 47.4 | 24.9 / 26.2 |
| `F4d` `timeout@50` | 366.5 / 390.5 | 75 | 6.8 / 7.2 | 64 of 143 (45.4%) | 4 / 6 | 23.6 / 30.5 | 22.5 / 25.2 |
| `F4d` `raf` | 709.1 / 761.8 | 276 | 3.9 / 4.0 | 95 of 383 (24.9%) | 3 / 5 | 23.3 / 27.3 | 16.9 / 20.5 |

Stream wall time is the same for both schedules (`F4a` 7.84 s, `F4b` 0.85 s, `F4d` 4.52 s). On `F4a` the 50 ms timer commits 129 times against 465 for `raf` and spends 1344 ms in `streamRender` against 2268 ms, but each of its commits is about twice as expensive at p90 (15.5 against 8.3 ms), and its janky-frame percentage is higher. The frames are 8.3 ms at 120 Hz, so a 15 ms commit already costs a frame; the percentages are not comparable with the 60 Hz figures in [S2](#phase-2-scheduler-s2).

### What it shows

- **On the device the `core` misses both P2-1 bars at the 50 ms window.** `F4a` is **6.30× / 7.11×** against the 5× bar, and `F4b` is **2.46× / 2.51×** against 2×. The `sim` harness, which is the web run's code, passes both on the same phone (3.48× / 3.72× and 1.32× / 1.39×). So the gap is not the tail parse.
- **The cause is the full re-parses.** F2 ends in a footnote definition. While that definition streams, the stream core sees a footnote definition in the open tail and tokenizes the whole source again on each flush that contains it ([P2-3](./phase-2/decisions.md#p2-3-parsefrom-contract)). The count of full re-parses per `F4a` stream depends on how many flushes the definition spans: 5 at 20-character chunks (`c0`, `c16`), 3 at 33 ms, **2 at 50 ms**, 1 at 100 and 200 ms; `F4b` has 1. Each costs about 17 ms (the full parse is 16.2 ms in `core`). Taking two re-parses of about 16.5 ms off the `c50` total of 107.0 ms leaves about 74 ms, **about 4.6×** the 16.2 ms full parse, under the bar and close to the `sim` total (75.0 ms). This is an estimate from the counts, not a measurement with the trigger disabled. **Verdict (2026-11-06):** [P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture) is accepted: the bars apply to steady-state flush cost excluding the necessary footnote re-parse, and are waived for documents that end in a footnote definition, with 6.30× / 7.11× (`F4a`) and 2.46× / 2.51× (`F4b`) accepted. Excluding only the one necessary re-parse `F4a` would be about 5.6× (an estimate), still over 5×. An attempt to make the footnote tail cheaper was dropped ([P2-3 note](./phase-2/decisions.md#p2-3-parsefrom-contract)).
- **The fast path is worth keeping.** On `F4d` it takes the 50 ms window from 26.6 to 15.5 ms at p50 (p90 33.3 to 15.7) and skips 53 of 91 flushes. On `F4a` it is worth about 4 ms of 111 (`c50nf` 111.0 against `c50` 107.0) and nothing on `F4b`.
- **Hermes is about 5× slower than the throttled Chrome on the same parse:** one full `F4a` parse is 21 ms in `sim` on the S25 FE (release) against 4.1 ms in Chrome at 4× throttle. The web `sim` also leaves out the splice and the full re-parses, so it understates the real cost on both counts, and the web pass is not a pass for the hook.
- **Splice and heap are small.** 0.026 ms per splice at p50 (3.5 ms per `F4a` stream at 50 ms, 137 splices). The stream retains 39,166 bytes more than the static document on `F4a` and 13,639 on `F4d`.
- **Flush cost per flush is small; commits are what the frames pay for.** The per-flush p90 is under 2 ms at every window up to 100 ms on `F4a` in `core`, while the React commit costs 15 ms at p90 with a 50 ms timer (`sim` and `core` do not include it).

### Caveats

- **Slow CPU mode in `core` `F4a`.** The first 8 or so measured runs of `core` `F4a` ran in a mode about 2× slower (full parse 29.5 against 16.2 ms). The ratios appear to hold across modes, but the absolute p90 values in the `core` `F4a` table reflect the slow mode (for example, the full parse p90 is 29.67 ms against a p50 of 16.18 ms).
- **No naive row in `core`:** `sim` carries it.
- **`streamRender` method.** Profiler `onRender` does not fire in production, so `streamRender` is the layout-effect time minus the render start of a probe sibling. It covers render and commit up to the layout effect, not native paint.
- **Device settings.** `screen_off_timeout` and `stay_on` were changed to keep the phone awake, and their previous values were not recorded. The minimum refresh rate pin was deleted afterwards.
- **One device and one OS build** (S731BXXS9CZJ2), and a harness in a scratch clone with an instrumented `createMarkdownStream.ts`; the worktree source is unchanged.

### Footnote-free variant (S25 FE)

The P2-1 follow-up: `F2` without the trailing footnote definition, held to the **original** bars ([P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture)). Raw data: `bench/results/stream-device-s25fe-footnote-free-2026-11-06.json`. Same device, build, harness (`sim` and `core`), SHA (`f056677`) and method as the [run above](#phase-2-device-benchmark-s5-s25-fe): 5 warm-up and 20 measured rounds, p50 / p90 of the 20, 120 Hz pinned, a scratch clone, not the worktree. Every round ran all six fixtures back to back.

**Variants** (all of `F2`, 20-character chunks for `F4a`, 195-character chunks for `F4b`):

- **`orig`** (control): `F2` as in `bench/fixtures/index.ts`, 9,724 characters.
- **`R`** (removed): `footnotes[^perf].` replaced by `footnotes.`, and the last line `[^perf]: Measured on device in release builds; see the benchmark protocol.` removed. 9,642 characters (82 fewer).
- **`P`** (plain): as `R`, but the definition line kept as an ordinary paragraph without the `[^perf]: ` prefix. 9,708 characters (16 fewer), the same block structure as `orig`.

**Result at the 50 ms window (`core`, the bar window): both variants pass the original bars.**

| Fixture, bar | `orig` p50 / p90 | `R` p50 / p90 | `P` p50 / p90 | Full re-parses (`orig` / `R` / `P`) |
|---|---|---|---|---|
| `F4a`, at most 5× | 6.26× / 6.36× (waived) | **4.32× / 4.34×** (pass) | **4.28× / 4.40×** (pass) | 2 / 0 / 0 |
| `F4b`, at most 2× | 2.43× / 2.47× (waived) | **1.42× / 1.44×** (pass) | **1.42× / 1.45×** (pass) | 1 / 0 / 0 |

`orig` reproduces the earlier run (6.30× / 7.11× and 2.46× / 2.51×; the p90 of `F4a` is lower here, 6.36× against 7.11×). The footnote therefore costs 6.26 / 4.32, about **1.45×** on `F4a` at 50 ms (2.43 / 1.42, about 1.7× on `F4b`), and `R` and `P` have no full re-parse at any window. Without a window (`c0`), `F4a` still fails the 5× bar by a wide margin even without the footnote (10.63× for `R`, 10.57× for `P`; `orig` 14.53×): the bars hold only at the 50 ms window, as before. The full parse (`core`, p50 / p90) is 29.56 / 29.73 ms for `F4a` `orig`, 29.16 / 29.27 for `R` and 29.46 / 29.88 for `P` (see the CPU mode below).

The per-window tables. `streamCost` is the total flush cost as a multiple of one full `parse()` in the same run. `sim` is the harness without splice and full re-parse; it is **not** the verdict column, and is shown only as the p50 for like-for-like with the web run (`c0` is its `tail`, the others its `w33` to `w200`).

#### `F4a` (bar at most 5x)

| Window | Flushes (orig / R / P) | `core` `streamCost` p50 / p90: orig | R | P | Full re-parses (orig / R / P) | `sim` p50 (orig / R / P), not the verdict column |
|---|---|---|---|---|---|---|
| `c0` (per chunk) | 486 / 483 / 486 | 14.53x / 14.75x | 10.63x / 10.74x | 10.57x / 10.73x | 4 / 0 / 0 | 8.73x / 8.83x / 8.77x |
| `c16` | 486 / 483 / 486 | 14.53x / 14.85x | 10.59x / 10.61x | 10.50x / 10.63x | 4 / 0 / 0 | - |
| `c33` | 237 / 235 / 237 | 8.65x / 8.73x | 5.63x / 5.68x | 5.60x / 5.68x | 3 / 0 / 0 | 4.68x / 4.67x / 4.64x |
| `c50` (the bar) | 157 / 156 / 157 | 6.26x / 6.36x | 4.32x / 4.34x | 4.28x / 4.40x | 2 / 0 / 0 | 3.47x / 3.55x / 3.54x |
| `c100` | 79 / 79 / 79 | 3.70x / 3.79x | 2.78x / 2.87x | 2.76x / 2.80x | 1 / 0 / 0 | 2.27x / 2.30x / 2.30x |
| `c200` | 40 / 40 / 40 | 2.95x / 3.00x | 1.95x / 2.04x | 1.93x / 1.95x | 1 / 0 / 0 | 1.59x / 1.60x / 1.60x |
| `c0nf` (fast path off) | 486 / 483 / 486 | 16.04x / 16.35x | 12.09x / 12.13x | 12.02x / 12.13x | 4 / 0 / 0 | - |
| `c50nf` (fast path off) | 157 / 156 / 157 | 6.64x / 6.76x | 4.70x / 4.71x | 4.68x / 4.85x | 2 / 0 / 0 | - |

#### `F4b` (bar at most 2x)

| Window | Flushes (orig / R / P) | `core` `streamCost` p50 / p90: orig | R | P | Full re-parses (orig / R / P) | `sim` p50 (orig / R / P), not the verdict column |
|---|---|---|---|---|---|---|
| `c0` (per chunk) | 50 / 50 / 50 | 3.20x / 3.27x | 2.21x / 2.23x | 2.21x / 2.22x | 1 / 0 / 0 | 1.78x / 1.79x / 1.78x |
| `c16` | 50 / 50 / 50 | 3.20x / 3.21x | 2.21x / 2.23x | 2.20x / 2.35x | 1 / 0 / 0 | - |
| `c33` | 25 / 25 / 25 | 2.58x / 2.60x | 1.61x / 1.64x | 1.61x / 1.64x | 1 / 0 / 0 | 1.36x / 1.37x / 1.36x |
| `c50` (the bar) | 17 / 17 / 17 | 2.43x / 2.47x | 1.42x / 1.44x | 1.42x / 1.45x | 1 / 0 / 0 | 1.32x / 1.31x / 1.31x |
| `c100` | 9 / 9 / 9 | 2.33x / 2.36x | 1.30x / 1.31x | 1.30x / 1.34x | 1 / 0 / 0 | 1.17x / 1.16x / 1.16x |
| `c200` | 5 / 5 / 5 | 2.08x / 2.11x | 1.08x / 1.11x | 1.08x / 1.09x | 1 / 0 / 0 | 1.04x / 1.06x / 1.06x |
| `c0nf` (fast path off) | 50 / 50 / 50 | 3.20x / 3.23x | 2.22x / 2.23x | 2.21x / 2.22x | 1 / 0 / 0 | - |
| `c50nf` (fast path off) | 17 / 17 / 17 | 2.46x / 2.47x | 1.42x / 1.45x | 1.42x / 1.44x | 1 / 0 / 0 | - |

**Method and caveats:**

- **Slow CPU mode, all 20 measured rounds.** Rounds 0 and 1 (warm-up) ran at a full parse of 15.9 to 18.1 ms; from round 2 on the CPU ran about 2× slower (full parse 29.6 ms, stable to ±0.1 ms; one round at 37.4 ms) for the rest of the session, so every measured round is slow-mode. All six fixtures ran in every round, so each variant saw the same mode and the **ratios compare like with like**, but the absolute milliseconds are **not comparable** to the earlier run (full parse 16.2 ms there). A fast-mode warm-up round (round 0) gives the same ratios. `cmd power set-fixed-performance-mode-enabled true` was tried mid-run and changed nothing (reset to false afterwards). No round was flagged slow by the saved rule (`slowRuns` is empty), because the mode was constant.
- **Not run through the React hook**: `core` and `sim` only, so there is no `streamRender`, janky-frame or commit data for the variants.
- **No iPhone, and `F4c` not collected: both waived (P2-8).**
- Device settings changed for the run: the minimum refresh rate pinned to 120 Hz, restored afterwards.
- The variants are edits of one fixture. A real transcript without footnotes is `F4c`'s job.

### Waived (P2-8), S25 FE run

- **Waived (P2-8):** an **iPhone** run (`raf` on iOS is unmeasured).
- **Waived (P2-8):** **`F4c`**, a real LLM transcript.
- Done since: the footnote-free F2 variant passes the original bars at 50 ms ([results](#footnote-free-variant-s25-fe)) and native background and resume is checked ([results](#native-background-and-resume-s25-fe)); P2-1 is not reopened. An iPhone run of both is waived (P2-8).

## Native background and resume (S25 FE)

Closes the "backgrounded native app is untested" item of the [scheduler caveats](#caveats-and-what-s5-still-has-to-measure) and of [P2-4](./phase-2/decisions.md#p2-4-coalescing-policy). Raw data: `bench/results/stream-background-s25fe-2026-11-06.json`.

**Setup.** Samsung Galaxy S25 FE (SM-S731B), Android 17, Hermes release build, New Architecture, JS dev off. A scratch app mirrored the Stream tab through the public `useMarkdownStream` hook (the Stream tab itself is not instrumented), streaming `F2` (9,724 characters) in 20-character chunks every 16 ms, with the `timeout` scheduler at 50 ms (`w50`) and `raf`. The app was sent to the background and brought back, and the screen was turned off and on. Producers: in JS, steady or catching up (`pace` steady / catch), and a native source that keeps appending while the app is paused (`bgAppends` 151 to 322 in the saved file). Backgrounds of 3 s and 15 s. Logs were read through logcat (the first run's lines were truncated by logcat and superseded; the raw logs are in the job's scratch directory, not in the repository).

**Intended behaviour.** None is specified: `src/stream/scheduler.ts` and `useMarkdownStream.ts` have no `AppState` handling, only the suspend and resume used for StrictMode. So the expectation is that buffered text survives the background and flushes later, with the final document equal to `parse(full text)`.

**Result: no bug found.**

- No crash, no lost or duplicated text. The final document equalled `parse(full)` in all 20 runs below (`finalEqual` true in every row).
- **No commits in the background.** On Android `JavaTimerManager.onHostPause` (react-native `JavaTimerManager.kt`, lines 72 to 76) freezes both `setTimeout` and `requestAnimationFrame` while the activity is paused, so the scheduler stops with the host. The longest JS frame gap is the length of the background (3.1 to 3.2 s and 15.1 to 15.2 s; `frameMaxMs`). One `raf` run (`raf-bg3-catch`) logged 1 commit while backgrounded; not investigated.
- **First commit after resume: 10 to 59 ms** (`firstCommitAfterActiveMs`: 10, 10, 10, 16, 16, 23, 24, 25 in the JS-producer rows; 33, 39, 50, 59 with the native source). The buffered text (about 3.9 KB, from the run notes; the size is not a field of the saved file) went out as **one flush**, so the latency after resume is about one flush.
- **Frames over 20 ms after resume: 1 to 4** in most rows, and 5 in one (`w50-bg15-late`); the largest is 21 to 47 ms (`postFrameMax`). The foreground controls have a maximum frame gap of 37 ms (`w50-ctl`) and 40 ms (`raf-ctl`), the same range.
- **`done()` in the background works.** With the native source finishing while paused, `done()` committed 175 to 286 ms later against 17 to 36 ms in the foreground (`doneToCommitMs`). `done()` after resume works (17 to 32 ms, state `active`).

In the table, the `Longest commit gap` column is as logged: it is 40 to 76 ms in the six rows where `done()` ran in the background, and the freeze itself shows in `frameMaxMs` of the saved file (3,134 to 15,232 ms). `Background commits` counts commits while paused; the number in brackets also includes the `done()` commit.

**Conclusion.** The scheduler freezes with the host on Android, the cost after resume is about one flush, and **no scheduler change is needed** ([P2-4](./phase-2/decisions.md#p2-4-coalescing-policy)). Not tested: a producer that stalls while backgrounded, a real network stream (the release build blocks cleartext), iOS.

#### Producer in JS (timer paced, or catch-up)

| Run | Scheduler | Pace | Final == parse(full) | Commits | Background commits | Longest commit gap (ms) | First commit after resume (ms) | Commits in 300 ms after resume | Frames over 20 ms after resume (max ms) | `done()` to commit (ms), state at `done()` |
|---|---|---|---|---|---|---|---|---|---|---|
| `w50-ctl` | timer 50 ms | steady | yes | 215 | 0 | 86 | - | - | - (-) | 36, active |
| `raf-ctl` | raf | steady | yes | 487 | 0 | 55 | - | - | - (-) | 18, active |
| `w50-bg3-steady` | timer 50 ms | steady | yes | 212 | 0 | 3205 | 10 | 6 | 2 (26) | 27, active |
| `raf-bg3-steady` | raf | steady | yes | 487 | 0 | 3176 | 10 | 13 | 2 (22) | 17, active |
| `w50-bg15-steady` | timer 50 ms | steady | yes | 213 | 0 | 15180 | 10 | 6 | 1 (25) | 32, active |
| `raf-bg15-steady` | raf | steady | yes | 487 | 0 | 15166 | 16 | 12 | 4 (21) | 17, active |
| `w50-bg3-catch` | timer 50 ms | catch | yes | 94 | 0 | 3200 | 16 | 5 | 1 (21) | 29, active |
| `raf-bg3-catch` | raf | catch | yes | 325 | 1 | 3138 | 24 | 17 | 3 (22) | 18, active |
| `w50-bg15-late` | timer 50 ms | steady | yes | 213 | 0 | 15186 | 23 | 5 | 5 (26) | 24, active |
| `raf-bg15-late` | raf | steady | yes | 487 | 0 | 15192 | 25 | 12 | 4 (34) | 20, active |

#### Producer from native

| Run | Scheduler | Pace | Final == parse(full) | Commits | Background commits | Longest commit gap (ms) | First commit after resume (ms) | Commits in 300 ms after resume | Frames over 20 ms after resume (max ms) | `done()` to commit (ms), state at `done()` |
|---|---|---|---|---|---|---|---|---|---|---|
| `w50-nat-bg3` | timer 50 ms | native | yes | 81 | 0 (0 incl. done) | 3192 | 39 | 5 | 4 (39) | 30, active |
| `raf-nat-bg3` | raf | native | yes | 277 | 0 (0 incl. done) | 3202 | 50 | 15 | 4 (47) | 21, active |
| `w50-nat-bg15` | timer 50 ms | native | yes | 47 | 0 (1 incl. done) | 67 | - | - | - (-) | 212, background |
| `raf-nat-bg15` | raf | native | yes | 159 | 0 (1 incl. done) | 40 | - | - | - (-) | 208, background |
| `w50-nat-off5` | timer 50 ms | native | yes | 54 | 0 (1 incl. done) | 63 | - | - | - (-) | 175, background |
| `raf-nat-off5` | raf | native | yes | 315 | 0 (0 incl. done) | 2504 | 33 | 12 | 4 (40) | 17, active |

#### Screen off and on

| Run | Scheduler | Pace | Final == parse(full) | Commits | Background commits | Longest commit gap (ms) | First commit after resume (ms) | Commits in 300 ms after resume | Frames over 20 ms after resume (max ms) | `done()` to commit (ms), state at `done()` |
|---|---|---|---|---|---|---|---|---|---|---|
| `w50-nat-off5` | timer 50 ms | native | yes | 54 | 0 (1 incl. done) | 76 | - | - | - (-) | 286, background |
| `raf-nat-off5` | raf | native | yes | 178 | 0 (1 incl. done) | 51 | - | - | - (-) | 219, background |
| `w50-nat-off5b` | timer 50 ms | native | yes | 94 | 0 (1 incl. done) | 68 | - | - | - (-) | 219, background |
| `raf-nat-off5b` | raf | native | yes | 331 | 0 (0 incl. done) | 2402 | 59 | 1 | 3 (41) | 25, active |

## Phase 1 carry-over (#36, P1-25)

Items 1 to 3 of [P2-7](./phase-2/decisions.md#p2-7-where-the-phase-1-carry-over-lives), the work behind the [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) waiver, measured for issue #36. The budgets at the end are the ones adopted by [P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion).

- **Device:** Samsung Galaxy S25 FE (SM-S731B), Android 37, release build (Hermes, bytecode, `__DEV__ = false`, New Architecture). Not the pass/fail device. Date: 2026-11-06.
- **Raw data:** [`bench/results/sm-s731b-2026-11-06-f3cm.json`](../../bench/results/sm-s731b-2026-11-06-f3cm.json) (Bench, A), [`parsesplit-s25fe-2026-11-06.log`](../../bench/results/parsesplit-s25fe-2026-11-06.log) (C), [`profile-s25fe-2026-11-06.log`](../../bench/results/profile-s25fe-2026-11-06.log) (B, device), [`profile-sweep-node-jit.json`](../../bench/results/profile-sweep-node-jit.json) and [`profile-sweep-node-jitless.json`](../../bench/results/profile-sweep-node-jitless.json) (B, Node). The two device logs are chunked (`[parseSplit i/n]`, `[profile i/n]`); concatenate the chunks in order to get the JSON. Scripts: `bench/f3-cm.mjs`, `bench/parse-split.mjs`, `bench/profile/`; `bench/fixtures/commonmark.ts` derives F3-cm from F3.
- **Method:** A uses the bench tab, "full" mode (5 warm-up + 20 measured, medians), as in M7. B ran 3 warm-up + 15 measured rounds, jobs shuffled each round. C ran 3 warm-up + 21 measured.
- **Web (Chrome 157, 4× throttle).** Same three screens, one run each on a production export, driven by `bench/web-bench.mjs`: [`web-chrome-4x-2026-11-06-bench.json`](../../bench/results/web-chrome-4x-2026-11-06-bench.json), [`-parsesplit.log`](../../bench/results/web-chrome-4x-2026-11-06-parsesplit.log), [`-profile.log`](../../bench/results/web-chrome-4x-2026-11-06-profile.log). One run per screen on a Mac with other processes, and p90s are large (F3 v1 `firstRender` p90 1207 ms against a median of 477), so read these medians as indicative. They are not budgeted ([P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion)).
  - **A.** F3 `parse+firstRender`: v1 550.4 ms, v0 564.6 ms (a tie, as on device). F3-cm: v1 with the `commonmark` preset 347.5 ms, v1 `gfm` 513.5 ms, v0 509.1 ms, so 1.5× against 2.03× on device. `reRenderOneBlock` on F3: v1 6.8 ms, v0 387.9 ms.
  - **Parse against render is the other way round on web.** F3 v1 `parse` is 73.6 ms (269 ms on Hermes) and `firstRender` is 476.8 ms (323 ms on device), so parse is about 13% of the total on web and about 45% on device.
  - **C.** `md.parse` p50 is 212.5 ms on F3 and 159.1 ms on F3-cm; conversion is 8.7% and 7.7% of it (budget 15%). `core:linkify` is 30.4% of F3 (97 ms) and 40.0% of F3-cm (92 ms), against about 69% on Hermes. The absolute cost is similar on both engines and the rest of the parse is much cheaper on V8, so it is the largest single rule on F3-cm on web too.
  - **B.** Warm `firstRender` medians (ms): F3 335, tables 224, no-tables 305, lists 104, prose 88, code 34. Element self time sums to about 9 ms of 371 ms, so the cost is outside the component bodies, as on device. The web timer steps are 0.1 ms, so per-element self times are indicative only.

### A: CommonMark-only baseline (F3-cm)

F3-cm is F3 with everything v0.8.5 has no GFM for taken out of the text (83,538 bytes against 100,747): table lines, task-list markers, `~~` strikethrough, autolink brackets and bare schemes, footnotes. Both libraries then do the same work. `v1cm` is v1 with the `commonmark` preset (no tables, strikethrough, autolinks, task lists or footnotes); `v1` is the default `gfm` preset. Medians, ms (p90 in the raw data):

| Fixture, library | `parse` | `firstRender` | `parse+firstRender` | `reRenderOneBlock` |
|---|---|---|---|---|
| F3, v0.8.5 | n/a | n/a | 632.8 | 501.1 |
| F3, v1 `gfm` | 268.5 | 323.3 | 593.6 | 20.2 |
| F3-cm, v0.8.5 | n/a | n/a | 355.8 | 315.5 |
| F3-cm, v1 `gfm` | 158.0 | 140.7 (p90 660.4) | 299.0 | 17.8 |
| F3-cm, v1cm | 41.4 | 133.8 | 175.3 | 18.0 |

v0 is timed as one `fromMarkdown` plus render, so it has no separate `parse` or `firstRender` here.

Ratios against v0.8.5 on the same fixture (v0 / v1):

| | `parse+firstRender` | `reRenderOneBlock` |
|---|---|---|
| F3, v1 `gfm` (the waived criterion) | **1.07×** | 24.8× |
| F3-cm, v1 `gfm` | 1.19× | 17.7× |
| F3-cm, v1cm (the like-for-like baseline) | **2.03×** | 17.5× |

- **Is GFM the reason for the 1.0×? Part of it, not all.** Two steps separate the first row from the last. Taking the GFM constructs out of the text (F3 to F3-cm, same `gfm` preset) moves the ratio from 1.07× to 1.19×: v1 drops by 295 ms and v0 by 277 ms, so the removed content costs about the same in both. Switching to the `commonmark` preset then moves it from 1.19× to 2.03×, because `parse` falls from 158.0 to 41.4 ms. That second step is a fixed cost of the `gfm` preset, not a difference in work between the libraries: F3-cm has no link anywhere, and the `gfm` preset still spends most of its parse in the `linkify` core rule ([C](#c-parse-on-hermes-markdown-it-against-the-node-builder); fixed in `9f4845b`, see [After the autolink fix](#after-the-autolink-fix-9f4845b)).
- **The like-for-like baseline does not reach 5×.** Without GFM anywhere, v1cm is 2.03× v0 on `parse+firstRender`. 5× of v0's 355.8 ms is 71.2 ms, and v1cm's `firstRender` alone is 133.8 ms. What is left is render ([B](#b-where-firstrender-goes)), not parse: with the `commonmark` preset `parse` is 24% of the total. On the edit path v1 is 17.5× faster than v0 on F3-cm, so the memoization result does not depend on GFM.
- **Per phase.** Parse: v1cm 41.4 ms. Render: v1cm 133.8 ms against v1 `gfm` 140.7 ms on F3-cm, the same within noise (the `gfm` preset adds no render work when the text has no GFM). The `gfm` row's `firstRender` p90 of 660.4 ms is one slow run in 20 (the median is 140.7); the `parse+firstRender` p90 (822.0) carries it.
- **Caveats.**
  - This run was slower than M7: F3 v1 `parse+firstRender` is 593.6 ms against 458.6 ms, `parse` 268.5 against 215.8, `firstRender` 323.3 against 242.7. v0 was slower too (632.8 against 447.5), so the F3 ratio (1.07×) stays near M7's 1.0×, but absolute numbers here are not comparable to the M7 table. The reason is not known.
  - Run-to-run variance on this device is large and its cause is not identified (see the repeat run in [After the autolink fix](#after-the-autolink-fix-9f4845b): v1cm F3-cm `parse` went from 41.4 to 55.2 ms with no change to that preset).
  - Airplane mode, battery and temperature were not recorded for this run, so the M7 conditions do not carry over.
  - F3-cm is derived by text edits; it keeps `[text](url)` links, inline code and fenced code, and has 2,961 tokens against F3's 6,505. It is a like-for-like fixture, not a typical CommonMark document.

### B: where `firstRender` goes

The timed window is Bench's: from the `setState` that mounts a pre-parsed document to the container's `onLayout`. Inside it: `renderBlock` and inline flattening, React reconciliation and every component's render function, creation of the native views, and layout up to `onLayout`. Not inside it: parse, and the table measuring pass (cells report their widths on layout, then a `requestAnimationFrame` callback re-renders the table with fixed column widths). With a cold width cache, the wrapped run counted all 34 F3 tables rendering after the window (`tableAfter` 34 of 34); with a warm cache none did. So the measuring re-render is **not** in any `firstRender` figure below. It is real work on the first mount of a table, and it is not measured here.

Device, S25 FE, uninstrumented (`plain`) medians of 15 runs, warm table cache, ms. The variants are F3 cut into top-level segments by kind (`bench/profile/variants.ts`):

| Rank | Variant | Blocks | `firstRender` | Per block | Node `--jitless` mount | Node JIT mount |
|---|---|---|---|---|---|---|
| 1 | tables (17,100 B; 34 tables, 952 cells) | 34 | 132.0 (p90 208.8) | 3.9 | 80.7 | 34.6 |
| 2 | prose (46,600 B) | 346 | 110.7 (p90 142.5) | 0.32 | 34.1 | 12.9 |
| 3 | lists (19,731 B; 309 items) | 68 | 102.3 (p90 189.6) | 1.5 | 71.1 | 34.4 |
| 4 | code (17,097 B) | 70 | 77.5 (p90 92.9) | 1.1 | 9.6 | 4.0 |
| | F3 without tables | 520 | 156.8 (p90 234.9) | | 117.6 | 49.6 |
| | F3 | 554 | 291.7 (cold cache 295.1; p90 355.6) | | 203.3 | 97.5 |

- **Tables are the largest single cost, about 46% of F3's `firstRender`.** F3 minus the no-tables variant is 134.9 ms on the device (46%), 85.7 ms in Node `--jitless` (42%) and 47.9 ms in Node JIT (49%). The three agree, so the share is not an artifact of one engine.
- **Code blocks are cheap in JavaScript and expensive on the device.** The 70 code blocks mount in 4.0 ms (Node JIT) or 9.6 ms (`--jitless`) without layout, and take 77.5 ms on the device: 1.1 ms per block, each block a `View` and a horizontal `ScrollView` ([`CodeBlock`](../../src/render/defaults/block.tsx)). The per-block figure includes the fixed cost of one mount. The `ScrollView`'s share is measured in [B2](#b2-the-codeblock-scrollview-38): about half.
- **The variants do not add up to F3** (132.0 + 110.7 + 102.3 + 77.5 = 422.5 against 291.7): each carries its own mount overhead, and F3 also has headings, quotes and dividers that no variant holds. Read them as a ranking and as per-block rates, not as slices of F3.
- **Component self time is almost nothing.** With every default component wrapped, the components' own render time on F3 sums to 6.2 ms (warm) and 6.4 ms (cold), out of 282 and 298 ms. By element, ms of self time on F3 (calls, µs per call): `TableCell` 2.09 (952, 2.2), `ListItem` 1.05 (309, 3.4), `InlineCode` 0.97 (1,394, 0.7), `Paragraph` 0.86 (516, 1.7), `Heading` 0.30 (140, 2.1), `Table` 0.27 (34, 8.0), `CodeBlock` 0.17 (70, 2.5), every other element under 0.15 ms. About 2% of `firstRender` is in the components' own functions. The rest is `renderBlock` and inline flattening, React reconciliation, native view creation and layout, which this run does not separate.
- **Node: element creation is a small part of the mount.** `renderBlock` over every F3 block with stub components (block walk, props, theme lookups, `createElement`; no reconciliation) takes 9.9 ms of the 97.5 ms JIT mount (10%) and 15.7 of 203.3 ms `--jitless` (8%). Share of that time by top-level type (JIT / `--jitless`): `Table` 43% / 45% (126 / 207 µs per block), `List` 32% / 33% (46 / 74 µs), `Paragraph` 11% / 12%, `Blockquote` 5%, `Heading` 4%, `CodeBlock` 2%. The first theme resolution costs 0.77 ms (JIT), 0.06 ms warm.
- **Counts.** F3 renders 2,127 `Text`, 1,394 `InlineCode`, 952 `TableCell`, 516 `Paragraph`, 309 `ListItem`, 238 `TableRow`, 140 `Heading`, 103 `List`, 70 `CodeBlock`, and 34 each of `Table`, `TableHead`, `TableBody`, `Blockquote` and `Divider`. Native view counts per element were not collected.

Not shown by B: a Hermes sampling profile (no function-level CPU data for `renderBlock`, React or the native commit), and the cost of the table measuring pass. The wrapped numbers include timer overhead (0.00008 ms per timer pair, subtracted from self times only, not from the totals).

### B2: the `CodeBlock` `ScrollView` (#38)

Issue #38, step 1: how much of the `code` variant's `firstRender` is the default [`CodeBlock`](../../src/render/defaults/block.tsx)'s horizontal `ScrollView`. Same device (S25 FE, release build), same method as B's `plain` mode (pre-parsed document, from the `setState` that mounts it to the container's `onLayout`), 3 warm-up rounds and 15 measured runs, structures shuffled every round. The `code` variant is 70 blocks, 17,097 B. Each structure replaces `components.CodeBlock` (the first is the shipped default). Raw samples: [`codeblock-scrollview-s25fe-2026-11-06.json`](../../bench/results/codeblock-scrollview-s25fe-2026-11-06.json) (chunked `[codebench i/n]`, concatenate the chunks).

| Structure | `firstRender` median (p90) | Per block |
|---|---|---|
| Default: `View > ScrollView > Text` | 82.9 (89.2) | 1.18 |
| Same structure as an override (control) | 83.6 (89.7) | 1.19 |
| `ScrollView` replaced by a `View`: `View > View > Text` | 38.8 (42.0) | 0.55 |
| `View > View > View > Text` | 39.2 (59.3) | 0.56 |
| `View > Text` | 39.2 (46.3) | 0.56 |

- **The `ScrollView` is 44 ms of the 82.9 ms (53%), about 0.63 ms per block.** The override control equals the shipped component (83.6 against 82.9), so the comparison is like for like. The `View > View > View > Text` and `View > Text` structures cost the same as `View > View > Text`, so the cost is the scroll view's host component, not view nesting.
- **Runs fall in two modes.** In 4 of 15 runs the default took 25 to 28 ms and in the other 11 it took 78 to 92 ms; the plain-`View` structure took 16 to 17 ms in 4 of 15 runs and 37 to 49 ms otherwise. Slow-mode medians are 87 and 39 ms (the `ScrollView` is 48 ms, 55%); fast-mode ones are about 26 and 16.5 ms (9.5 ms, 36%). The cause of the fast mode is not identified. Fast runs per structure, out of 15: default 4, override 2, `View > View > Text` 4, `View > View > View > Text` 2, `View > Text` 0. The table's medians are slow-mode figures.
- **A "scroll only if a line overflows" structure cannot help on this fixture.** Every one of the 70 blocks has a longest line of 41 to 78 characters (median 66). At a 13 px monospace font (about 7.8 dp per character; the theme's actual code font size was not read), 66 characters are about 515 dp, wider than the S25 FE's 412 dp screen, so all 70 blocks need to scroll. A static line-length rule would keep the `ScrollView` on every block, and measuring first (`onTextLayout`, then upgrade) would add a wasted pass to each. The fixture is uniform, so this says nothing about code with shorter lines.
- **Not done:** no cheaper structure was built or measured, and no realistic-width code fixture exists, so the gain on typical documents is unknown. The 30 ms target discussed for #38 is not reachable on the F3 `code` variant without changing the look (wrapping long lines).

### C: parse on Hermes (markdown-it against the node builder)

The `ParseSplit` screen times `md.parse` and the token-to-table conversion separately, then runs `md.parse` again with every rule wrapped for a per-rule split. Medians of 21 runs after 3 warm-up runs, `gfm` preset, ms:

| Fixture | Tokens | `md.parse` | Conversion | Conversion / `md.parse` | Total |
|---|---|---|---|---|---|
| F2 × 10 (95 KB) | 6,087 | 171.6 | 9.8 | 5.7% | 179.5 |
| F3 (98 KB) | 6,505 | 178.4 | 10.0 | 5.6% | 188.8 |
| F3-cm (82 KB) | 2,961 | 177.3 | 8.4 | 4.7% | 187.2 |

- **Conversion meets the P1-10 budget with a wide margin.** (Before the autolink fix; after it the share is about 21%, see [After the autolink fix](#after-the-autolink-fix-9f4845b).) 4.7% to 5.7% against the 15% limit ([P1-10](./phase-1/decisions.md#p1-10-relative-conversion-budget)); this is its first measurement on F3. The M1 device figure was 14.8% of a 108 ms `md.parse`. The share fell because `md.parse` grew (the `linkify` rule, below), and the conversion itself is also lower (10.0 ms against 15.95 ms); the fixture and build differ, so the two are not directly comparable.
- **`md.parse` is the cost, and F3-cm costs as much as F3.** `md.parse` is 177.3 ms on F3-cm, which has no table and no link, against 178.4 ms on F3 with 2.2× the tokens. Neither token count nor GFM syntax sets the time.

Per-rule split (instrumented run, same preset; share of the sum of the top-level `core` rules, since the `inline:*` rules run inside `core:inline`):

| Rule | F3 ms | F3 share | F3-cm ms | F3-cm share | Calls per parse (F3) |
|---|---|---|---|---|---|
| `core:linkify` | 218.1 | 68.7% | 191.0 | 74.2% | 1 |
| `core:inline` | 58.6 | 18.5% | 40.9 | 15.9% | 1 |
| `core:block` | 36.7 | 11.6% | 22.9 | 8.9% | 1 |
| `inline:backticks` (in `core:inline`) | 10.5 | 3.3% | 7.0 | 2.7% | 2,022 |
| `inline:text` (in `core:inline`) | 7.9 | 2.5% | 6.9 | 2.7% | 5,083 |
| `inline:emphasis` (in `core:inline`) | 4.6 | 1.4% | 4.6 | 1.8% | 626 |
| `inline:linkify` (in `core:inline`) | 1.0 | 0.3% | 0.5 | 0.2% | 2,400 |

- **The `core:linkify` rule takes about 69% of F3's `md.parse` (74% on F3-cm).** (Fixed in `9f4845b`; see [After the autolink fix](#after-the-autolink-fix-9f4845b).) It is one call per parse that runs linkify-it's fuzzy matcher over the text tokens of every inline token ([`autolinks.ts`](../../src/plugins/autolinks.ts)), and on F3-cm it finds nothing to link.
- **A second measurement agrees.** On F3-cm the Bench `parse` is 158.0 ms with the `gfm` preset and 41.4 ms with `commonmark`; the 116.6 ms difference is 74% of the `gfm` figure, the same as the rule split. The `gfm` preset also adds tables, strikethrough and footnotes, but F3-cm has none of those constructs.
- **P1-1's estimate was for Node `--jitless`, and Hermes pays far more.** [P1-1](./phase-1/decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps) measured fuzzy linkify at +18% of markdown-it's parse (56.1 to 66.4 ms). On Hermes it is about two thirds of the parse. The Node figure was not a usable proxy for this rule.
- **Caveats.**
  - The instrumented run is slower than the plain one: the top-level rule times sum to about 317 ms for F3 (218.1 + 58.6 + 36.7 + small rules), against 178.4 ms for the plain `md.parse`. Wrapping a rule costs time, mostly in rules with thousands of calls, so the shares are approximate and the absolute milliseconds in the table are not parse times. `core:linkify` is one call, so the wrapper is not what makes it large; the `gfm`-against-`commonmark` difference above is the check on its share.
  - The ParseSplit and Bench runs disagree on F3's parse time: 188.8 ms against 268.5 ms. They are separate runs, with the variance caveat above. Use the shares and ratios, not the two absolute figures together.
  - No Hermes sampling profile was taken, so nothing is known below rule level (for example, whether the time goes to regular-expression scans, `linkify.test` calls or token allocation inside the rule).

### After the autolink fix (9f4845b)

Commit `9f4845b` (`perf(v1): prefilter linkify.test with substring checks`) puts a cheap substring check (`mayContainAutolink` in [`autolinks.ts`](../../src/plugins/autolinks.ts)) in front of `md.linkify.test`, so text that cannot contain a link skips linkify-it's fuzzy matcher. The same device, build and methods as A and C, run later on 2026-11-06.

- **Raw data:** [`sm-s731b-2026-11-06-linkify-fix.json`](../../bench/results/sm-s731b-2026-11-06-linkify-fix.json) (Bench, full mode, 5 warm-up + 20 measured, impls v0, v1 and v1cm) and [`parsesplit-s25fe-2026-11-06-linkify-fix.log`](../../bench/results/parsesplit-s25fe-2026-11-06-linkify-fix.log) (ParseSplit, 3 warm-up + 21 measured; chunked `[parseSplit i/n]`, concatenate the chunks). Before: the F3-cm Bench file and ParseSplit log listed above.

ParseSplit, F3 (medians, ms):

| | Before | After |
|---|---|---|
| `md.parse` | 178.4 | 42.2 |
| `core:linkify` (instrumented run) | 218.1 ms, 68.7% of the top-level `core` rules | 1.7 ms, 3.1% |
| `parse()` (`md.parse` plus conversion) | 188.8 | 52.9 |
| Conversion (`convertTokens`) | 10.0 | 8.7 |
| Conversion / `md.parse` | 5.6% | 20.6% |

`md.parse` on the other fixtures: F2 × 10 171.6 to 39.9 ms (conversion share 20.5%), F3-cm 177.3 to 27.7 ms (21.4%).

Bench, F3, v1 `gfm` (medians, ms):

| | Before (11-06 earlier run) | After | Change |
|---|---|---|---|
| `parse` | 268.5 | 79.4 | -189.1 |
| `firstRender` | 323.3 | 264.5 | -58.8 |
| `parse+firstRender` | 593.6 | 338.1 | -255.5 |
| `reRenderOneBlock` | 20.2 | 18.5 | -1.7 |
| v0.8.5 `parse+firstRender`, same run | 632.8 | 504.7 | |
| Ratio against v0.8.5 | 1.07× | **1.5×** | |

F3-cm `parse+firstRender` (ms): v1 `gfm` 240.0 (before 299.0), v1cm 230.1 (before 175.3), v0.8.5 482.2 (before 355.8). Ratios against v0.8.5: `gfm` **2.0×** (was 1.19×), `commonmark` **2.1×** (was 2.03×).

- **The fix removes the cost it was aimed at.** `core:linkify` falls from about 218 ms to 1.7 ms on F3, and F3 `md.parse` from 178.4 to 42.2 ms. The F3-cm `gfm` preset now parses in 66.2 ms in Bench (158.0 before), close to the `commonmark` preset. In Node `--jitless`, as reported by the owner and not re-measured here: `core:linkify` about 18 ms to 1 to 2 ms, F3 `md.parse` 64.8 to 43.9 ms, conversion 15.2% of `md.parse`.
- **Same-run ratios are the reliable part; absolute numbers are not.** Run-to-run noise on this device is large and its cause is not identified: v0.8.5 on F3 was 632.8 ms in the earlier run and 504.7 ms in this one, and the v1cm F3-cm `parse` went from 41.4 to 55.2 ms although that preset is not touched by the fix. The F3 ratio against v0.8.5 went from 1.07× (earlier run, v1 593.6 ms against v0 632.8 ms) to 1.5× (this run, v1 338.1 ms against v0 504.7 ms). Part of that change is v0 running faster in the second run, so compare each ratio only with the other numbers of its own run. v1 fell by 255 ms between the runs and v0 by 128 ms.
- **`firstRender` is now most of the total.** On F3 it is 264.5 of 338.1 ms (78%). 5× against v0.8.5 on F3 would need about 101 ms (504.7 / 5) for `parse+firstRender`; `firstRender` alone is 264.5 ms, so it is still out of reach. On F3-cm the like-for-like ratio is 2.1×, as before.
- **Conversion is now over the P1-10 share.** `convertTokens` is 8.7 ms, which is 20.6% of F3's `md.parse` (20.5% on F2 × 10, 21.4% on F3-cm), above the 15% limit of [P1-10](./phase-1/decisions.md#p1-10-relative-conversion-budget). The builder did not change (10.0 ms before, 8.7 ms now); the denominator shrank from 178.4 to 42.2 ms. P1-10 was set when markdown-it was 100 ms or more of the parse, so a relative budget no longer fits. It is restated as an absolute budget in [P2-10](./phase-2/decisions.md#p2-10-absolute-conversion-budget-replaces-the-relative-p1-10-budget).
- **Not measured:** why v0.8.5 and the unaffected v1cm preset differ between the two runs; whether the fix changes autolink output (the spec suites are the check for that, not this table).

### Proposed budgets for F3

**Adopted by [P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion); `parse` tightened to 100 ms on 2026-11-06 after the autolink fix. All are medians of 5 warm-up + 20 measured runs on the S25 FE release build, F3, bench tab "full" mode. Two kinds of number are kept apart: a **ceiling** (the worst median seen on this device in the three runs of 2026-11-04, 11-05 and 11-06, a do-not-regress guard) and a **target after a fix**, given only where the data above supports a derivation.

| Metric (F3, v1 `gfm`) | Measured (11-04 / 11-05 / 11-06 / 11-06 after fix) | Adopted ceiling | Derivation |
|---|---|---|---|
| `parse` | 194.8 / 215.8 / 268.5 / 79.4 | 100 | Tightened from 270 after the autolink fix: 79.4 (the after-fix median) plus 25% for noise is 99.3, rounded to 100. The owner's pick, made on 2026-11-06 per [P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion) point 2. It is a guard, not a target. |
| `firstRender` | 254.1 / 242.7 / 323.3 / 264.5 | 325 | Unchanged (worst median of the first three runs). The data ranks costs (tables about 46%) but no experiment shows what a fix saves. Tightened when a render fix is measured. |
| `reRenderOneBlock` | 33.9 / 15.9 / 20.2 / 18.5 | 25 | 25 ms is the highest recent median (20.2) plus 25%; it is also 7.7% of that run's `firstRender`, inside the existing bar of at most 10%. The 11-04 figure (33.9) is the M3 one and is not used. Unchanged. |
| `parse+firstRender` | 448.1 / 458.6 / 593.6 / 338.1 | 595 | Unchanged: the sum of the old `parse` and `firstRender` ceilings. Tightened when a render fix is measured. For scale, 5× faster than v0 on F3 would be about 101 ms (504.7 / 5, same run as the after-fix figures). |

- **The spread between runs is large (`parse` 194.8 to 268.5 ms) and its cause is not identified.** A budget enforced on one number needs the run repeated on the same device in the same session, or the ceiling is a guess. Until then the ceilings are a record of the worst seen, not a statement of what the library costs.
- **Reference ratio, not a gate.** F3-cm `parse+firstRender` is 2.03× v0.8.5 with the `commonmark` preset (1.19× with `gfm`). This is the number a ratio criterion would be judged against (the roadmap's v1.0 line); on this data 5× is out of reach without cutting `firstRender` by more than half.
- **Not proposed:** a `firstRender` target, a code-block or table budget, and a low-end device figure (no device; [P2-7](./phase-2/decisions.md#p2-7-where-the-phase-1-carry-over-lives) item 5).

## Not measured

- A low-end Android (Snapdragon 6xx class) and a recent iPhone (not available for M7; see [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1)). For Phase 2 streaming the iPhone (including background and resume on iOS) and `F4c` (a real LLM transcript) are **waived (P2-8)**; the S25 FE full-method run is done ([results](#phase-2-device-benchmark-s5-s25-fe)).
- Images in the fixtures (no asset resolver in the example, and remote images would add network time).
- Memory: AST size per KB of input, on device. (Heap growth over a 10 KB stream is measured: [S25 FE heap](#heap).)
- `retainedHeap` and `droppedFrames` on web (no Hermes), and iOS Animation Hitches.
