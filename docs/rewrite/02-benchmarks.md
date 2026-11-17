# 02 · Benchmarks

Summary of what the measurements showed and which decisions they drove. The full log (every table, method, caveat, raw-data pointer) is [`bench/results/REPORT.md`](../../bench/results/REPORT.md). Raw data is in `bench/results/`. New results go there, not here: this page records conclusions only.

All device numbers are from one Samsung Galaxy S25 FE (Hermes, release build, New Architecture) plus Chrome 156 at 4× CPU throttle. No low-end Android and no iPhone were available ([P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1), [P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred)).

## 1. Parser choice (Node 22, `--jitless` as a rough Hermes proxy)

97 KB document, parse only:

| Parser | Time |
|---|---|
| micromark + mdast (v0.8.5) | 607 ms |
| markdown-it 15 | 73 ms |
| marked 18 | 43 ms |
| commonmark.js (no GFM) | 35 ms |

Re-parsing a growing 8 KB buffer 200 times: micromark 4,608 ms, marked 368 ms.

Conclusions:

- The v0 parser alone rules out long or streamed content.
- markdown-it is the default (full CommonMark, mature GFM plugins): [03](./03-architecture.md#1-parser-layer).
- Full re-parse per chunk is O(n²) however fast the parser is, so streaming re-parses the tail only: [05](./05-streaming.md).

Reproduce: `yarn workspace @docren/react-native-markdown-bench bench` (`bench:large`, `bench:jitless`).

## 2. Phase 1: parse and render against v0.8.5 (S25 FE)

| Metric (F3, 98 KB) | v1 | v0.8.5 |
|---|---|---|
| `parse+firstRender` | 458.6 ms | 447.5 ms (1.0×) |
| `reRenderOneBlock` | 15.9 ms | 437.5 ms (27.5×) |

- **Memoization works.** Editing one block costs 6.6% of v1's own `firstRender` on device (bar: 10%) and 1.2% on web.
- **First render is not faster than v0.** The ≥ 5× exit criterion was not met and was waived ([P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1)). v0.8.5 has no GFM, so v1 does more work.
- **On a like-for-like CommonMark-only fixture the ratio is 2.03×**, not 5×. Render, not parse, dominates (`firstRender` 133.8 ms of 175.3 ms).
- **Profiling findings** ([#36](https://github.com/amilmohd155/react-native-markdown/issues/36)): `core:linkify` took about 69% of markdown-it parse time on Hermes (fixed, `parse` fell to 79 ms); tables are about 46% of F3 `firstRender`; node-table conversion is under 15% of parse (budget met).
- **Host views and the table measuring pass** ([#39](https://github.com/amilmohd155/react-native-markdown/issues/39), [B3](../../bench/results/REPORT.md#b3-host-element-census-the-table-measuring-pass-and-the-900-ms-gap-39)): F3 is 6,162 host nodes (tables 46%, lists 36%) and 3,288 native views on S25 FE; `firstRender` is inside its budget. Cold tables commit twice and the second commit lands about 900 ms after the first, mostly the UI-thread mount of the first tree and the 104 `ScrollView` state commits (34 tables, 70 code blocks), not the measuring pass. Fewer `ScrollView`s is the biggest lever; nothing was changed or tried.
- **Flat node table vs object tree:** the table is equal or faster and uses 4–16% less heap, so it stays ([P1-24](./phase-1/decisions.md#p1-24-keep-the-flat-table-render-ab-against-an-object-tree)).
- **`isSameBlock` vs hashing every block:** half the cost on Hermes ([P1-9](./phase-1/decisions.md)).
- **Chat list (200 messages):** v1 holds 1.87 MB vs v0's 0.57 MB, but the two hold different things (all parsed documents vs the mounted window), so the `retainedHeap` bar was not measured fairly. Dropped frames are not worse than v0.

### Budgets that replace the 5× criterion ([P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion))

F3, S25 FE release, medians: `parse` ≤ 100 ms, `firstRender` ≤ 325 ms, `reRenderOneBlock` ≤ 25 ms, `parse+firstRender` ≤ 595 ms. There is no ratio against v0 any more: the v0.8.5 comparison is finished and the sections above are its record, and its tooling is removed.

## 3. Phase 2: streaming

`streamCost` = total flush cost ÷ one full `parse()` of the same text. Bars from [P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture), at the 50 ms window.

| Fixture | Bar | Web 4× (sim) | S25 FE, real stream core |
|---|---|---|---|
| `F4a` F2, 20-char chunks | ≤ 5× | 4.28× pass | 6.30× miss (footnote full re-parses), waived; footnote-free variant 4.3× pass |
| `F4b` F2, 195-char chunks | ≤ 2× | 1.42× pass | 2.46× miss, same cause; footnote-free 1.42× pass |
| `F4d` code-heavy | ≤ 20 ms total | 5.6 ms | 15.5 ms pass (26.6 ms without the fast path) |

- **Tail re-parse beats naive by two orders of magnitude** (F2, 20-char chunks: 11× vs 234×). A flush window then divides the cost by flush count (50 ms: 4.4×).
- **The open-fence fast path matters for code-heavy streams** (56.9× → 7.2× in the spike, flush cost halved on device) ([P2-5](./phase-2/decisions.md#p2-5-open-fence-fast-path)).
- **Scheduler default:** `raf` on iOS and Android, 16 ms `timeout` on web, the window (`flushIntervalMs`) is internal to the scheduler, not a hook option. A hidden web tab stalls `raf` (27 s vs 8 s) ([P2-4](./phase-2/decisions.md#p2-4-coalescing-policy)).
- **Splice** costs 0.026 ms per flush (about 3% of flush cost). `done()` costs 16.75 ms on `F4a`. Retained heap grows 39 KB over a 10 KB stream.
- **`isSameBlock` through `<Block>`** costs 0.15–0.43 ms per flush, at most 0.8% of stream time; gap accepted ([P2-2](./phase-2/decisions.md#p2-2-splice-strategy)).
- **Background and resume** (Android): no bug, one flush after resume, final document equals `parse(full)` in 20 of 20 runs.
- **Pathological single-block inputs** are quadratic by nature; the test asserts a cost relative to flush count, not a fixed time ([testing-harness](./testing-harness.md#pathological-input)).

## 4. Not measured

- Low-end Android and iPhone (iOS `CADisplayLink`, iOS background and resume): waived, revisit at the [v1.0 gate](./07-roadmap.md#v10-release-gate).
- `F4c` (a real LLM transcript): none collected, the committed transcripts are synthetic and must not set a bar.
- Images in fixtures; `retainedHeap` and dropped frames on web.
