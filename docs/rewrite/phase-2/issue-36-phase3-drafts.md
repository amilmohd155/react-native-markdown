# Issue #36 · Phase 3 fix drafts

**All four are drafts, not filed.** They follow from the measurements of the perf-hardening issue ([#36](../02-benchmarks.md#phase-1-carry-over-36-p1-25)): the CommonMark-only baseline, the `firstRender` profile and the Hermes parse profile, all on the S25 FE (Hermes release, 2026-11-06). The budgets they refer to are proposals ([P2-9](./decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion), draft). Web (Chrome 4×) figures are pending and are not used. Nothing here was filed with `gh`; milestone and labels are for the owner to set.

Order is by measured payoff, largest first. Each draft says what is measured, what is a hypothesis, and what must be measured first.

---

## Draft 1: Autolink `linkify` core rule dominates Hermes parse

**Status:** draft, not filed. **Priority:** top.

**Title:** `perf(parse): the autolinks linkify core rule is ~69% of F3 parse on Hermes`

**Body**

On the S25 FE (Hermes release), the `core:linkify` rule is about 69% of markdown-it's parse of F3 (218 of 317 ms in the instrumented run) and about 74% on F3-cm, a fixture with no links in it ([parse split](../02-benchmarks.md#c-parse-on-hermes-markdown-it-against-the-node-builder)). A second measurement agrees: on F3-cm, `parse` is 158.0 ms with the `gfm` preset and 41.4 ms with `commonmark`. `md.parse` is 177 ms on F3-cm and 178 ms on F3, although F3 has 2.2× the tokens, so the cost does not scale with content. [P1-1](../phase-1/decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps) estimated +18% from Node `--jitless`; Hermes pays far more.

`src/plugins/autolinks.ts` replaces markdown-it's core `linkify` rule with one that tests every text token (not the raw paragraph) with linkify-it's fuzzy matcher, so that `~~www.x.com~~` links. That per-token test is the likely cost. This is a hypothesis: no Hermes sampling profile has been taken, so it is not known whether the time is in `linkify.test`, `linkify.match`, regular expressions or token allocation.

Proposed work:

1. Take a Hermes sampling profile of `md.parse` on F3-cm (`gfm` preset) to confirm where the time goes inside the rule.
2. Cut the cost for text that cannot contain a link, without changing the output: for example a cheap character pre-check on each text token (no `.`, `:`, `/` or `@` means no fuzzy match), or one pre-test per inline block before any per-token work, keeping the `~~www` behaviour. Which of these is valid is for the profile to say.
3. Keep every autolink spec case that passes today (49 of 55 in `autolinkCases`, plus the GFM spec suite with its allowlist unchanged).

Out of scope: dropping fuzzy matching, or making autolinks opt-in. `preset: { base: 'gfm', exclude: ['autolinks'] }` already removes the cost for those who do not want it; documenting that stays an option.

**Acceptance**

- F3 `parse` on the S25 FE (bench tab "full", medians) falls by a margin the owner sets from the profile. Reference points: current 268.5 ms in the latest run (194.8 to 268.5 across three runs); lower bound if the rule cost fell to zero, about 84 ms.
- F3-cm `parse` with the `gfm` preset moves toward the `commonmark` preset's 41.4 ms (current 158.0 ms).
- Spec suites (CommonMark, GFM, autolink cases) pass with no new allowlist entries; `yarn lint`, `yarn typecheck`, `yarn test`, `yarn test:spec` and `yarn check:expo-go` pass.
- Results recorded in `docs/rewrite/02-benchmarks.md` with the device conditions (airplane mode, battery, temperature, no overlay), run twice on the same device in the same session.

---

## Draft 2: One `ScrollView` per code block

**Status:** draft, not filed.

**Title:** `perf(render): CodeBlock mounts a ScrollView per block (about 1.1 ms each on the S25 FE)`

**Body**

The `code` variant of F3 (70 fenced blocks, 17 KB) takes 77.5 ms to `firstRender` on the S25 FE: 1.1 ms per block ([profile](../02-benchmarks.md#b-where-firstrender-goes)). In Node the same 70 blocks mount in 4.0 ms (JIT) to 9.6 ms (`--jitless`) without layout, and the components' own render functions take 0.17 ms in total, so the time is in native view creation and layout, not in JavaScript. Each default `CodeBlock` ([`src/render/defaults/block.tsx`](../../src/render/defaults/block.tsx)) mounts a `View`, a horizontal `ScrollView` and a `Text`.

Not measured: how much of the 1.1 ms is the `ScrollView`. The per-block figure includes one mount's fixed cost, and no variant has plain `View`s to subtract.

Proposed work:

1. Measure first: the same 70 blocks with the `ScrollView` replaced by a `View`, to get the `ScrollView`'s share.
2. If the share is large, evaluate a cheaper structure that keeps horizontal scrolling for long lines (for example scroll only when a line exceeds the width, or a shared scroller), without changing the public `CodeBlock` props or the default theme's appearance.
3. Check the existing `CodeBlock` snapshots and accessibility behaviour; custom `components.CodeBlock` overrides must keep working unchanged.

**Acceptance**

- A recorded measurement of the `ScrollView`'s share of the `code` variant's `firstRender` (S25 FE, 15 runs, same method as the profile).
- If a change is made: the `code` variant's `firstRender` (77.5 ms now) falls by a margin the owner sets from step 1, and a code block with a long line still scrolls horizontally.
- No change to public types (`yarn check:public-types`); snapshots updated only where the structure changed on purpose.

---

## Draft 3: Table and list-item native view count, and the table measuring pass

**Status:** draft, not filed.

**Title:** `perf(render): tables are ~46% of F3 firstRender; reduce native views per table and list item, and the measuring re-render`

**Body**

Tables are the largest single cost: 34 tables (952 cells) cost 132.0 ms alone (3.9 ms per table) and about 46% of F3's `firstRender` (134.9 of 291.7 ms; 42% and 49% in Node `--jitless` and JIT). Lists are third: 68 blocks and 309 items, 102.3 ms (1.5 ms per block). Component self time is not the reason: `TableCell` is 2.09 ms for 952 calls (2.2 µs each) and `ListItem` 1.05 ms for 309 calls. That points to the number of native views and the layout they trigger. This is an inference: native views per element were not counted.

There is also work outside the timed window. Each `Table` measures its cells on first layout and re-renders in a `requestAnimationFrame` callback with fixed column widths; with a cold width cache all 34 tables did this after `firstRender` ended (`tableAfter` 34 of 34). The cost of that second pass is not measured, so the `firstRender` figures understate the time to a settled first mount.

Proposed work:

1. Count native views per table cell and per list item (the marker `View`, content `View` and `Text`; the nesting each cell adds), and measure the table measuring pass: time from mount to the last table re-render on a cold cache.
2. Evaluate fewer views per cell and per list item (for example `Text` as the cell, markers inside the item's `Text` where layout allows), and fixed or estimated column widths that avoid the second render for short tables. Each option must keep the default theme's layout and the flat table's structure ([P1-24](../phase-1/decisions.md#p1-24-keep-the-flat-table-render-ab-against-an-object-tree)).
3. A column-width cache per table content and theme already exists; check that the warm bench numbers do not hide first-open cost in a real app.

**Acceptance**

- Recorded: native view count per cell and per list item, and the measuring pass's duration on a cold cache.
- If a change is made: the `tables` and `lists` variants of the profile (132.0 and 102.3 ms now) fall by a margin the owner sets from step 1, F3 `firstRender` follows (291.7 ms in the profile, 323.3 ms in the Bench run), and the measured column widths and the list marker alignment are unchanged in the snapshots and a visual check.
- Table spec behaviour and the `tables.test.tsx` cases unchanged.

---

## Draft 4: One-edit budget (`reRenderOneBlock`)

**Status:** draft, not filed.

**Title:** `perf(render): reRenderOneBlock is 15.9 to 20.2 ms on F3; explain it and set a budget`

**Body**

Editing one block of F3 (554 blocks) costs 20.2 ms median on the S25 FE in the 2026-11-06 run (15.9 ms in M7; p90 27.0 ms), 6.2% of `firstRender`, inside the protocol's 10% bar and about 25× faster than v0.8.5. F3-cm is 18.0 ms (`commonmark` preset) and 17.8 ms (`gfm`), so it does not depend on content or preset. F2 (a much smaller document) takes 5.8 ms and F1 6.6 ms in the same run, so part of it is a fixed overhead per edit. The block comparison is small ([`isSameBlock`](../02-benchmarks.md#issameblock-comparator-s5-s25-fe) costs 0.43 ms for 862 blocks in a stream flush), so what the rest is spent on (reconciling the block list, the commit up to the layout effect that ends the timer) is not known. It matters for streaming and live editing, where every flush pays it.

Proposed work:

1. Profile one edit on the S25 FE (React profiler commit data and a Hermes sampling profile): what re-renders, what only reconciles, and what the commit costs.
2. Check that unchanged blocks do not re-render (render counts), and how the cost grows with block count (F1, F2 and F3 differ by 2 orders of magnitude in size), which separates a fixed overhead from a per-block one.
3. Fix what the profile shows, or record the cost as fixed.

**Acceptance**

- A written breakdown of the edit cost on the device, with the run-to-run spread (this metric was 15.9 ms and 20.2 ms in two runs).
- A budget stated as in [P2-9](./decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion) (proposed: median at most 25 ms on F3, S25 FE), confirmed or changed by the owner using that breakdown.
- If a change is made: the median falls by a margin the owner sets, and the memoization tests (`isSameBlock`, render counts) pass unchanged.
