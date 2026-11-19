# Phase 3 · Implementation decisions

Numbered `P3-n`. Design-level decisions (`D1`–`D9`) live in the [roadmap decision log](../07-roadmap.md#decisions); earlier phases are in [phase-1](../phase-1/decisions.md) and [phase-2](../phase-2/decisions.md). A decision that changes the design must update the design doc it affects.

Each entry is short on purpose: **what we chose and why**. Measurements go in [`bench/results/REPORT.md`](../../../bench/results/REPORT.md), not here.

**Status:** `Proposed`, `Accepted`, `Superseded by P3-n`. Entry format: `Status · Date`, `Decision`, `Why`.

---

## P3-1: New Architecture only

Accepted · 2026-11-06 (reaffirmed 2026-11-15)

- **Decision:** v1 supports the New Architecture only: `react-native >= 0.82`. Expo SDK 54 (RN 0.81) is dropped, so Expo Go users need SDK 55 or later.
- **Why:** RN 0.82 is the first release that runs entirely on the New Architecture, so the peer range enforces it with no runtime check, and there is one configuration to test. v1 already relies on Fabric text behavior for nested `Text` and inline views ([P1 decisions](../phase-1/decisions.md)). Expo Go supports only the New Architecture from SDK 55 ([Expo docs](https://docs.expo.dev/guides/new-architecture.md)). FlashList v2 also requires it, but the library no longer depends on FlashList (P3-2).
- Supersedes the `>= 0.76` floor in Phase 1. Applied: `package.json` peer range, README, Phase 1 pointers. `check:expo-go` states no floor, so it is unchanged.

## P3-2: `<Markdown>` stays a View; `scroll` and `virtualize` opt in to a scroll container

Accepted · 2026-11-15 (replaces an earlier draft that made FlashList an optional peer)

- **Decision:**
  - Default: `<Markdown>` renders a plain `View` of blocks, as today. The host app owns scrolling.
  - `scroll`: `<Markdown>` renders its own `ScrollView`, all blocks mounted.
  - `scroll` plus `virtualize`: the `ScrollView` is replaced by a `FlatList`. `virtualize` alone implies `scroll`.
  - The library has **no FlashList dependency**, optional or otherwise. FlashList is for users, through the hook (P3-3).
- **Why:**
  - A default scroll container breaks the common cases: a chat list would nest one vertical scroller per message, with gesture conflicts against our horizontal code and table scrollers; Reanimated scroll handlers need the user's own scroll component. Every use in the repo today is inside the host's scroller.
  - Owning the container is still worth offering: `scrollToBlock`, `scrollToEnd`, follow-tail and a built-in footnote jump all need it.
  - `FlatList` is zero-dependency, works in Expo Go and on web, and does not recycle cells, so stateful blocks are safe. FlashList v2 is JS-only and ships in Expo Go, so Expo Go is no longer the objection; it always recycles cells, a peer would tie us to its major versions, and its autoscroll-on-resize bug ([#1903](https://github.com/Shopify/flash-list/issues/1903)) and several web bugs are open (checked 2026-11-15).
  - No custom windowing in a `ScrollView`: that is what RN's `unstable_VirtualView` is becoming. It is experimental and has no web path; revisit when it is stable.
  - `react-native-marked` is a precedent for an owned `FlatList` plus a headless hook.
- Supersedes the FlashList-with-fallback text in [03 · BlockList](../03-architecture.md#blocklist).

## P3-3: A headless block hook underneath `scroll` and `virtualize`

Accepted · 2026-11-06

- **Decision:** a hook (working name `useMarkdownBlocks`) returns `{ data, keyExtractor, renderItem, getItemType }` for the user's own `FlashList`, `FlatList` or Reanimated list. `scroll` and `virtualize` are built on it.
- **Why:** users drive scroll-based animation with Reanimated and need the scroll view and its handlers directly, and a chat app can flatten a message's blocks into its own list instead of nesting lists. Prop forwarding would freeze one list library's API into ours.
- As built (2026-11-16): `useMarkdownBlocks(options)` takes one object shaped like `<Markdown>`'s props, so `source` works as well as `document`. Items are opaque (`{ index, key }`) and carry their own table and render context, so no provider wraps the list and one list can mix blocks from several documents. `data` gets a new identity per flush and reuses the items of the stream's stable prefix; there is no `extraData`. `getItemType` returns the element name (`Heading`, `Paragraph`, `Table`, a plugin node's name).
- `getItemType` is a FlashList hint and a no-op on `FlatList`. FlashList recycles cells, so per-block state must reset with `useRecyclingState`, or the pool is turned off with `maxItemsInRecyclePool={0}` ([FlashList recycling](https://shopify.github.io/flash-list/docs/recycling)). The docs recommend LegendList first for streamed content: recycling is off by default and `maintainScrollAtEnd` reacts to item layout.

## P3-4: `scroll` and `virtualize` take typed options, with a stable list-component slot

Accepted · 2026-11-15

- **Decision:**
  - `scroll?: boolean | ScrollOptions` and `virtualize?: boolean | VirtualizeOptions`, typed subsets (header and footer, content container style, scroll callback, `autoScroll`, a ref). A discriminated union keeps View-only and list-only props apart. The exact subsets are settled while building.
  - A slot for the user's scroll or list component, such as `Animated.ScrollView` or `Animated.FlatList` for Reanimated. It is a component type resolved once per render, and it must be stable (not an inline component).
  - Anything else goes through the hook (P3-3).
- **Why:** `FlatListProps` or `FlashListProps` would tie our public type to a list library's major versions, the same objection that rejected mdast-shaped nodes ([08](../08-model-and-api.md)). The slot adds no per-block cost: the per-item path stays in the memoized `Block`.
- As built (2026-11-16): `ScrollOptions` is `header`, `footer`, `style`, `contentContainerStyle`, `onScroll`, `scrollEventThrottle`, `component`; `VirtualizeOptions` adds `initialNumToRender` (default 10) and `windowSize` (default 11) and takes a list `component`. `removeClippedSubviews` is fixed off. With both props set, options merge field by field and `virtualize` wins; `scroll.component` next to `virtualize` is a type error. The slots are typed over our own props types (`MarkdownScrollComponentProps`, `MarkdownListComponentProps`). No prop is View-only yet, so the union has two branches.
- Updates the `scroll` and `virtualize` rows in [04-api.md](../04-api.md#markdown).

## P3-5: Follow-tail implemented in the library, the same on `ScrollView` and `FlatList`

Accepted · 2026-11-16

- **Decision:** the owned container tracks whether the user is at the bottom (`onScroll`), calls a non-animated `scrollToEnd` from `onContentSizeChange` while they are, pauses on drag and resumes on return. Exposed as `autoScroll?: boolean | { threshold: number }` (pixels), plus a ref with `scrollToEnd`, `scrollToBlock` and `scrollToOffset`. The hook (P3-3) has no follow-tail: the user's list does it.
- **Why:**
  - RN's `ScrollView` has a `maintainVisibleContentPosition` prop, but it only has `autoscrollToTopThreshold` and cannot follow the tail. The callback pattern works on both containers.
  - A second scroll writer on a list that already pins itself makes the view rubber-band while streaming ([assistant-ui](https://www.assistant-ui.com/docs/guides/virtualization)), so hook users take the list's own feature: LegendList `maintainScrollAtEnd`, FlashList `maintainVisibleContentPosition.autoscrollToBottomThreshold`.
  - Non-animated, because an animated scroll overlaps the next token's growth.
- As built (2026-11-16): `ref` (a `MarkdownListRef`) and `autoScroll` live in the options only; there is no top-level `ref` on `<Markdown>`. The scroll view itself is reached through a forwarded `componentRef`, because Reanimated's animated ref must be attached as the component's `ref`. A document starts pinned; the default threshold is 40 px. A scroll event within the threshold of the end pins; only an upward move with no content shrink unpins, which is how the user is told apart from our own `scrollToEnd` and from content growing under a fling. Nothing scrolls during a drag or fling, and a pinned view catches up when the fling ends. `scrollToOffset` and `scrollToBlock` pause following and `scrollToEnd` resumes it. A non-function `onScroll` (`Animated.event`, a worklet) is passed through untouched, and position is then judged at drag and fling end only.
- `scrollToBlock`: in `scroll` mode each block is wrapped in a measuring `View` only when a `ref` is passed; in `virtualize` mode it is `scrollToIndex`, falling back to an estimated offset and retries 100 ms apart for as long as the list measures further blocks (it stops after 3 in a row with no progress). On a list, `scrollToEnd` takes the same path to the last block first, and a drag or `scrollToOffset` cancels pending retries.
- Device pass (S25 FE, Expo Go dev build, 2026-11-16): follow, pause on drag and resume work in both containers. It found that a fixed 3 retries stalled part-way through a 480-block jump, and that the native `scrollToEnd` of a fresh list stops short because a list only knows the size of what it has measured; both are fixed as above.
- iOS simulator pass (iPhone 18 Pro, iOS 27.2, 2026-11-17): jumps, follow, pause, overscroll and a fling up from the end work in both containers. It found that a fling back to the end during a stream left following paused (8 of 9 runs), because content grew while the fling slowed down; fixed by the unpin rule above (10 of 10 after).
- Still to confirm: a release build, the keyboard resize, and Reanimated's ref and handler shapes (Reanimated is not a dependency).

## P3-6: The image placeholder ships with or before `virtualize`

Accepted · 2026-11-16

- **Decision:** the image placeholder (known or fallback aspect ratio until `Image.getSize` returns) lands in the same milestone as `virtualize`, or before it.
- **Why:** images and tables that change size after mounting shift scroll position and measured heights in a windowed list.
- As built: a block image reserves a full-width box at the theme token `imageRatio` (default 16:9) until its size is known; a cached size is used on the first render. Inline images keep their line-height square, and a failed lookup still collapses to alt text. The node table has no image width or height, so there is no explicit-dimensions source.

## P3-7: Dev warnings for the owned scroll container

Accepted · 2026-11-16

- **Decision:** in development only, once per mounted `<Markdown>`, warn when `scroll` is as tall as its content above the window height (nested in a vertical scroller), when `component` changes type on three renders in a row, and when `ref`, `componentRef` or `autoScroll` is in use but `component` gave the scroll view no ref.
- **Why:** each fails silently: nothing virtualizes, every block remounts, or the ref and follow-tail do nothing. The nested check is a layout heuristic on public API (`onLayout`, `onContentSizeChange`, `Dimensions`): it has no false positives for a bounded container, but misses short content, and it is `scroll` only, since React Native warns about a `FlatList` in a `ScrollView`. In dev, `scroll` always passes `onLayout` and `onContentSizeChange`; production passes none.
- Rule: [virtualization.md](./virtualization.md#design). Code: `src/api/devWarnings.ts`.

## P3-8: Built-in footnote jump in the owned containers

Accepted · 2026-11-18

- **Decision:** in `scroll` and `virtualize`, pressing a footnote reference or back-link scrolls to its target by default. A container option (`jumpToFootnotes: false`) turns it off. The default `View` keeps the handler-only behaviour of P1-15.
- **Why:** a reference that does nothing in a container we own would look broken, and `scrollToBlock` already exists. In the default `View` the host owns the scroller, so there is nothing to scroll. A popover is a separate feature with its own layout and streaming cost, and is not built.
- Consequence: `scroll` measures blocks (one wrapper `View` each) while the jump is active, as it does when a `ref` is passed. It is active only for a document that has footnotes and is not streaming, so other documents pay nothing; a stream switches at `done()`.
- Design: [footnotes.md](./footnotes.md#design). Builds on [P1-15](../phase-1/decisions.md#p1-15-footnote-navigation-through-an-onfootnotepress-handler) and [P3-5](#p3-5-follow-tail-implemented-in-the-library-the-same-on-scrollview-and-flatlist).

## P3-9: `onFootnotePress` runs first and can skip the jump

Accepted · 2026-11-18

- **Decision:** the handler is called first. If it returns `false`, the built-in jump does not run. Any other return value, including none, lets it run. The type becomes `void | false`. The jump animates and puts the target at the top.
- **Why:** it is backward compatible, because existing handlers return nothing. Apps that want custom behaviour (a sheet, analytics only) can skip the jump per press without losing the rest of the feature. With "a handler replaces the jump", analytics-only handlers would silently switch it off.
- While a stream is running, references are inert and the handler is not called ([P3-12](#p3-12-the-footnote-section-and-its-links-wait-for-done)).

## P3-10: The jump lands on the footnote section; back-links use a lazy lookup

Accepted · 2026-11-18

- **Decision:** a reference scrolls to the footnote section (the last top-level block). A back-link scrolls to the top-level block holding that label's Nth reference, found by a lookup over the node table built on first use and cached per table. A table is immutable and every stream flush makes a new one, so table identity is the whole cache key.
- **Why:** a single definition's offset inside the section is not stored, and measuring each one costs layout work. The footer is within a screen or two of the definition. Storing a block index on every reference node would add per-flush work that grows with the document, which the streaming design forbids ([P2-3](../phase-2/decisions.md)). References inside tables, lists and quotes still resolve to their top-level block.
- Follow-up: scrolling to the definition itself, and a highlight after the jump, are [P3-15](#p3-15-opt-in-exact-definition-jump-and-highlight).

## P3-11: Footnote labels for references and back-links

Accepted · 2026-11-18

- **Decision:** references get an accessibility label such as "Footnote 1" and back-links "Back to reference 1", both with the role `link`. The strings come from `footnotes.labels` (`reference(index)`, `backLink(index, reference)`), English by default.
- **Why:** today they have a role but no label, and the jump makes them the main way to use footnotes with a screen reader. Overridable strings cover translation without a localisation dependency. The rest of the accessibility pass, including #20, stays its own item.

## P3-12: The footnote section and its links wait for `done()`

Accepted · 2026-11-18

- **Decision:** while a `useMarkdownStream` stream is running, the footnote section is not rendered and footnote references are inert (no link role, no `onFootnotePress`, no jump). `done()` shows the section and turns the links on; `reset()` starts a new live stream and hides them again. There is no option to show them live. The hiding is a one-block-shorter view of the table made in `useMarkdownPipeline`, driven by the existing `StreamInfo.ended` flag ([P2b-6](../phase-2b/decisions.md)), not a change to the parse and not a new prop.
- **Why:** a reference whose definition has not arrived is literal text, and definitions usually end the document, so during a stream there is nothing useful to press and the footer is a block rebuilt every flush. Showing it once, at the end, is stable and cheaper to render. The same split already exists for `smoothing`, which is view-only until `done()`.
- Cost: an app that never calls `done()` never shows footnotes; the docs say so. The re-parse a definition triggers ([P2-3](../phase-2/decisions.md)) stays; avoiding it is optimization-pass work (D9).
- Design: [footnotes.md](./footnotes.md#design). Refines [P3-8](#p3-8-built-in-footnote-jump-in-the-owned-containers) and [P3-9](#p3-9-onfootnotepress-runs-first-and-can-skip-the-jump).

## P3-13: Footnote back-links are inline nodes at the end of the definition

Accepted · 2026-11-18

- **Decision:** each `footnote_anchor` becomes a `FootnoteBackLink` inline node (id 47; attrs `label`, `index`, `subId`) at the end of the definition's last paragraph. A definition that does not end in a paragraph gets a paragraph holding only the back-links, so they sit on their own line. The renderer puts a space before each link but the first of such a paragraph; the space is not in the document, so `text` stays as written. The element is `FootnoteBackLink` (`label`, `index`, `reference`, `total`) with its own theme entry (link colour). Its text comes from a new `footnotes.backLinkMark(reference, total)` option, default `↩`, then `↩²`, `↩³`.
- **Why:** the old marks were a separate `Text` under the content, a new line the definition's text style could not reach. A node in the AST is the one way every consumer (renderer, `visit`, custom `FootnoteDefinition` and `Paragraph`, HTML output) sees the same inline links, and it is what GitHub's HTML has. The text option covers a glyph that some Android fonts draw small, without replacing the definition renderer.
- Cost: one node per reference, built in the tail re-parse that a definition already causes ([P2-3](../phase-2/decisions.md)). A definition whose only content is an image now renders that image inline, since the paragraph holds the back-link too.
- Design: [footnotes.md](./footnotes.md#design). Refines [P1-15](../phase-1/decisions.md#p1-15-footnote-navigation-through-an-onfootnotepress-handler) and [P3-11](#p3-11-footnote-labels-for-references-and-back-links).

## P3-14: `useMarkdownBlocks` takes `onFootnoteScrollTo` for the app's own list

Accepted · 2026-11-18

- **Decision:** `useMarkdownBlocks` takes `onFootnoteScrollTo(index, label, info)`. A press follows the [P3-9](#p3-9-onfootnotepress-runs-first-and-can-skip-the-jump) flow: `onFootnotePress` first, `false` skips, then the callback gets the block to scroll to (the section for a reference, the reference's block for a back-link). `index` is the block index, which is also the position in `data`. Setting it makes the links pressable; without it they are as before. It is an option of the hook only, not of `<Markdown>`.
- **Why:** the app owns the scroller, so it must scroll, but the target lookup needs the private node table, and a hook is the one place that has the table that was rendered (no stale table while streaming, and `source` works). A callback keeps the P3-9 flow identical to the containers. While a stream runs nothing is pressable ([P3-12](#p3-12-the-footnote-section-and-its-links-wait-for-done)), so the callback never sees a table without its section.
- Rejected: an exported pure helper `footnoteTarget(document, label, info)` (needs the private table, has no answer for `source`, and needs a streaming guard because the full table has a section that `data` omits); a `resolveFootnote` returned by the hook (circular: the handler is an input of the call that returns it).
- The app also handles a list that has not measured the target: a FlatList without `getItemLayout` needs `onScrollToIndexFailed`. When one list shows several documents, `index` is the block index and not the list index: add your own offset.
- Design: [footnotes.md](./footnotes.md#design). Refines [P3-8](#p3-8-built-in-footnote-jump-in-the-owned-containers) and [P3-9](#p3-9-onfootnotepress-runs-first-and-can-skip-the-jump).

## P3-15: Opt-in exact-definition jump and highlight

Accepted · 2026-11-18

- **Decision:** `footnotes={{ target: 'definition', highlight }}` makes a reference press scroll to its own definition and flash it, and a back-link press flash the reference it returns to. `target` is `'section'` (default, [P3-10](#p3-10-the-jump-lands-on-the-footnote-section-back-links-use-a-lazy-lookup)) or `'definition'`. `highlight` is `true` or `{ color, duration }`, with the colour also a theme entry. Both are off by default.
- **Offset:** each definition reports its y from the top of the footnote block (the section's top margin included) to a per-document registry that lives outside `ctx`. `scroll` scrolls to the section plus that y. `virtualize` lands on the section with the existing `scrollToBlock` retries, then refines once the definition is mounted. `onFootnoteScrollTo` and `onFootnotePress` get an extra `{ offset }` argument, relative to the section block and `undefined` until measured, so the default `View` and the app's own list can add it to their own block position.
- **Highlight:** the default `FootnoteDefinition` and the reference subscribe to a small external store keyed by label, so a change re-renders only the target. It fades a background colour with RN `Animated` (JS driver), keeping the main entry pure JS ([D2](../07-roadmap.md#decisions)). Reduce-motion swaps the fade for a static highlight. After the scroll settles, screen-reader focus moves to the target (`AccessibilityInfo.sendAccessibilityEvent`). A flash plays once: the first element to claim it animates, so a definition that unmounts and mounts again in a virtualized list does not replay it. `reset()` clears the store.
- **Why:** the section is one block, so landing on it can leave the definition off screen in a long footer, and a jump with no sign of where it landed is easy to lose. No RN markdown library does this, and the web gets it from `:target`. Built in beats a user override: the measurement needs the container's scroll control, which a custom `FootnoteDefinition` cannot reach.
- **Rejected:** highlight state in `ctx` or `components` (a new identity re-renders every block); highlight through `data` (defeats unchanged-item reuse in `blockItems.tsx`); Reanimated (an optional dependency the core cannot require); a `/footnote-highlight` entry point or a `useFootnoteTarget` hook (the scroll control would have to be exposed, and every app would redo the measuring).
- **Cost:** one wrapper `View` with `onLayout` per definition, mounted only when `target: 'definition'` is set and the document is not streaming ([P3-12](#p3-12-the-footnote-section-and-its-links-wait-for-done)). Documents with no footnotes pay nothing.
- **Own list:** `offset` is `undefined` at the press when the section is not mounted yet, so `useMarkdownBlocks` calls `onFootnoteScrollTo` again with `{ offset }` once it is measured (5 s at most; a new press cancels). The app's callback must be safe to run twice. The default `View` has no re-call. Seen working on a device (Android, FlatList); 2 s was too short there.
- **Open (device):** Android is checked: FlatList (`virtualize` and the hook), and a `scroll` stream after `done()` (links turn on, the first flash on a definition and a reference works). Not yet: iOS, FlashList and LegendList (they may need the app's retry, as in [P3-14](#p3-14-usemarkdownblocks-takes-onfootnotescrollto-for-the-apps-own-list)), the screen-reader focus move, and the flash on a `virtualize` stream.
- Design: [footnotes.md](./footnotes.md#design). Builds on [P3-8](#p3-8-built-in-footnote-jump-in-the-owned-containers) to [P3-14](#p3-14-usemarkdownblocks-takes-onfootnotescrollto-for-the-apps-own-list).

## P3-16: Library-owned task toggle with an `{ index, checked, text }` payload

Accepted · 2026-11-19

- **Decision:** the library owns the toggle and the strikethrough. The app gets `onTaskToggle({ index, checked, text })`, replacing `(checked, { index })` (`src/api/pipeline.ts`, `TaskToggleInfo` in `src/render/context.ts`). `text` is the item's own content as plain text with inline formatting flattened and nested sub-lists excluded.
- **Why:** enriched-markdown shows that library-owned is simpler for apps: no source edit just to see the box flip. The object payload also leaves room to grow. This replaces the earlier uncontrolled, handler-only choice. Breaking, accepted before 1.0 on `v1`.
- **Built:** the item also gets `taskIndex` and `text` slot props; the per-list `index` is unchanged.
- Design: [task-toggling.md](./task-toggling.md#design).

## P3-17: Global task index from lazy per-block prefix sums

Accepted · 2026-11-19

- **Decision:** `index` is global, 0-based, in document order (depth-first inside a block). `buildItems` (`src/render/blockItems.tsx`) derives it lazily from per-block task counts as prefix sums.
- **Why:** an app maps `index` to its own source, and a per-list index is ambiguous across lists. Putting it in `blockContext` would make `isSameBlock` invalidate every later block when a task is added above. Doing it at convert or splice time adds parse cost for a render-only need.
- **Built:** the global index also covers blockquote and footnote definition bodies; `scroll` and `virtualize` pass each block's base from `blockTaskCount`.
- Design: [task-toggling.md](./task-toggling.md#design).

## P3-18: Interactive by default with `enableTaskListItemToggle`, inert while streaming

Accepted · 2026-11-19

- **Decision:** boxes toggle by default. `enableTaskListItemToggle` (boolean, default `true`) on `<Markdown>` and `useMarkdownBlocks`; `false` means read-only, no callback, no visual toggle. While a stream runs the boxes are inert (`accessibilityState.disabled`) until the end signal.
- **Why:** library-owned state ([P3-16](#p3-16-library-owned-task-toggle-with-an-index-checked-text-payload)) makes interactive the useful default, and an opt-out keeps display-only uses simple. Mid-stream the item set and indexes still move, so a toggle could hit the wrong task; enriched-markdown resets toggles on the next update, disabling is cleaner.
- **Built:** `useMarkdownBlocks` takes the same option and is inert until `done()`.
- Design: [task-toggling.md](./task-toggling.md#design).

## P3-19: Per-`<Markdown>` override store keyed by global index

Accepted · 2026-11-19

- **Decision:** a map `index -> checked` in the render context. It is cleared on any source change: the `source` string for `<Markdown>`; the stream's `prefixId` for streams and `useMarkdownBlocks` (not `document` identity, which changes every flush).
- **Why:** state in the row would be lost when a virtualized row unmounts. Keying by the global index ([P3-17](#p3-17-global-task-index-from-lazy-per-block-prefix-sums)) needs no per-item id. Resetting on source change means an app that persists by editing its source gets the new truth, not stale overrides.
- **Built:** the reset key is `source`, else the stream's `prefixId`, else the document's text (a re-parse of the same text keeps the overrides). `done()` and `reset()` give a new `prefixId`, but no override can exist while inert. Preset and plugin changes do not reset.
- Design: [task-toggling.md](./task-toggling.md#design).

## P3-20: Built-in checked style, `theme.checkbox`, and a touch target and label

Accepted · 2026-11-19

- **Decision:** checked items get line-through and a dim, the same for items checked in the source and by tap. `theme.checkbox` takes `color`, `checkedColor`, `size` and a checked-text style (override or disable). The checkbox has a touch target of at least 44pt (or `hitSlop`) and an `accessibilityLabel` from the item text, overridable through the `ListItem` slot.
- **Why:** a toggle with no visible result is unfinished, and today the box has no label and a tiny target. The rest of the accessibility pass, including #20, stays its own item.
- **Deferred:** no `toggleTask(source, info)` helper and no controlled `checked` or `initialChecked` prop; persistence is the app's job.
- **Built:** the touch target is a `hitSlop`: measured box 10.7 x 19.6dp (Android, 420dpi), so the slop is asymmetric, right = floor(marker column - glyph) = 9dp (the item content, a later sibling, covers the rest) and left = 25dp into the gutter, total width at least 44 and vertical `min(ceil((44 - h) / 2), floor(gap / 2))` with `gap` the space between items (0 tight, 12 loose by default). 44pt tall is not reachable in a tight list without overlapping the next row. `checkedText` merges onto line-through and dim, or `false` turns it off. A nested List resets the inherited checked text style. Inside a checked item a Link's underline replaces the line-through. A custom `ListItem` gets the displayed state and a toggle from the `useTaskState` hook (props stay plain values, `checked` stays the source value).
- Design: [task-toggling.md](./task-toggling.md#design).

## P3-21: Official plugins: emoji, mentions, admonitions; math deferred

Accepted · 2026-11-19

- **Decision:** Phase 3 ships `emoji`, `mentions` and `admonitions`, built in that order. Each is opt-in: in no preset, listed apart from `gfm`. `math` is deferred: it needs a renderer decision (no verified maintained pure-JS React Native option; WebView plus KaTeX cannot sit on the text baseline) and a plugin incomplete-tail streaming hook ([P3-26](#p3-26-no-plugin-incomplete-tail-streaming-hook-yet)).
- **Why:** the roadmap listed math, mentions and emoji; admonitions was only in `04-api.md`. Math is the riskiest and nothing else depends on it.
- Design: [plugins.md](./plugins.md#emoji), [mentions](./plugins.md#mentions), [admonitions](./plugins.md#admonitions).

## P3-22: Plugins are subpath entries of one package, pure JS

Accepted · 2026-11-19

- **Decision:** `@docren/react-native-markdown/emoji`, `/mentions`, `/admonitions`, as `package.json` `exports` keys `./emoji` etc. (same form for `/highlight` later). Every plugin entry stays pure JS and Expo Go safe, extending D2 from the main entry to plugin entries. `scripts/check-no-native.mjs` and `scripts/check-public-types.mjs` iterate over all `exports` subpaths instead of one entry, and `.fallowrc.json` is checked so new `src/<plugin>/` entries are not reported unused.
- **Why:** the tree-shaking intent of `04-api.md`; bob already compiles all of `src/`; one package keeps Release-it and CI as they are.
- Design: [plugins.md](./plugins.md#packaging).

## P3-23: Emoji is parse-time text substitution with a pluggable resolver

Accepted · 2026-11-19

- **Decision:** `:name:` becomes the Unicode character during parse; no node, no component. `emoji({ resolve?: (name) => string | undefined, map?: Record<string, string>, defaults?: boolean })`: a `map` is wrapped into a resolver; the user resolver is consulted first, then a small curated default table (about 50 names); `defaults: false` disables it. Unknown names stay text, which also keeps `10:30:00` and `http://` untouched. The resolver is sync and pure and must not enter the parse-context string (`src/parse/markdownItBackend.ts` context).
- **Why:** any library plugs in with a one-liner; a node per emoji costs an inline node while streaming; the size of the full gemoji set is unverified.
- Design: [plugins.md](./plugins.md#emoji).

## P3-24: Mentions are scheme links converted to a Mention node

Accepted · 2026-11-19 · Amended 2026-11-19

- **Decision:** following [enriched-markdown](https://docs.swmansion.com/enriched-markdown/rich-text-formatting/mentions), a mention is an ordinary link with a custom scheme, `[@Alice](user://alice)`. `mentions({ schemes: ['user', 'channel'] })` converts matching `[text](scheme://rest)` links (scheme case-insensitive) to an inline `Mention` node `{ scheme, id, label, url }`; `label` is the flattened link text, `id` the percent-decoded part after `scheme://`; `user:alice`, autolinks, bare URLs and links whose label is empty or contains an image are not converted (they stay links, so an image still renders); the id keeps any `?query#hash`. There is no bare `@handle` parsing, so email, code and trailing-punctuation boundaries and a streaming raw-then-jump flicker do not arise. Style: one `Mention` theme element falling back to `Link`; per-scheme styling is left to `components.Mention` (which receives `scheme`) and later to P3-28 `linkVariants`; `components.Mention` slot (may be an inlineView); a replacement component presses through `useMentionPress()` (exported from `/mentions`), the same path as the default, because it receives no handler prop. Press: `onMentionPress({ scheme, id, url, label })`, returns void; when set it replaces (does not chain to) `onLinkPress`, which gets the raw URL when it is unset.
- **Why:** reuses link parsing and streaming; degrades to a normal link in other renderers. Link variants alone (enriched-markdown's only mechanism) were rejected: no node, no component slot, no typed press ([P3-28](#p3-28-themelinkvariants-styles-links-by-scheme-in-core)).
- Design: [plugins.md](./plugins.md#mentions).

## P3-25: Admonitions are GitHub alerts, an opt-in non-GFM plugin

Accepted · 2026-11-19

- **Decision:** syntax is `> [!NOTE]` (also TIP, IMPORTANT, WARNING, CAUTION). It is not part of CommonMark or the GFM spec (a GitHub.com feature) and works under the `'commonmark'` preset because it is a blockquote. One block container `Admonition` node `{ kind }`; an unknown kind stays a plain blockquote. Container fences (`::: note`) are not supported now. Titles come from an option map `admonitions({ titles: { note: 'Note', ... } })` with English defaults; no per-instance titles. Style: `theme.admonition` per kind and a `components.Admonition` slot; the default look is an accent bar, tinted background and text title, no icon assets (pure JS). Any block content is allowed inside. The container gets an accessibility role and a label prefixed with the title; final wording is settled in the accessibility pass.
- **Why:** degrades to a normal blockquote elsewhere; reuses the blockquote absorb logic in the stream.
- **Built:** the marker must be alone on its line, case-insensitive, at any depth, and a bare marker is an empty alert. A core rule after `block` retypes the matching open and close (found by level) to `admonition_*`; the converter needed no change. The node is `{ kind, title }`: the title is stored (so a replacement component gets it) and set as `contextKey`. Theme: `elements.Admonition` plus theme-only `AdmonitionNote`, `AdmonitionTip`, `AdmonitionImportant`, `AdmonitionWarning`, `AdmonitionCaution` (plugin elements are override-only, so a per-kind key needs its own element name); built-in accents are light or dark by the text color. The container is `accessibilityRole="summary"` with the title as label, not `accessible`.
- Design: [plugins.md](./plugins.md#admonitions).

## P3-26: No plugin incomplete-tail streaming hook yet

Accepted · 2026-11-19

- **Decision:** `hideIncomplete` (`src/stream/smoothing.ts`) knows only CommonMark and GFM delimiters and is not given the plugins. Emoji `:smi` shows raw until the closing colon, and `> [!NO` shows as a blockquote (the unclosed `[` is hidden, the rest shows: `!NO`) until `]`; both then swap, a minor visible jump. A `streaming.incompleteTail` hook is deferred and is a prerequisite for `math` ([P3-21](#p3-21-official-plugins-emoji-mentions-admonitions-math-deferred)). Also, `absorbs()` in `createMarkdownStream.ts` does not know plugin block rules, so a plugin container block spanning blank lines is unsupported (admonitions are blockquotes and unaffected).
- **Why:** the hook touches the Phase 2 stream core and none of the three plugins needs it.
- Design: [plugins.md](./plugins.md#streaming).

## P3-27: Plugins are tested with unit fixtures, outside the spec runner

Accepted · 2026-11-19

- **Decision:** per plugin, parse-level fixtures plus one render test; the CommonMark/GFM spec runner is untouched. Emoji: `10:30:00`, `http://`, unknown names, user resolver. Mentions: scheme match, non-matching scheme stays a link, code spans, email text. Admonitions: five kinds, nested content, plain-blockquote fallback, under the `'commonmark'` preset. Device checks follow the other Phase 3 items.
- **Why:** plugin syntax is outside the vendored spec files, which must not be edited by hand.
- Design: [plugins.md](./plugins.md#packaging).

## P3-28: `theme.linkVariants` styles links by scheme, in core

Proposed · 2026-11-19

- **Decision:** a core theme token `linkVariants`, a map from URL scheme (`mailto`, `tel`, `user`) to a link style, falling back to the `Link` element style; the key type (scheme map vs also a `(url) => style` function) is open until review. Style only: no node, no new press API. Mentions ([P3-24](#p3-24-mentions-are-scheme-links-converted-to-a-mention-node)) do not depend on it and ship first; later the chain is the `Mention` element, then `linkVariants[scheme]`, then `Link`.
- **Why:** it also styles `mailto:`, `tel:` and deep links, which no plugin covers, and it is cheap. enriched-markdown keys by regex, where first match wins and order matters; a scheme map is deterministic.
- Needs a public-types check (`check:public-types`). Issue: #65.
