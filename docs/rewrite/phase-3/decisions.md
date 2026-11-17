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
