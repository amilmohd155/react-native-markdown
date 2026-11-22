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

- **Decision:** `theme` is `'auto' | 'light' | 'dark'` or one flat object keyed by element (`paragraph`, `h1`–`h6`, `link`, `codeBlock`, …) with plain style props, e.g. `codeBlock: { backgroundColor, borderRadius, padding }`. Public tokens (`colors`, `fontSize`, `radius`, `fonts`, `listBullets`, …), the `container`/`text` slots and `elements.*` leave the public API; `lightTheme` and `darkTheme` keep using tokens internally. `createTheme(input)` stays as a typed identity helper for the flat shape, without `base`: a theme always merges onto the built-in theme of the active scheme. Top-level keys apply to both schemes; the `dark`/`light` block merges over them. A plain object stays valid. Plugin element styles are keys of the same object.
- **Why:** three input shapes, two layers and three override paths are hard to learn; a flat, CSS-like shape is one concept. Each element has a typed prop whitelist, so the library knows which props go to the container and which to the text. Inline elements inherit from their block (nested `<Text>`). `createTheme` stays for whitelist checking outside JSX and so a package can ship a theme as a value.
- **Code block (P3-35):** `codeBlock.header` nests under `codeBlock` ([P3a-7](#p3a-7-related-elements-nest-under-their-parent-key)). The gutter is structural (no key); the `codeBlock={{ header, lineNumbers, wrap }}` prop and `onCopyPress` are unchanged.
- **Consequences:** the default `codeBlock.color` follows the scheme. Plugin keys must not clash with core keys or `dark`/`light`. Admonitions nest under `blockquote.admonitions.<kind>`. Supersedes the theme API of P1-16 to P1-18 where they conflict (font faces and the resolve cache remain, internally).

## P3a-3: Inline sizes are relative to the parent

Accepted · 2026-11-22

- **Decision:** an inline element's `fontSize` defaults to the parent's size (1em); a number sets an absolute size in points. `InlineCode` and `Kbd` stop multiplying the base by 0.9. `superscript` and `subscript` take a unitless `fontScale` (a fraction of the surrounding size) instead of a fixed 0.75.
- **Why:** `InlineCode` and `Kbd` use an absolute `base * 0.9` and `Superscript`/`Subscript` use `base * 0.75` (`src/theme/resolve.ts`), so inside a heading they shrink to body size instead of following it. enriched-markdown does the same: inline `code.fontSize` defaults to the parent's size and a number is absolute.

## P3a-4: Theme details settled in the whitelist

Accepted · 2026-11-22

- **Decision:** the [whitelist](./theme-props.md) settles six points. Heading sizes scale from `paragraph.fontSize` by an internal ratio unless a heading sets its own. `lineHeight` is in points. `footnoteSection` stays derived. `blockquote` keeps the RN names `borderLeftColor`/`borderLeftWidth`. The `syntax` names align with enriched-markdown's where they map, and `plain`, `operator`, `punctuation`, `variable` and `embedded` default to the base `codeBlock.color` (this changes the names of [P3-33](../phase-3/decisions.md#p3-33-syntax-colours-are-a-core-theme-token-that-follows-the-theme-mode)). Links are styled by URL pattern with `link.variants`, which also replaces the `mention` key of the `mentions` plugin.
- **Why:** points and relative heading sizes are what RN users and enriched-markdown expect, and they make `paragraph.fontSize` the one size knob. Nesting variants under `link` avoids a new top-level key, as `blockquote.admonitions` does.

## P3a-5: The checkbox is a drawn box

Accepted · 2026-11-22

- **Decision:** the task checkbox is always drawn (a bordered `View` with a checkmark), never a glyph, with no glyph fallback. `checkbox` takes `color`, `checkedColor`, `size`, `borderColor`, `borderRadius`, `checkmarkColor` and `checkedText`. `size` is the box width in points, default 0.9 x the list font size (it was a glyph font size). The checkmark is near-black or white by the fill's luminance unless `checkmarkColor` is set.
- **Why:** a glyph takes no border colour, checkmark colour or radius, which the flat whitelist wants to offer. One rendering path is simpler than two. Supersedes the glyph of [P3-20](../phase-3/decisions.md#p3-20-built-in-checked-style-themecheckbox-and-a-touch-target-and-label); its touch-target measurements are historical.

## P3a-6: `link.variants` merge per pattern, prop by prop; object order, first match wins

Accepted · 2026-11-22

- **Decision:** a variant key is a regular-expression source tested against the `href` in object order, first match wins. Across layers the same pattern keeps its position and the props it does not set; new patterns append. A variant merges over `link`.
- **Why:** deterministic and predictable, so a `dark` block can recolour one pattern without repeating the rest. Refines [P3a-4](#p3a-4-theme-details-settled-in-the-whitelist).

## P3a-7: Related elements nest under their parent key

Accepted · 2026-11-22

- **Decision:** families nest: `codeBlock.header`, `footnote.reference`, `footnote.backLink`, `footnote.definition` (`link.variants` and `blockquote.admonitions` already did). `listItem` folds into `list` text props, `tableCell` into `table` `cell*` props. A lone element without a parent stays top level.
- **Why:** footnote keys shared a prefix and repeated in dark blocks. `listItem` was text-only and inherited `paragraph`; cell padding belongs to `table`, as enriched-markdown's `cellPadding*`. One rule: a top-level key is one element or a family root, children nest.
