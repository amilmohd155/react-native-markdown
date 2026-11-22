# Phase 3a · API refinement

Implementation detail for Phase 3a ([07 · Phase 3a](../07-roadmap.md#phase-3a-api-refinement-between-phase-3-and-phase-4)). This folder says *how/when*; the design docs say *what*. If implementation changes the design, update the design doc first. Tasks and issue drafts live in GitHub issues, not here.

> **Status: done** (M0-M5). Started after Phase 3 ([P3a-1](./decisions.md#p3a-1-api-refinement-is-phase-3a-between-phase-3-and-phase-4)). v1 is unreleased, so breaking the Phase 1 theme API costs nothing outside this branch.

Phases 1 to 3 built the features. This phase makes the public API easy to learn before v1.0 freezes it. First item: the theme, which has three input shapes (a string, a tweak object, a `createTheme` result), two layers (tokens and `elements.*` with `container`/`text` slots) and three override paths (`theme.elements`, plugin themes, `components`). Prompted by a comparison with enriched-markdown's flat `markdownStyle` ([source](https://docs.swmansion.com/enriched-markdown/react-native/api-reference/style-properties)).

## Scope

| Item | Decision |
|---|---|
| Flat per-element `theme`, typed prop whitelist per element, tokens internal, `dark`/`light` blocks, `createTheme(input)` kept without `base` | [P3a-2](./decisions.md#p3a-2-flat-per-element-theme-tokens-become-internal) |
| Inline sizes relative to the parent, `fontScale` for sub and superscript | [P3a-3](./decisions.md#p3a-3-inline-sizes-are-relative-to-the-parent) |
| Heading scale, points `lineHeight`, `syntax` names, `link.variants` (replaces `mention`) | [P3a-4](./decisions.md#p3a-4-theme-details-settled-in-the-whitelist), [P3a-6](./decisions.md#p3a-6-linkvariants-merge-per-pattern-prop-by-prop-object-order-first-match-wins) |
| Drawn task checkbox with border, checkmark and radius props | [P3a-5](./decisions.md#p3a-5-the-checkbox-is-a-drawn-box) |

Target shape: [04 · Theme](../04-api.md#theme).

Not here: new elements or plugins, streaming changes, performance tuning (the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase), [D9](../07-roadmap.md#decisions)).

## Order (done)

Whitelist table ([theme-props.md](./theme-props.md)); resolver and types (flat merge, tokens internal); relative inline sizes; plugin keys under `theme`, `elements` and public tokens removed; example app, docs ([04](../04-api.md#theme), [08](../08-model-and-api.md)), the [migration guide](../../migration-from-v0.md).

## Exit criteria

- [x] **One shape:** `theme` is `'auto' | 'light' | 'dark'` or one flat object; `elements`, `container`/`text` and public tokens are gone from `src/api/index.ts`, and `createTheme` takes one flat input (no `base`).
- [x] **Whitelist is typed and documented:** a prop an element doesn't accept is a type error; one table in [04](../04-api.md#theme) lists them.
- [x] **Tests:** per-scheme merge (`dark`/`light` over top-level keys), `auto` switching, plugin element keys, inline inheritance inside headings, blockquotes and list items, `fontScale`, default code colour follows the scheme.
- [x] **Cost holds:** theme resolve and `reRenderOneBlock` stay inside the F3 budgets; equal theme values still reuse the cached result. Caveat: the device run was Expo Go (production bundle), not a standalone release build, so `check:budgets` flags `reRenderOneBlock` (about 2.2x slower in Expo Go). Against the pre-3a tree measured the same way there is no regression: 41.7 ms vs 42.3 / 41.6 ms at 55ca455. `resolveTheme` on a 7-key flat input 0.24-0.26 ms, cache hit about 0.65 us. A release-build re-measure is deferred to the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase) ([D9](../07-roadmap.md#decisions)). [REPORT](../../../bench/results/REPORT.md#phase-3a-flat-theme-device-run).
- [x] **Nothing else regresses:** `yarn check:expo-go`, `yarn check:public-types` after a build, `npx fallow dead-code` at 0, lint, typecheck, unit and spec tests (all passed on the final tree).

## Documents

| Document | Contents |
|---|---|
| [decisions.md](./decisions.md) | Decisions P3a-1 onward |
| [theme-props.md](./theme-props.md) | The prop whitelist per theme key, where each current token goes, open items |
