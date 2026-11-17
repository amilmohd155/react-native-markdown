# Phase 3 · Scale & polish

Implementation detail for Phase 3 ([07 · Phase 3](../07-roadmap.md#phase-3-scale--polish)). This folder says *how/when*; the design docs say *what*. If implementation changes the design, update the design doc first. Tasks and issue drafts live in GitHub issues, not here.

> **Status: in progress, paused for [Phase 2b](../phase-2b/README.md)** ([P2b-1](../phase-2b/decisions.md#p2b-1-streaming-polish-is-phase-2b-scheduled-before-the-rest-of-phase-3)); it resumes after, and re-runs the follow-tail device pass on a paced stream. Built: `scroll`, `virtualize`, `useMarkdownBlocks`, scroll control, the component slot, the image placeholder and dev warnings. Device checks and Reanimated verification are open ([virtualization.md](./virtualization.md#covered-by-tests-and-still-open)).

## Scope

- `scroll` and `virtualize` (`FlatList`), a headless block hook, scroll control and Reanimated integration. FlashList is user-side through the hook. Built: [virtualization.md](./virtualization.md).
- Image aspect-ratio cache and placeholder, table column cache. Basic versions exist (`src/render/imageSize.ts`, `src/render/tableLayout.ts`); this is the polish ([P3-6](./decisions.md#p3-6-the-image-placeholder-ships-with-or-before-virtualize)).
- `/highlight` entry point (lazy-loaded tokenizer).
- Footnotes UI, task toggling, accessibility pass (includes #20). Task toggling and `onFootnotePress` already exist.
- Official plugins (`math`, `mentions`, `emoji`).

Not here: F5 `retainedHeap` and the profiling work, which belong to the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase) ([D9](../07-roadmap.md#decisions)); there is no `/mdast` entry point ([P1-20](../phase-1/decisions.md#p1-20-no-tomdast-mdast-interop-is-dropped)).

## Documents

| Document | Contents |
|---|---|
| [virtualization.md](./virtualization.md) | The scroll container, `virtualize`, the block hook and follow-tail |
| [decisions.md](./decisions.md) | Decisions P3-1 onward |
