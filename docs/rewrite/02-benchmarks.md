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
- **Text comparison costs more on Hermes than on V8.** Hermes copies substrings, so comparing all 900 blocks costs 6.13 ms (0.10 ms in Node). It's still 2× cheaper than hashing, and it only runs on re-render against a previous document, which always follows a ~122 ms parse. Hashing would cost 12.24 ms on every parse. Caching each block's text on its table after the first comparison would halve the copies for consecutive re-renders, if ever needed.

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

- **Exit criterion (≥ 5× on `parse+firstRender`, F3): not met.** 1.0× on the S25 FE and 1.08× on web. The M3 explanation holds: v0.8.5 has no GFM (so v1 does more work on F2/F3), and v1's render dominates its total (243 ms against 216 ms of parse on device; about 90% on web). Parse on Hermes is about 2.8× the Node `--jitless` figure above (216 against 78 ms on F3). Waived for Phase 1, carried into Phase 2: [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1).
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
- **No real LLM transcripts (F4c).** No API key or recording was available. `bench/fixtures/transcripts/` holds synthetic ones (about 1.3 to 1.5 KB each, authored and modelled; 24 to 32× unbatched, 5× at 200 ms). They must not set the bar. F4c stays open and has to be recorded before S5; see `bench/fixtures/transcripts/SOURCES.md`.
- **The spike's tail path ends with 57 blocks, a full parse with 58.** F2 ends with a footnote definition `[^perf]:`, and the tail parse cannot see the earlier reference. The design already handles this (a footnote definition is a full re-parse trigger and the footnote section is always open, see [stream-algorithm](./phase-2/stream-algorithm.md)), so S1 must implement it; the spike does not.

### Reproduce

```bash
cd bench && yarn stream:jitless                         # all strategies on F2
cd bench && yarn stream:jitless --transcript file       # replay a transcript from bench/fixtures/transcripts
```

## Not measured

- A low-end Android (Snapdragon 6xx class) and a recent iPhone (not available for M7; see [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1)).
- Images in the fixtures (no asset resolver in the example, and remote images would add network time).
- Memory: AST size per KB of input, on device.
- `retainedHeap` and `droppedFrames` on web (no Hermes), and iOS Animation Hitches.
