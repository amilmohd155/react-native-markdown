# Phase 2b · Implementation decisions

Numbered `P2b-n`. Design-level decisions (`D1`–`D9`) live in the [roadmap decision log](../07-roadmap.md#decisions); earlier phases are in [phase-1](../phase-1/decisions.md), [phase-2](../phase-2/decisions.md) and [phase-3](../phase-3/decisions.md). A decision that changes the design must update the design doc it affects.

Each entry is short on purpose: **what we chose and why**. Measurements go in [`bench/results/REPORT.md`](../../../bench/results/REPORT.md), not here.

**Status:** `Proposed`, `Accepted`, `Superseded by P2b-n`. Entry format: `Status · Date`, `Decision`, `Why`, short `As built`.

---

## P2b-1: Streaming polish is Phase 2b, scheduled before the rest of Phase 3

Accepted · 2026-11-17

- **Decision:** a new phase, **2b**, extending Phase 2 so the Phase 3 and 4 numbers stay stable. It runs now: Phase 3 pauses after its built work and resumes when Phase 2b is done. Scope: [README](./README.md).
- **Why:** the comparison with [enriched-markdown's streaming API](https://docs.swmansion.com/enriched-markdown/react-native/api-reference/enriched-markdown-text#streamingconfig) showed gaps in how a stream *looks* (bursty growth, half-written tables, no animation), not in how it is parsed. Phase 3's follow-tail ([P3-5](../phase-3/decisions.md#p3-5-follow-tail-implemented-in-the-library-the-same-on-scrollview-and-flatlist)) is tuned against the growth cadence this phase changes, so its device checks are re-run afterwards.

## P2b-2: `hide-incomplete` is always on; the `smoothing` option is removed

Accepted · 2026-11-17

- **Decision:** the open block's view always hides a dangling inline fragment, with the semantics of [P2-6](../phase-2/decisions.md#p2-6-hide-incomplete-semantics). `useMarkdownStream` loses `smoothing`. `done()` and `reset()` still return the exact parse.
- **Why:** without it a stream flashes `**bol` and `[docs](https://ex` as raw text, so nobody wants `'none'`; enriched-markdown has no toggle either. The name also collides with `smooth` (P2b-4). v1 is unreleased, so nothing outside this branch breaks.
- **As built:** the hook passes `smoothing: 'hide-incomplete'` to the core. The core keeps its `smoothing` option (default `'none'`) as the internal exact switch, so core tests, the harness and `bench/scheduler.mjs` are unchanged. Supersedes the opt-in part of P2-6.

## P2b-3: Tables: wait for header and delimiter, drop a partial trailing row

Accepted · 2026-11-17

- **Decision:** in the open block's view, a table shows nothing until its delimiter row has the header's column count and has ended with its newline; then the text is cut back to the last `\n`, so a row appears when its line ends.
- **Why:** a header otherwise streams as a paragraph of pipes and then flips to a table, and a partial row renders padded with empty cells.
- **Scope:** the view only. The core and `done()` keep returning `parse(source)`; the renderer cannot tell a finished row from a partial one.
- **As built:** `src/stream/smoothing.ts`, rules in [smoothing.md](../phase-2/smoothing.md#tables). Tables after a paragraph line, in list items and in quotes are handled too; rows not starting with `|` are not detected. Supersedes the "tables are not smoothed" line of P2-6.

## P2b-4: `smooth` paces text before it reaches the core

Accepted · 2026-11-17

- **Decision:** `streamingConfig.smooth` (default `false`) releases buffered text to the core a little per frame, ending at a word boundary, so growth is steady. A partial word or a bare list or heading marker waits for the next word, at most 500 ms. The backlog drains over about the gap to the next chunk, never more than 1 s behind. `done()` drains the rest within 200 ms, then publishes the exact parse; `reset()` drops the backlog. Pure JS (D2).
- **Why:** models deliver text in bursts, which is what chat users notice most. Pacing *before* the core keeps it append-only, so tail re-parse, splicing and the equivalence guarantee are untouched; pacing the view would need a second parse path.
- **Cost:** about one flush per frame while draining. Opt-in, so the Phase 2 bars are unaffected.
- **As built:** `src/stream/pacer.ts` wraps the scheduler; the pacer owns the cadence (so the window of [P2b-7](#p2b-7-flushintervalms-becomes-internal) is not a second knob). Rules: [hook-and-scheduler](../phase-2/hook-and-scheduler.md#pacer). Open: the F4d total-flush-cost bar with `smooth` on, with the device A/B.

## P2b-5: `animation` is a block-level fade, `'none' | 'fade'`

Accepted · 2026-11-17

- **Decision:** `streamingConfig.animation` is `'none' | 'fade' | { type: 'fade', duration?: number }`, default `'none'`. A block that mounts while the stream is live fades in once (200 ms by default). Blocks present at first render and everything after `done()` do not fade; Reduce Motion turns it off. `<Markdown document>` needs no new prop; `scroll`, `virtualize` and the block hook inherit it.
- **Why:** per-word fade and a gradient need per-glyph control, which is native text work in enriched-markdown; in pure JS it is one animated node per word in a `<Text>` that re-renders every flush. A block fade is cheap because frozen blocks are memoized. Its effect is modest: text inside the open block still grows without fading.
- **Deferred:** `gradient`, per-word fade, per-row fade for tables; revisit with a measured prototype, or with a native entry point (Phase 4).
- **As built:** the document carries its stream state and fade length (`src/api/document.ts`); `src/api/fade.ts` stamps a birth time on new blocks; `FadingBlock` (`src/render/Block.tsx`) animates a block only if it mounts within 500 ms of its birth, so a list cell scrolled in later does not fade. `Animated` with the native driver on iOS and Android, the JS driver on web (tested under react-native-web and jsdom, not in a browser).

## P2b-6: One `streamingConfig` object and `onStreamingEnd`

Accepted · 2026-11-17

- **Decision:** `useMarkdownStream` takes `streamingConfig?: { smooth?, animation? }` and `onStreamingEnd?: () => void`; `preset`, `html` and `plugins` stay flat. `onStreamingEnd` fires once per stream, after the exact `done()` document is committed (after the drain, with `smooth`). `reset()` starts a new stream; unmount never fires it.
- **Why:** one object keeps later options additive. The callback is on the hook because the hook owns the lifecycle.
- **Deferred:** per-block modes for code and media; code already streams progressively and half-written images and links are hidden by P2b-2.
- **As built:** `onFlush(table, kind)` tells the hook which call published a table; an effect on `document` calls the latest callback (held in a ref) once per epoch that `done()` ended. The dev warning compares `animation` by resolved duration. Edge: `done()` and `reset()` in one batch never commit the `done()` document, so that stream does not fire.

## P2b-7: `flushIntervalMs` becomes internal

Accepted · 2026-11-17

- **Decision:** `useMarkdownStream` no longer takes `flushIntervalMs`. The default schedule of [P2-4](../phase-2/decisions.md#p2-4-coalescing-policy) stays: `raf` on iOS and Android, a 16 ms `timeout` window on web.
- **Why:** it is a tuning knob with a measured default, and with `smooth` it does not affect what the user sees. It can be added back without a break, but not removed.
- **As built:** gone from `UseMarkdownStreamOptions`; the scheduler and core keep it, so `scheduler.test.ts` and the Node benches still sweep windows. Hook tests run the default schedule. `StreamBench` uses public API only and has no interval sweep. Supersedes the `flushIntervalMs` line of P2-4 for the public API.

## P2b-8: Phase 2b exit: the S25 FE latency is accepted, three checks are waived

Accepted · 2026-11-18

- **Decision:** accept the S25 FE append-to-commit latency of the new default (F4a p50 +11%, F4d +14% against the pre-Phase-2b baseline; commits and dropped frames unchanged) and close the "cost holds" exit item. Waive three checks by name:
  - F4d total flush cost with `smooth` on: the bar is defined at a 50 ms window, which is internal since P2b-7, and no bench drives the pacer. Carried to the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase).
  - The follow-tail pass on iOS with `smooth` on: added to the [v1.0 release gate](../07-roadmap.md#v10-release-gate).
  - Resuming by a slow drag while code streams: not confirmable on the S25 FE (the stream outruns a hand drag); a fling resumes. No gate.
- **Why:** the web A/B ran old and new code back to back in one session and shows no cost (commits within 0.2%, latency within 2% on F4a and F4d). The phone baseline was taken in another session on a colder, lower-battery device, so the difference is most likely drift. The Node run shows only a small real cost, from the table rules (about 0.2 to 0.45 ms per flush under jitless). This is an inference, not a measurement: old and new were never run back to back on the phone. Re-judge it if the v1.0 low-end Android run shows a regression.
- Evidence: the Phase 2b sections of [`bench/results/REPORT.md`](../../../bench/results/REPORT.md) (Node baseline and after, S25 FE baseline and after, follow-tail, web A/B).
