# Phase 3 · Footnotes UI

The built-in footnote jump in the owned scroll container. **Built**, device check open. Decisions: [P3-8 to P3-14](./decisions.md). Builds on [P1-15](../phase-1/decisions.md#p1-15-footnote-navigation-through-an-onfootnotepress-handler) (the `onFootnotePress` handler) and on [scroll control](./virtualization.md#design). Reference: [04 · Markdown](../04-api.md#markdown).

## What exists

- `markdown-it-footnote` with inline footnotes off, in the `gfm` preset by default (D4). A reference with no definition stays literal text. A definition nobody references is dropped. Several references to one label share one definition (`subId`, `references`).
- Definitions are always collected in one synthetic `FootnoteSection`, the last top-level block, numbered by first reference. A reference can sit inside a table cell, list item or quote, so its top-level block is not the block that starts with it.
- `onFootnotePress(label, info)`, `info = { index, direction, reference }`. `'definition'`: a reference was pressed. `'reference'`: a back-link was pressed. Without the handler, references and back-links are plain text.

The renderer cannot scroll a host's scroller, which is why P1-15 stopped at the handler. In `scroll` and `virtualize` we own the scroller and `scrollToBlock` exists, so the jump can be built in.

## Design

**Where ([P3-8](./decisions.md#p3-8-built-in-footnote-jump-in-the-owned-containers)).** `scroll` and `virtualize` only. The default `View` keeps the handler-only behaviour. In an owned container the jump is on by default and a container option turns it off.

**Your own list ([P3-14](./decisions.md#p3-14-usemarkdownblocks-takes-onfootnotescrollto-for-the-apps-own-list)).** `useMarkdownBlocks` takes `onFootnoteScrollTo(index, label, info)`: the same flow and targets as the containers, but the app scrolls. The hook registers the jump against the latest table, so `source`, a `parse()` document and a stream all work, and nothing is pressable while a stream runs. `index` is also the position in `data`.

**Press flow ([P3-9](./decisions.md#p3-9-onfootnotepress-runs-first-and-can-skip-the-jump)).**

1. The press calls `onFootnotePress` if there is one, as today.
2. If it returned `false`, stop. Otherwise run the jump.
3. The jump is `scrollToBlock(target, { animated: true, viewPosition: 0 })`.

**Targets ([P3-10](./decisions.md#p3-10-the-jump-lands-on-the-footnote-section-back-links-use-a-lazy-lookup)).**

| Press | `direction` | Target block |
|---|---|---|
| Reference `[n]` | `'definition'` | The footnote section, always the last block |
| Back-link `↩`, `↩²` | `'reference'` | The top-level block holding that label's Nth reference |

The section is the unit, not the single definition: a definition's offset inside the section is not stored. The Nth-reference block comes from a lookup over the node table (`src/render/footnoteTargets.ts`), built on the first back-link press and cached per table in a `WeakMap`. A table is immutable and every flush makes a new one, so nothing else invalidates it, there is no per-flush cost and no new node attribute.

**While streaming ([P3-12](./decisions.md#p3-12-the-footnote-section-and-its-links-wait-for-done)).** A stream shows no footnote section and no footnote links until `done()`. A reference whose definition has not arrived is literal text (`[^1]`) anyway, and definitions usually come last, so this removes a half-built footer that is rebuilt every flush. While streaming, references are inert: no link role, no `onFootnotePress`, no jump. `done()` shows the section and turns the links on; `reset()` hides them again. "Streaming" is `streamInfoOf(document)` (P2b-6) being set and not `ended`. The skip is in `useMarkdownPipeline`, which serves `<Markdown>`, the containers and `useMarkdownBlocks`: it hands them a table view one block shorter (a shallow copy of the table, kept per document), so the block loops, the fade count, `scrollControl.configure` and the list `data` all see the shorter count. It adds no prop and no option.

The parse is unchanged: a definition in the tail still triggers the full re-parse of [P2-3](../phase-2/decisions.md). Skipping it is optimization-pass work. An app that never calls `done()` never shows footnotes (`onStreamingEnd` is the hook for it). The section is not faded in when it appears at `done()`.

**Measuring.** In `scroll` mode, blocks are measured only when a `ref` is passed. The jump is active only for a document that has footnotes and is not streaming; then the container measures blocks the same way, so it costs one wrapper `View` per block. Documents without footnotes pay nothing. A stream therefore switches to measured blocks once, at `done()`, which remounts its blocks one time. `virtualize` already uses `scrollToIndex`. A jump to a block that is not laid out yet is approximate, as for `scrollToBlock`.

**Accessibility ([P3-11](./decisions.md#p3-11-footnote-labels-for-references-and-back-links)).** References get a label like "Footnote 1" and back-links "Back to reference 1" (and "Back to reference 1 (2)" for the second back-link), with the role `link`. The strings come from `footnotes.labels`, `{ reference(index), backLink(index, reference) }`, English by default. Pass module-level functions: they are part of `ctx` identity.

**Back-links ([P3-13](./decisions.md#p3-13-footnote-back-links-are-inline-nodes-at-the-end-of-the-definition)).** They are inline `FootnoteBackLink` nodes the converter puts at the end of the definition's last paragraph, one per reference, after a space (added at render, not in the text). A definition that ends in a list, quote, code or table gets a paragraph of only back-links instead, on its own line. `footnotes.backLinkMark(reference, total)` sets their text; the default is `↩`, `↩²`, `↩³`. The element has its own theme entry, link colour by default. Without a handler they are plain text and hidden from accessibility.

**Dev warnings ([P3-7](./decisions.md#p3-7-dev-warnings-for-the-owned-scroll-container)).** The jump alone never triggers the missing-ref warning. A `component` that drops `ref` leaves the jump doing nothing. The rest of the accessibility pass, including #20, is a separate item.

## API

```tsx
<Markdown document={doc} scroll={{ ref, jumpToFootnotes: false }} />          // opt out
<Markdown document={doc} virtualize={{ ref }} onFootnotePress={(label, info) => info.reference > 1 ? false : undefined} />
<Markdown document={doc} scroll footnotes={{ labels }} />   // labels: module level, { reference: n => ..., backLink: (n, r) => ... }
<Markdown document={doc} scroll footnotes={{ backLinkMark }} />  // module level: (reference, total) => '↑'
useMarkdownBlocks({ document: doc, onFootnoteScrollTo: (index, label, info) => list.scrollToIndex({ index }) })
```

`onFootnotePress` becomes `void | false`. A handler that returns nothing keeps today's meaning, plus the jump in an owned container.

## Exact definition and highlight (P3-15)

`footnotes={{ target: 'definition', highlight }}`, both off by default ([P3-15](./decisions.md#p3-15-opt-in-exact-definition-jump-and-highlight)). Definitions report their y from the top of the footnote block (the section's top margin included) to a per-instance store; the pipeline builds one stable config from `target` and `highlight` (none while a stream runs, and the store is cleared then).

- `onFootnotePress(label, info, { offset })` and `onFootnoteScrollTo(index, label, info, { offset })`: `offset` is that y, for a reference press with `target: 'definition'` once measured, else `undefined`. `index` stays the section block.
- `scroll`: scrolls to the section offset plus `offset`. `virtualize`: lands on the section with the usual retries, then scrolls again by `offset` when it arrives (waits at most 5 s; a new press cancels it).
- `useMarkdownBlocks`: when `offset` is `undefined` at the press (the section is not mounted in a long list), `onFootnoteScrollTo` is called again with it once measured (at most 5 s later; a new press cancels it), so the callback must be safe to run twice. Checked on a device: the first press lands on the definition. The default `View` has no re-call: `onFootnotePress` runs once.
- `highlight`: a reference press flashes the definition, a back-link press the reference. `false` from `onFootnotePress` and `jumpToFootnotes: false` skip the flash too. A flash plays once, even if its element remounts.

## Deferred

Not built, and not scheduled in a phase. Pick them up as new features, or drop them.

- **A popover or inline preview** of the definition on press (a feature of its own: layout, streaming cost, accessibility).
- **A jump in the default `View` mode**, where the host owns scrolling (use `onFootnotePress`), and an exported pure lookup helper ([P3-14](./decisions.md#p3-14-usemarkdownblocks-takes-onfootnotescrollto-for-the-apps-own-list)).
- **Skipping the definition re-parse while streaming.** Performance only, so it waits for the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase) ([D9](../07-roadmap.md#decisions)).

## Open

- Device check: the Hook mode of the Lists tab (FlatList with `onFootnoteScrollTo` and the `onScrollToIndexFailed` retry). FlashList and LegendList should measure unmeasured items themselves; unverified.
- Device check: a far, unmeasured section in `virtualize` (the `scrollToBlock` retries should cover it), and the one-time remount of a `scroll` stream's blocks at `done()`. The Lists tab of the example app has the case.
- A jump pauses follow-tail on a list (`scrollToBlock`, [P3-5](./decisions.md#p3-5-follow-tail-implemented-in-the-library-the-same-on-scrollview-and-flatlist)); check that this feels right.
