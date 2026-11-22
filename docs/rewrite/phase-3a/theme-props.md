# Phase 3a · Theme prop whitelist

The props each key of the flat `theme` object accepts ([P3a-2](./decisions.md#p3a-2-flat-per-element-theme-tokens-become-internal)). Source of truth: `src/theme/flatTypes.ts`; the compact table is in [04 · Theme](../04-api.md#theme). A prop not listed for a key is a type error. The same keys work at the top level and inside `dark: {…}` / `light: {…}`.

Names are React Native style names wherever one exists; props with no RN equivalent are marked **new**.

**Groups** used below:

- **T** (text): `color`, `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `textAlign`.
- **M** (margins): `marginTop`, `marginBottom`.

## Block elements

| Key | Accepts | Default source |
|---|---|---|
| `paragraph` | T, M | `colors.text`, `fonts.body`, `fontSize.base`, `lineHeight`, `spacing.block` |
| `h1`–`h6` | T, M | size `fontSize.base` × `fontSize.scale`^(6−n), `lineHeight` 1.25 × size, weight 700 (h1–h2) or 600, margins 1.5 / 0.5 × `spacing.block`, `fonts.heading` |
| `blockquote` | T, M, `backgroundColor`, `borderLeftColor`, `borderLeftWidth`, `borderRadius`, `padding`, `paddingLeft` (bar to text), **new** `admonitions` (below) | `colors.muted`, `colors.quoteBar`. `padding` is top and bottom, applies at every nesting level, and the bar is clipped to `borderRadius` |
| `list` | M, T (item text), **new** `bullets` (string array by depth), `bulletColor`, `bulletSize`, `markerColor` (number markers), `markerFontWeight`, `markerMinWidth` (floors the marker column so "9." and "10." align), `gapWidth` (marker to text), `marginLeft` (minimum indent per nesting level; the marker column can exceed it), `itemSpacing` (between items, nested included) | `listBullets`; `marginLeft` restores the unread `spacing.listIndent` (default 20); `gapWidth` defaults to 6. Item text inherits `paragraph`, the T props override |
| `codeBlock` | T, M, `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `padding`, **new** `syntax` (15 colours, below), `header` (below) | `fonts.mono`, 0.875 × base, `colors.codeBg`, `radius.code` |
| `codeBlock.header` | `color`, `fontFamily`, `fontSize`, `lineHeight`, `backgroundColor`, `borderBottomColor`, `borderBottomWidth`, `paddingHorizontal`, `paddingVertical` | `colors.muted`, `colors.codeBg`, `colors.border` |
| `table` | M, T (cell text), **new** `cellPadding`, `cellPaddingHorizontal`, `cellPaddingVertical`, `cellBackgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `align` (`'left' \| 'center' \| 'right'`, a table narrower than its container), `horizontalOverflow` (bleed in points on each side of a scrolling table), **new** `headerBackgroundColor`, `headerColor`, `headerFontFamily`, `rowEvenBackgroundColor`, `rowOddBackgroundColor` (zebra) | `colors.border`; header is bold. Zebra: the first body row is even (header excluded). `headerColor` is enriched-markdown's `headerTextColor`. Bleed replaces any left/right margin of the table |
| `divider` | `backgroundColor`, `height`, M | `colors.border` |
| `image` | M, `borderRadius`, `aspectRatio` (also the placeholder until the size is known), `height` (fixed), `maxHeight` (fit, aspect kept), `resizeMode` (`'contain' \| 'cover' \| 'stretch' \| 'center' \| 'none'`) | `imageRatio`, `radius.code`. Sizing precedence `aspectRatio` > `maxHeight` > `height`; `resizeMode` `'cover'` when `aspectRatio` or `maxHeight` is set |
| `inlineImage` | **new** `size` (square side in points, scaled to fit) | — |
| `htmlBlock` | `color`, `fontFamily`, `fontSize`, M | `fonts.mono`, `colors.muted` |
| `footnote.definition` | `color`, `fontSize`, `lineHeight`, **new** `highlightColor` (jump flash) | 0.875 × base, `colors.footnoteHighlight` |
| `checkbox` (task list) | **new** `color`, `checkedColor`, `size` (box width in points), `borderColor` (unchecked box), `checkmarkColor`, `borderRadius`, `checkedText` (`TextStyle` or `false`) | a drawn box ([P3a-5](./decisions.md#p3a-5-the-checkbox-is-a-drawn-box)): `size` defaults to 0.9 × the list font size, `checkmarkColor` near-black or white by the fill's luminance |

`syntax` keys ([P3-33](../phase-3/decisions.md#p3-33-syntax-colours-are-a-core-theme-token-that-follows-the-theme-mode)): the 15 token types incl. `plain`, `inserted`, `deleted`, `variable`, `embedded`. A partial object merges onto the scheme's palette. `plain`, `operator`, `punctuation`, `variable` and `embedded` default to the base `codeBlock.color`; the other types follow the scheme only (set them with a dark custom `codeBlock.backgroundColor`) ([P3a-4](./decisions.md#p3a-4-theme-details-settled-in-the-whitelist)).

**Inheritance:** inline elements inherit `fontSize`, `fontFamily`, `fontWeight` and `color` from the containing block (nested `Text`); an element sets only what it changes. A list item and a table cell inherit from `paragraph`, a blockquote's children from `blockquote` text props.

**`lineHeight`** is in points and, as on any RN `Text`, an exact height: tall inline content (an inline image, a larger `fontSize`) is clipped, not pushed apart. Enriched-markdown's is a minimum. So `inlineImage.size` is clipped unless `paragraph.lineHeight` is raised.

## Inline elements

| Key | Accepts | Default source |
|---|---|---|
| `strong` | `color`, `fontFamily`, `fontWeight` | bold of the current face. With a custom `fontFamily`, bold is still added; `fontWeight: 'normal'` uses the face as-is (avoids double-bolding a face like `Montserrat-SemiBold`) |
| `em` | `color`, `fontFamily`, `fontStyle` | italic of the current face; `fontStyle: 'normal'` uses the face as-is |
| `strikethrough`, `underline` | `color` | — (on Android the decoration takes the text colour, so `color` also colours the text) |
| `highlight` | `color`, `backgroundColor` | `colors.highlight`; `color` inherits from the block when unset |
| `link` | `color`, `fontFamily`, `fontWeight`, `textDecorationLine`, `backgroundColor`, **new** `variants` (URL pattern → link props, below) | `colors.link`, underline |
| `inlineCode`, `kbd` | `color`, `fontFamily`, `fontSize`, `backgroundColor` | `fonts.mono`, `colors.codeBg`; size 1em ([P3a-3](./decisions.md#p3a-3-inline-sizes-are-relative-to-the-parent)) |
| `superscript`, `subscript` | **new** `fontScale`, `color` | 0.75 on iOS and web, 0.65 on Android (Roboto's larger x-height) ([P3a-3](./decisions.md#p3a-3-inline-sizes-are-relative-to-the-parent)). No baseline offset: nested `Text` cannot shift a baseline |
| `footnote.reference` | `color`, **new** `fontScale` | `colors.link`; `fontScale` 0.75 on iOS and web, 0.65 on Android |
| `footnote.backLink` | `color` | `colors.link` |

No props: `inlineImage`, `lineBreak`, `htmlInline`, `tableRow`, list item layout. Plain text is not an element: style it through `paragraph`.

## Plugin elements

A plugin that adds an element gets a top-level key; a plugin that decorates a core element nests under it. Each plugin declares its keys and their prop types by augmenting `PluginThemeMap` (like `PluginElementPropsMap` for element props), so they are type-checked and cannot clash with core keys, `dark` or `light`.

| Plugin | Key | Accepts |
|---|---|---|
| mentions | none | a mention is styled by the `link.variants` entry that matches its URL, else `link` |
| admonitions | `blockquote.admonitions.<kind>`, kind one of `note`, `tip`, `important`, `warning`, `caution` | `color` (accent: bar, title, icon), `backgroundColor`. Geometry and fonts come from `blockquote`. Defaults and tint: [04 · Theme](../04-api.md#theme) |
| highlight, emoji | none | code colours come from `codeBlock.syntax` |

## Old tokens

Each former token is a per-element prop (`colors.*` to `codeBlock.backgroundColor`, `divider.backgroundColor`, `link.color`, …; `fonts.*` to `fontFamily`; `fontSize.base` to `paragraph.fontSize`; `radius.code` to `codeBlock.borderRadius` and `image.borderRadius`; `listBullets` to `list.bullets`; `imageRatio` to `image.aspectRatio`; `syntax.*` to `codeBlock.syntax`), or internal (`fontSize.scale`, `spacing.block`). `spacing.listIndent` was dropped: nothing read it. `elements.<X>.text`/`.container` became the flat props of key `x`; `Heading` became `h1`–`h6`. Before/after: [migration guide](../../migration-from-v0.md#styles-and-mergestyle--theme).

## Not theme

`codeBlock={{ header, lineNumbers, wrap }}`, `onCopyPress`, `footnotes.backLinkMark` and the task glyph characters are behaviour or content and stay props. The line-number gutter (`codeBlockGutter`) and `footnoteSection` are structural: they derive from `codeBlock` and `footnote.definition` and have no key.

## Link variants

Nested under `link` (enriched-markdown has a top-level `linkVariants`); behaviour: [04 · Theme](../04-api.md#theme), [P3a-6](./decisions.md#p3a-6-linkvariants-merge-per-pattern-prop-by-prop-object-order-first-match-wins). Differences from enriched-markdown: no longest-first sort (object order decides); a variant's `backgroundColor` inherits `link.backgroundColor` (enriched: transparent); `textDecorationLine` instead of `underline`.

## Not adopted

`video`, spoiler particles, `baselineOffsetScale`, `math`, `link.underline`, `inlineCode.borderColor` and `kbd.borderColor`. Device-checked (Android S25 FE, iOS 27.2 sim, RN 0.88): border props on a nested `Text` draw nothing on either platform and the background stays square. An inline `View` draws a border but is atomic: it overflows on Android and becomes a block on iOS when the code wraps.
