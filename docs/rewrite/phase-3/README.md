# Phase 3 · Scale & polish

Implementation detail for Phase 3 ([07 · Phase 3](../07-roadmap.md#phase-3-scale--polish)). This folder says *how/when*; the design docs say *what*. If implementation changes the design, update the design doc first. Tasks and issue drafts live in GitHub issues, not here.

> **Status: in progress, resumed after [Phase 2b](../phase-2b/README.md)** ([P2b-1](../phase-2b/decisions.md#p2b-1-streaming-polish-is-phase-2b-scheduled-before-the-rest-of-phase-3)). Built: `scroll`, `virtualize`, `useMarkdownBlocks`, scroll control, the component slot, the image placeholder, the table width cache ([P3-37](./decisions.md#p3-37-table-width-cache-polish-no-blink-while-streaming-a-table-slice-key-a-render-time-cap)), dev warnings, the footnote jump, task toggling, the emoji, mentions and admonitions plugins, and `/highlight`. Left: the accessibility pass and the virtualization leftovers (release build, keyboard resize, Reanimated verification) ([virtualization.md](./virtualization.md#covered-by-tests-and-still-open)).

## Scope

- `scroll` and `virtualize` (`FlatList`), a headless block hook, scroll control and Reanimated integration. FlashList is user-side through the hook. Built: [virtualization.md](./virtualization.md).
- Image aspect-ratio cache and placeholder (built, polished), table column cache (`src/render/tableLayout.ts`, polished) ([P3-6](./decisions.md#p3-6-the-image-placeholder-ships-with-or-before-virtualize), [P3-37](./decisions.md#p3-37-table-width-cache-polish-no-blink-while-streaming-a-table-slice-key-a-render-time-cap), [P3-36](./decisions.md#p3-36-image-size-polish-explicit-sizes-a-hardened-cache-fade-in-and-a-retry), [image-cache.md](./image-cache.md)).
- `/highlight` entry point: built and verified; screen-reader, physical iPhone and release-build checks waived by name ([P3-29 to P3-34](./decisions.md#p3-29-hand-rolled-tokenizers-with-a-stateless-replaceable-contract), [plugins.md](./plugins.md#highlight)).
- Footnotes UI, task toggling, accessibility pass (includes #20). The footnote jump is built, in the containers and, through `onFootnoteScrollTo`, in your own list: [footnotes.md](./footnotes.md). Task toggling is built, library-owned with `onTaskToggle({ index, checked, text })`: [task-toggling.md](./task-toggling.md).
- Official plugins: emoji, mentions and admonitions are built, as subpath entries; `math` is deferred ([P3-21](./decisions.md#p3-21-official-plugins-emoji-mentions-admonitions-math-deferred)): [plugins.md](./plugins.md).

Not here: F5 `retainedHeap` and the profiling work, which belong to the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase) ([D9](../07-roadmap.md#decisions)); there is no `/mdast` entry point ([P1-20](../phase-1/decisions.md#p1-20-no-tomdast-mdast-interop-is-dropped)).

## Documents

| Document | Contents |
|---|---|
| [virtualization.md](./virtualization.md) | The scroll container, `virtualize`, the block hook and follow-tail |
| [footnotes.md](./footnotes.md) | The footnote jump (containers and `useMarkdownBlocks`) and the footnote section while streaming |
| [task-toggling.md](./task-toggling.md) | Library-owned task checkbox toggle, global index, override store and style |
| [plugins.md](./plugins.md) | Emoji, mentions, admonitions and highlight: packaging, options, streaming, what is deferred |
| [image-cache.md](./image-cache.md) | Image size cache and placeholder: explicit sizes, LRU, fade-in, retry (built) |
| [decisions.md](./decisions.md) | Decisions P3-1 onward |
