# Phase 3a · Implementation decisions

Numbered `P3a-n`. Design-level decisions (`D1`–`D9`) live in the [roadmap decision log](../07-roadmap.md#decisions); earlier phases are in [phase-1](../phase-1/decisions.md), [phase-2](../phase-2/decisions.md), [phase-2b](../phase-2b/decisions.md) and [phase-3](../phase-3/decisions.md). A decision that changes the design must update the design doc it affects.

Each entry is short on purpose: **what we chose and why**. Measurements go in [`bench/results/REPORT.md`](../../../bench/results/REPORT.md), not here.

**Status:** `Proposed`, `Accepted`, `Superseded by P3a-n`. Entry format: `Status · Date`, `Decision`, `Why`, optional `Consequences`.

---

## P3a-1: API refinement is Phase 3a, between Phase 3 and Phase 4

Accepted · 2026-11-22

- **Decision:** a new phase, **3a**, so the Phase 4 number stays stable. It starts when Phase 3 is done and runs before the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase). Scope: [README](./README.md).
- **Why:** the theme API grew by milestones (P1-16 to P1-18, P3-33) and is hard to learn. v1 is unreleased, so this is the last free chance to break it. The optimization pass runs after it, so performance work is measured against the final API.

## P3a-2: Flat per-element theme; tokens become internal

Accepted · 2026-11-22

- **Decision:** `theme` is `'auto' | 'light' | 'dark'` or one flat object keyed by element (`paragraph`, `h1`–`h6`, `link`, `codeBlock`, …) with plain style props, e.g. `codeBlock: { backgroundColor, borderRadius, padding }`. Public tokens (`colors`, `fontSize`, `radius`, `fonts`, `listBullets`, …), the `container`/`text` slots and `elements.*` leave the public API; `lightTheme` and `darkTheme` keep using tokens internally. `createTheme(input)` stays as a typed identity helper for the flat shape; its `base` argument goes, so a theme always merges onto the built-in theme of the active scheme (pin a scheme with `scheme="light"` or put values under `light: {…}`). Passing a plain object stays valid. Per-scheme values go in `theme={{ …, dark: {…} }}` (and `light`): top-level keys apply to both schemes, the matching block is merged over them, and both merge onto the built-in theme of the active scheme. Plugin element styles are keys of the same object.
- **Why:** three input shapes, two layers and three override paths are hard to learn; a flat, CSS-like shape is one concept. Each element accepts a typed whitelist of props, so the library knows which go to the container and which to the text, and users never see the split. Block text props (`fontSize`, `fontFamily`, `fontWeight`, `color`, `lineHeight`, margins) are shared; the rest are element-specific, as in enriched-markdown's [property reference](https://docs.swmansion.com/enriched-markdown/react-native/api-reference/style-properties#property-reference). Inline elements inherit from their block (already so: nested `<Text>`).
- **Why keep `createTheme`:** a bare object defined outside JSX gets no whitelist checking without an annotation; `createTheme` gives that, makes "define once, hoist" the obvious pattern, and lets a package ship a theme as a value. Composition is a spread: `createTheme({ ...brand, link: {…} })`.
- **Code block (P3-35):** `CodeBlockHeader` becomes a flat key, `codeBlockHeader`, in the whitelist. The line-number gutter (`codeBlockGutter`) is structural and derives from `codeBlock` text, so `fontFamily`, `fontSize` and `lineHeight` set on `codeBlock` keep reaching it; it gets no public key unless the whitelist work finds a need. The `codeBlock={{ header, lineNumbers, wrap }}` prop and `onCopyPress` are behaviour, not style, and are unchanged.
- **Consequences:** the default `codeBlock.color` must follow the scheme, so overriding `backgroundColor` alone can't make code invisible. Plugin element names must not clash with core keys or with `dark`/`light`. Admonition styles nest under `blockquote.admonitions.<kind>` (`color`, `backgroundColor`), so a callout inherits its geometry from `blockquote` and the plugin adds no top-level keys. Props with no RN style name (`bulletColor`, `itemSpacing`, `fontScale`, syntax colours) get their own names. The whitelist table comes first ([README](./README.md#order)); the [04](../04-api.md#theme) Theme section, [08](../08-model-and-api.md) and the migration guide change with it. Supersedes the theme API of P1-16 to P1-18 where they conflict (font faces and the resolve cache remain, internally).

## P3a-3: Inline sizes are relative to the parent

Accepted · 2026-11-22

- **Decision:** an inline element's `fontSize` defaults to the parent's size (1em); a number sets an absolute size in points. `InlineCode` and `Kbd` stop multiplying the base by 0.9. `superscript` and `subscript` take a unitless `fontScale` (a fraction of the surrounding size) instead of a fixed 0.75.
- **Why:** `InlineCode` and `Kbd` use an absolute `base * 0.9` and `Superscript`/`Subscript` use `base * 0.75` (`src/theme/resolve.ts`), so inside a heading they shrink to body size instead of following it. enriched-markdown does the same: inline `code.fontSize` defaults to the parent's size and a number is absolute.

## P3a-4: Theme details settled in the whitelist

Accepted · 2026-11-22

- **Decision:** the [whitelist](./theme-props.md) settles six points. Heading sizes scale from `paragraph.fontSize` by an internal ratio unless a heading sets its own. `lineHeight` is in points. `footnoteSection` stays derived. `blockquote` keeps the RN names `borderLeftColor`/`borderLeftWidth`. The `syntax` names align with enriched-markdown's where they map, and `operator`, `punctuation`, `variable` and `embedded` default to the base `color` (this changes the names of [P3-33](../phase-3/decisions.md#p3-33-syntax-colours-are-a-core-theme-token-that-follows-the-theme-mode)). Links are styled by URL pattern with `link.variants`, which also replaces the `mention` key of the `mentions` plugin.
- **Why:** points and relative heading sizes are what RN users and enriched-markdown expect, and they make `paragraph.fontSize` the one size knob. Nesting variants under `link` avoids a new top-level key, as `blockquote.admonitions` does.
