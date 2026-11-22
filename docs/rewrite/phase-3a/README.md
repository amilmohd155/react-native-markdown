# Phase 3a · API refinement

Implementation detail for Phase 3a ([07 · Phase 3a](../07-roadmap.md#phase-3a-api-refinement-between-phase-3-and-phase-4)). This folder says *how/when*; the design docs say *what*. If implementation changes the design, update the design doc first. Tasks and issue drafts live in GitHub issues, not here.

> **Status: planned.** Starts when Phase 3 is done ([P3a-1](./decisions.md#p3a-1-api-refinement-is-phase-3a-between-phase-3-and-phase-4)). v1 is unreleased, so breaking the Phase 1 theme API costs nothing outside this branch.

Phases 1 to 3 built the features. This phase makes the public API easy to learn before v1.0 freezes it. First item: the theme, which has three input shapes (a string, a tweak object, a `createTheme` result), two layers (tokens and `elements.*` with `container`/`text` slots) and three override paths (`theme.elements`, plugin themes, `components`). Prompted by a comparison with enriched-markdown's flat `markdownStyle` ([source](https://docs.swmansion.com/enriched-markdown/react-native/api-reference/style-properties)).

## Scope

| Item | Decision |
|---|---|
| Flat per-element `theme`, typed prop whitelist per element, tokens internal, `dark`/`light` blocks, `createTheme(input)` kept without `base` | [P3a-2](./decisions.md#p3a-2-flat-per-element-theme-tokens-become-internal) |
| Inline sizes relative to the parent, `fontScale` for sub and superscript | [P3a-3](./decisions.md#p3a-3-inline-sizes-are-relative-to-the-parent) |
| Heading scale, points `lineHeight`, `syntax` names, `link.variants` (replaces `mention`) | [P3a-4](./decisions.md#p3a-4-theme-details-settled-in-the-whitelist) |

Target shape:

```tsx
<Markdown
  theme={{
    paragraph: { fontSize: 20 },
    link: { color: '#2563EB' },
    codeBlock: { backgroundColor: '#F3F4F6', color: '#111827', borderRadius: 12, padding: 16 },
    dark: { link: { color: '#60A5FA' }, codeBlock: { backgroundColor: '#1F2937', color: '#F3F4F6' } },
  }}
/>
```

Not here: new elements or plugins, streaming changes, performance tuning (the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase), [D9](../07-roadmap.md#decisions)).

## Order

1. Finish the per-element whitelist table, drafted in [theme-props.md](./theme-props.md) (every element in `ElementName`, including `CodeBlockHeader` from [P3-35](../phase-3/decisions.md#p3-35-code-block-header-line-numbers-and-wrap-in-pure-js), and every plugin element: which props, which go to the container and which to the text; the structural `codeBlockGutter` stays derived from `codeBlock`). Start from the slots in `src/theme/types.ts` and the tokens in [04 · Theme](../04-api.md#theme); each current token or slot must map to a prop or be dropped by name.
2. Resolver: accept the flat shape, merge top-level keys onto the built-in theme of the active scheme, then the `dark`/`light` block; keep tokens internal to `lightTheme`/`darkTheme`. Types enforce the whitelist.
3. P3a-3: relative inline sizes and `fontScale`.
4. Move plugin element styles under `theme`; remove `elements`, `container`/`text` and the public tokens from the public exports; keep `createTheme(input)` as a typed identity helper without `base`; decide what `useMarkdownTheme()` returns.
5. Example app (Playground), docs ([04](../04-api.md#theme), [08](../08-model-and-api.md)), the [migration guide](../../migration-from-v0.md) and the exit checks below.

## Exit criteria

- [ ] **One shape:** `theme` is `'auto' | 'light' | 'dark'` or one flat object; `elements`, `container`/`text` and public tokens are gone from `src/api/index.ts`, and `createTheme` takes one flat input (no `base`).
- [ ] **Whitelist is typed and documented:** a prop an element doesn't accept is a type error; one table in [04](../04-api.md#theme) lists them.
- [ ] **Tests:** per-scheme merge (`dark`/`light` over top-level keys), `auto` switching, plugin element keys, inline inheritance inside headings, blockquotes and list items, `fontScale`, default code colour follows the scheme.
- [ ] **Cost holds:** theme resolve and `reRenderOneBlock` stay inside the F3 budgets (`yarn workspace @docren/react-native-markdown-bench check:budgets <bench-result.json>`); equal theme values still reuse the cached result.
- [ ] **Nothing else regresses:** `yarn check:expo-go`, `yarn check:public-types` after a build, `npx fallow dead-code` at 0, lint, typecheck, unit and spec tests.

## Documents

| Document | Contents |
|---|---|
| [decisions.md](./decisions.md) | Decisions P3a-1 onward |
| [theme-props.md](./theme-props.md) | The prop whitelist per theme key, where each current token goes, open items |
