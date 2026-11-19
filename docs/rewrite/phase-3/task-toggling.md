# Phase 3 · Task toggling

Tapping a GFM task checkbox, owned by the library. Built. Decisions: [P3-16 to P3-20](./decisions.md). Replaces the handler-only toggle of [P1](../phase-1/decisions.md) (`onTaskToggle(checked, { index })`). Reference: [04 · Markdown](../04-api.md#markdown).

## What exists

- Built as designed below: `ListItem` renders the box (`src/render/defaults/block.tsx`), the override store is `src/render/taskStore.ts`, the global index and text are in `src/render/tasks.ts`.
- Prior art: enriched-markdown's `onTaskListItemPress({ index, checked, text })` and `enableTaskListItemToggle`; the index is global, 0-based, in document order.

## Design

**Ownership ([P3-16](./decisions.md#p3-16-library-owned-task-toggle-with-an-index-checked-text-payload)).** The library flips the box and strikes the text. The app gets `onTaskToggle({ index, checked, text })` and persists if it wants. `text` is the item's own content as plain text, formatting flattened, nested sub-lists excluded (they are their own tasks).

**Index ([P3-17](./decisions.md#p3-17-global-task-index-from-lazy-per-block-prefix-sums)).** Global, 0-based, document order, depth-first inside a block. Per-block task counts become prefix sums in `buildItems` (`src/render/blockItems.tsx`), computed lazily. Not in `blockContext` (`isSameBlock` would invalidate every later block) and not at convert or splice time.

**Interactive by default ([P3-18](./decisions.md#p3-18-interactive-by-default-with-enabletasklistitemtoggle-inert-while-streaming)).** `enableTaskListItemToggle` (default `true`) on `<Markdown>` and `useMarkdownBlocks`. `false`: read-only, no callback, no visual toggle. While a stream runs the boxes are inert (`accessibilityState.disabled`) until the end signal.

**State ([P3-19](./decisions.md#p3-19-per-markdown-override-store-keyed-by-global-index)).** A per-`<Markdown>` map `index -> checked` in the render context, so it survives a virtualized row unmounting. Cleared when the source changes: the `source` string for `<Markdown>`; the stream's `prefixId` for streams and `useMarkdownBlocks`; a pre-parsed `document` without one, its text (so a re-parse of the same text keeps the ticks), never `document` identity (new every flush). Persistence is the app's job: it edits its source, which resets the overrides.

**Look and a11y ([P3-20](./decisions.md#p3-20-built-in-checked-style-themecheckbox-and-a-touch-target-and-label)).** Checked items get line-through and a dim, whether checked in the source or by tap. `theme.checkbox`: `color`, `checkedColor`, `size`, checked-text style (override or disable). A touch target at least 44pt wide, and as tall as the gap between items allows (tight lists: the line height, so rows never overlap) and an `accessibilityLabel` from the item text. The `ListItem` slot can still replace all of it: its `checked` is the source value, so it calls `useTaskState(taskIndex, checked, text)` for the displayed state and a `toggle`.

## API

```tsx
<Markdown source={md} onTaskToggle={({ index, checked, text }) => save(index, checked)} />
<Markdown source={md} enableTaskListItemToggle={false} />   // read-only
<Markdown source={md} theme={{ checkbox: { checkedColor, size: 22 } }} />
useMarkdownBlocks({ source, onTaskToggle, enableTaskListItemToggle })
```

`onTaskToggle` is breaking against `(checked, { index })`; fine before 1.0 on `v1`.

## Deferred

- **A `toggleTask(source, info)` helper** that rewrites the source string.
- **A controlled `checked` or `initialChecked` prop.** The optimistic or controlled model is rejected; library-owned is simpler for apps.
- The rest of the accessibility pass (with #20).

## Open

- Device checks left: iOS (alignment, hit area), VoiceOver and TalkBack, the cursor in a web browser (web shares `ListItem`, no `.web` file), the asymmetric hit slop re-tapped on Android. Android (S25 FE, Expo Go) passed: alignment, tight/loose/nested overlap, inert while streaming.
- Seen once on Android: a checked item whose text starts with a bold run lost the line-through on the plain run after the options switch was cycled. The JS tree is identical before and after; probably an RN Android text-span quirk, not reproduced since.
- Enriched-markdown's docs say toggles reset on the next stream update (we disable the boxes instead); their ownership semantics are inferred, not confirmed.

Tested: global index across `virtualize`, `scroll`, `useMarkdownBlocks`, blockquotes and footnote definitions; reset on source change; inert while streaming. GFM tables cannot hold task markers.
