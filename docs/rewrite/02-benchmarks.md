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

## Not measured yet

- `retainedHeap` and `droppedFrames` (F5), and images in the fixtures (M7).
- A low-end Android (Snapdragon 6xx class) and a recent iPhone (M7).
- Memory: AST size per KB of input, on device (M7).
