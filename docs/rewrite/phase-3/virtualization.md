# Phase 3 · Scroll container and virtualization

`scroll`, `virtualize`, the headless block hook, scroll control and the component slot, as built. Decisions: [P3-1 to P3-7](./decisions.md). Reference: [03 · BlockList](../03-architecture.md#blocklist) and [04 · Markdown](../04-api.md#markdown).

Use cases: long standalone documents, and long streamed answers (follow-tail). Chat apps with many short messages keep the default View, or use the hook to put blocks in their own list.

## Rendering

`BlockList` (`src/render/Block.tsx`) renders one memoized `<Block key={blockKey(i)} table index ctx>` per top-level block in a plain `View`. `Block` is memoized by `isSameBlock` ([P1-9](../phase-1/decisions.md)), so while streaming only the open tail re-renders. Handlers are read through a ref, so a stable `renderItem` is possible, and `selectable` is per block, so selection works in a list.

## Design

**Three modes ([P3-2](./decisions.md#p3-2-markdown-stays-a-view-scroll-and-virtualize-opt-in-to-a-scroll-container)).**

| Props | Root | Use |
|---|---|---|
| none (default) | `View` | Embedded in the host's scroller, chat messages, cards |
| `scroll` | `ScrollView`, all blocks mounted | Short to medium standalone documents, with a ref and `autoScroll` |
| `scroll` + `virtualize` (or `virtualize` alone) | `FlatList` | Long documents |

All three share one block pipeline: the same memoized `Block`, `keyExtractor` and render context.

**Hook ([P3-3](./decisions.md#p3-3-a-headless-block-hook-underneath-scroll-and-virtualize)).** `useMarkdownBlocks(options)` takes one object, the input and rendering props of `<Markdown>`, and returns `data`, `keyExtractor`, `renderItem` and `getItemType` for the user's own list (FlashList, LegendList, `Animated.FlatList`, a chat's list).

```tsx
<Markdown document={doc} scroll={{ autoScroll: true, ref }} />
<Markdown document={doc} virtualize={{ header, onScroll, autoScroll: true, ref }} />
<Markdown document={doc} scroll={{ component: Animated.ScrollView }} />   // stable component type

const { data, keyExtractor, renderItem, getItemType } = useMarkdownBlocks({ document: doc });
<FlashList data={data} keyExtractor={keyExtractor} renderItem={renderItem} getItemType={getItemType} />
```

`ref` is a `MarkdownListRef` (`scrollToEnd`, `scrollToOffset`, `scrollToBlock(index)`), and `componentRef` receives the scroll component's instance (Reanimated's `useAnimatedRef()`). Options are typed, not `FlatListProps` ([P3-4](./decisions.md#p3-4-scroll-and-virtualize-take-typed-options-with-a-stable-list-component-slot)).

**Rendering.** `renderItem` returns `<Block table index ctx>`, so the existing memo applies. `keyExtractor` returns `blockKey(i)`, so identity stays stable while streaming. Off-screen blocks cost only their table rows ([03](../03-architecture.md#benefits-for-streaming-and-virtualization)). On `FlatList`, off-window blocks unmount and remount from the retained table, and the URL-keyed image cache and block-keyed table width cache (`imageSize.ts`, `tableLayout.ts`) make a remount read its size synchronously. A remount does lose what lives only in the component: the horizontal scroll offset of a code block or table, and any state in a user's `components` override. Users who need it kept store it outside the component, as the two caches do.

**`FlatList` re-render rule.** `FlatList` only re-renders cells when `data`, `extraData` or `renderItem` changes, and the streaming tail changes inside the same table. So `data` is a new array per flush, and unchanged blocks keep their items.

**Defaults.** `initialNumToRender` 10, `windowSize` 11, `removeClippedSubviews` off (RN's docs warn of missing content, and [#58910](https://github.com/facebook/react-native/issues/58910) is a 0.88 regression with it), and an `onScrollToIndexFailed` that retries (`scrollToBlock` on an unmeasured block is approximate).

**Follow-tail ([P3-5](./decisions.md#p3-5-follow-tail-implemented-in-the-library-the-same-on-scrollview-and-flatlist)).** `autoScroll` in the options of the owned container; the hook has none, the user's list follows the tail itself.

- A document starts pinned to the end. Content growth or a viewport resize while pinned does one non-animated `scrollToEnd`.
- Nothing scrolls while the user drags or flings; a pinned view catches up when the fling ends. An upward move (a drag, a fling, a mouse wheel, your own `scrollTo`) pauses it; falling behind because content grew does not. Coming back within `threshold` (default 40 px) or `ref.scrollToEnd()` resumes it.
- A handler that is not a plain function (`Animated.event` on the native driver, a Reanimated handler) is passed through untouched. Position is then read at the end of each drag and fling only. For the scroll offset, use `componentRef` with an animated ref.

A built-in footnote jump ([P1-15](../phase-1/decisions.md#p1-15-footnote-navigation-through-an-onfootnotepress-handler) option 2) is possible now that we own the scroll view, but is not built.

**Nesting.** `scroll` and `virtualize` own a vertical scroll view. Inside another vertical scroller they get unbounded height: nothing virtualizes, and follow-tail and the ref do nothing useful. Give them a bounded height, or use the default `View` in your own scroller, or the hook.

**Warnings ([P3-7](./decisions.md#p3-7-dev-warnings-for-the-owned-scroll-container)).** Development only, once per mounted `<Markdown>`, prefixed `[react-native-markdown]`:

- `scroll` as tall as its content while that is taller than the window, which a bounded container never is. A layout heuristic: a nested scroller with short content, or one whose container happens to match its content, is not caught. `virtualize` is not checked: React Native warns about a `FlatList` inside a `ScrollView` itself.
- `component` whose type changed on three renders in a row (one created during render).
- `ref`, `componentRef` or `autoScroll` in use, but `component` never gave the scroll view a ref.

**Other lists.** Not dependencies; users plug them in through the hook.

- LegendList is the first recommendation for streamed content: no recycling by default, and `maintainScrollAtEnd` follows the tail.
- FlashList: pass `getItemType` and memoized rows, and reset per-block state with `useRecyclingState` or set `maxItemsInRecyclePool={0}`. Follow the tail with `maintainVisibleContentPosition.autoscrollToBottomThreshold`.

## Covered by tests, and still open

- **Streaming tail and remount:** covered by tests (the open block updates, earlier blocks don't remount, scroll position stays; caches serve a remount with no second measuring pass).
- **Checked on an Android device (S25 FE) and an iOS simulator, dev builds:** follow, pause on drag and resume in both containers, and long `scrollToBlock` / `scrollToEnd` jumps on a fresh list ([P3-5](./decisions.md#p3-5-follow-tail-implemented-in-the-library-the-same-on-scrollview-and-flatlist)).
- **Known:** a table that is still streaming remounts and re-measures on every flush, and blinks for those frames (seen on the iOS simulator in `scroll`). It is the Phase 1 table keying, not the containers.
- **Still open, needs a device:** the keyboard resize while pinned, a release build, blank areas on fast scrolls over mixed-height blocks (Android release build, 1,000 and 5,000 blocks: the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase)), and the web path of the owned container (D1).
- **Reanimated:** `Animated.ScrollView`, `Animated.FlatList`, `useScrollOffset` with `componentRef`, and a Reanimated `onScroll` next to `autoScroll` are typed and unit-tested with stand-ins only. Not verified on a device.
