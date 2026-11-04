# Phase 1 · Work breakdown

**Tracking issue:** [#7 Phase 1 · Core (pure JS)](https://github.com/amilmohd155/react-native-markdown/issues/7). Each milestone below links to its own issue, which holds its status and checklist.

Milestones are listed in build order. Each one has its inputs, deliverables and a **done** check that can be verified. Milestones on the same row of the dependency graph can run in parallel.

## Dependency graph

```
M0 Groundwork
 ├─► M1 Parser & node table ──► M2 GFM plugins ─┐
 │                     └──────► M3 Renderer ─────┼─► M5 Public API ─► M6 Tests & platforms ─► M7 Benchmark & exit
 └─► M4 Theme ───────────────────────┘           │
                                                 └─ (M6 test harness work starts in M0 and grows with each milestone)
```

- M1 must come first, because the node table is the contract between parser and renderer.
- M3 needs M1's table, but not M2: GFM elements are added to the renderer as M2 lands.
- M4 is independent until M3 needs styles. It can start right after M0.

---

## M0 · Groundwork

**Issue:** [#8](https://github.com/amilmohd155/react-native-markdown/issues/8)

**Goal:** a clean v1 workspace where tests and benchmarks run from day one.

- Create the new `src/` layout ([03 · Package layout](../03-architecture.md#package-layout)) on a long-lived `v1` branch. v0.x keeps receiving fixes on `main`.
- TypeScript `strict`, `noUncheckedIndexedAccess`, and no `any` in public types (lint rule).
- Dependencies:
  - add `markdown-it` and `markdown-it-footnote`;
  - move `css-to-react-native` to the example app, its only user. `mdast-util-from-markdown` stays until M5, because the v0 code (still the public entry point, so CI and the example keep working) depends on it;
  - set peer dependencies to real ranges (`react >= 18`, `react-native >= 0.76`; final values chosen in [decisions](./decisions.md)).
- Vendor the spec fixtures with pinned versions ([testing-harness.md](./testing-harness.md#fixtures)).
- Move `docs/rewrite/bench` into a `bench/` workspace that can import `src/` (via `tsx`; see `bench/src-check.mjs`).
- CI skeleton: lint, typecheck, Jest, plus empty web and Expo Go check jobs ([testing-harness.md](./testing-harness.md#ci-jobs)).
- Gate releases on the repo's checks: a Verify step in the release workflow. `skipChecks` stays, because npm Trusted Publishing requires it ([P1-7](./decisions.md#p1-7-keep-release-it-skipchecks-gate-releases-in-the-release-workflow)).

**Done when:** CI is green on the empty skeleton, the spec runner loads all fixtures (and every example fails as "not implemented"), and `bench` runs against `src/`.

## M1 · Parser & node table

**Issue:** [#9](https://github.com/amilmohd155/react-native-markdown/issues/9)

**Goal:** `parse(source) → MarkdownDocument` for CommonMark, backed by the node table.

- `NodeTable` and `TableBuilder` (growable typed arrays, string table, sparse attrs) ([03 · Document model](../03-architecture.md#2-document-model)).
- `NodeType` enum and flag bits ([token-mapping.md](./token-mapping.md#node-types)).
- Token → table conversion for all CommonMark tokens ([token-mapping.md](./token-mapping.md)).
- Line-offset table, block index (`blocks`, `blockStart`, `blockEnd`, `blockContext`), block identity (`isSameBlock`, P1-9).
- Raw HTML safe subset: pairing `html_inline` tokens ([token-mapping.md](./token-mapping.md#raw-html-pairing)).
- `documentToHtml(doc)` serializer for tests ([testing-harness.md](./testing-harness.md#html-serializer)).
- Opaque `MarkdownDocument` handle, frozen in dev.

**Done when:**
- The CommonMark suite passes, apart from a reviewed allowlist.
- Converting the 97 KB fixture costs ≤ 15% of markdown-it's own parse time in Node `--jitless` (`bench/convert.mjs`, P1-10).
- Nested input like 10,000 `>` characters parses without a stack overflow.

## M2 · GFM plugins

**Issue:** [#10](https://github.com/amilmohd155/react-native-markdown/issues/10)

**Goal:** full GFM by default, implemented through the same plugin mechanism users get.

- Internal `definePlugin` with `syntax.markdownIt`, `nodes` and token registration. The public typing comes in M5.
- Built-in plugins:
  - `tables` (markdown-it core): mapping only.
  - `strikethrough`: in-house rule with cmark-gfm semantics (single `~`, same-length pairs), replacing markdown-it's ([P1-11](./decisions.md#p1-11-in-house-strikethrough-with-cmark-gfm-semantics)).
  - `taskLists`: an in-house core rule ([token-mapping.md](./token-mapping.md#task-lists)).
  - `autolinks`: linkify-it with fuzzy matching, plus the thin GFM wrapper (filter, reject, trim) from [P1-1](./decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps). Start by porting the prototype in [`bench/autolink.cjs`](../../../bench/autolink.cjs). Write custom matching only for a gap the spec or real transcripts prove matters.
  - `tagfilter`: in-house; records the filtered HTML as an attr instead of rewriting the text ([P1-13](./decisions.md#p1-13-tagfilter-records-filtered-html-instead-of-rewriting-the-text)).
  - `footnotes`: `markdown-it-footnote`, plus mapping ([token-mapping.md](./token-mapping.md#footnotes)).
- `preset: 'gfm' | 'commonmark' | { base, exclude }`.

**Done when:**
- The GFM suite passes (spec + extensions), apart from a reviewed allowlist.
- Excluding each plugin removes exactly its syntax, verified by tests.

## M3 · Renderer

**Issue:** [#11](https://github.com/amilmohd155/react-native-markdown/issues/11)

**Goal:** the document renders through default elements with the performance properties from [03](../03-architecture.md#3-rendering-layer).

- `BlockList` (plain `View`), `memo(Block)` comparing `ctx` and `isSameBlock` (P1-9).
- Inline flattener: merged text runs and one `<Text>` per block.
- Node → props mapping ([element-props.md](./element-props.md)).
- All default elements in [04 · Element catalog](../04-api.md#element-catalog), including the HTML-subset elements.
- Declared inline views ([03 · Inline views](../03-architecture.md#inline-views)) and the dev warning for undeclared Views.
- Image aspect-ratio cache (basic version; the phase 3 version adds the placeholder polish).
- Table rendering with column-width cache.

**Done when:**
- Snapshot tests exist for every element.
- The memo test passes: editing one block re-renders only that block.
- A user `memo` component bails out when its block is unchanged.

## M4 · Theme

**Issue:** [#12](https://github.com/amilmohd155/react-native-markdown/issues/12)

**Goal:** tokens produce element styles once, and components read them from context.

- `createTheme`, `lightTheme`, `darkTheme`, `'auto'`.
- Derivation and merge order ([theme-resolution.md](./theme-resolution.md)).
- Cache, `StyleSheet.create` once per resolved theme, `useMarkdownTheme()`.

**Done when:**
- Changing one token restyles every element that derives from it.
- Re-rendering with an equal (structurally same) theme object reuses the cached resolved theme (test with a spy on `StyleSheet.create`).

## M5 · Public API

**Issue:** [#13](https://github.com/amilmohd155/react-native-markdown/issues/13)

**Goal:** the API in [04](../04-api.md) is complete and type-safe.

- `<Markdown>` with every prop in [04](../04-api.md#markdown), with shallow per-key comparison for `components`, `plugins` and `theme`.
- `components` merge order: defaults → plugins → prop.
- The `defaults` export and the `inlineView()` helper.
- Public `definePlugin` typing, with plugin elements extending `ElementName`/`ElementProps`.
- `parse`, `<Markdown document>`, read-only `visit` (D7).
- Swap the package entry point to the v1 API, then remove the v0 sources and `mdast-util-from-markdown` (deferred from M0).
- Events: `onLinkPress` (returning `false` cancels, `openURL` errors caught), `onImagePress`, `onTaskToggle`, `onFootnotePress` (references and back-links, [P1-15](./decisions.md#p1-15-footnote-navigation-through-an-onfootnotepress-handler)).
- URL sanitization and the `images` policy ([decisions P1-3](./decisions.md#p1-3-url-sanitization-layers)).

**Done when:**
- The API-contract type tests pass.
- No internal type (`NodeTable`, markdown-it `Token`) is reachable from the public `.d.ts` (checked by a script).

## M6 · Tests & platforms

**Issue:** [#14](https://github.com/amilmohd155/react-native-markdown/issues/14)

**Goal:** the full test matrix from [06](../06-testing.md), green on all platforms.

- Behaviour, memoization, plugin, HTML subset and inline view tests.
- Web job (react-native-web + jsdom, plus a Playwright smoke test).
- Expo Go check (no native imports in the main entry graph). The example app migrates to the v1 API and runs in Expo Go.
- Perf CI job with stored baselines.

**Done when:** every job in [testing-harness.md · CI jobs](./testing-harness.md#ci-jobs) is green and required on the `v1` branch.

## M7 · Benchmark & exit review

**Issue:** [#15](https://github.com/amilmohd155/react-native-markdown/issues/15)

**Goal:** show the exit criteria are met on real devices.

- Run [benchmark-protocol.md](./benchmark-protocol.md) for v0.8.5 and v1.
- Measure the A/B for the flat table vs. object tree render cost (the remaining open item).
- Write the results into [`../02-benchmarks.md`](../02-benchmarks.md) as a "Device results" section.
- Exit review: check every exit criterion in [README](./README.md#exit-criteria). Record any waived item in [decisions.md](./decisions.md).

**Done when:** all exit criteria are checked or waived with a recorded reason.
