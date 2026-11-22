# Phase 3a · Theme prop whitelist

The props each key of the flat `theme` object accepts ([P3a-2](./decisions.md#p3a-2-flat-per-element-theme-tokens-become-internal)). **Draft**, built from `src/theme/types.ts` and `src/theme/resolve.ts` at the `v1` head after PR #74. A prop not listed for a key is a type error. The same keys work at the top level and inside `dark: {…}` / `light: {…}`.

Names are React Native style names wherever one exists. Props with no RN equivalent are marked **new**. The library routes each prop to the element's container (a `View`) or its text (a `Text`), so users never name the slot. Where a default comes from today's tokens, the token is shown; tokens stay internal ([P3a-2](./decisions.md#p3a-2-flat-per-element-theme-tokens-become-internal)).

**Groups** used below:

- **T** (text): `color`, `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `textAlign`.
- **M** (margins): `marginTop`, `marginBottom`.

## Block elements

| Key | Accepts | Default source |
|---|---|---|
| `paragraph` | T, M | `colors.text`, `fonts.body`, `fontSize.base`, `lineHeight`, `spacing.block` |
| `h1`–`h6` | T, M | size `fontSize.base` × `fontSize.scale`^(6−n), `lineHeight` 1.25 × size, weight 700 (h1–h2) or 600, margins 1.5 / 0.5 × `spacing.block`, `fonts.heading` |
| `blockquote` | T, M, `backgroundColor`, `borderLeftColor`, `borderLeftWidth`, `borderRadius`, `padding`, `paddingLeft` (bar to text), **new** `admonitions` (below) | `colors.muted`, `colors.quoteBar`. `padding` is top and bottom, applies at every nesting level, and the bar is clipped to `borderRadius` |
| `list` | M, **new** `bullets` (string array by depth), `bulletColor`, `bulletSize`, `markerColor` (number markers), `markerFontWeight`, `markerMinWidth` (floors the marker column so "9." and "10." align), `gapWidth` (marker to text), `marginLeft` (minimum indent per nesting level; the marker column can exceed it), `itemSpacing` (between items, nested included) | `listBullets`; `marginLeft` restores the unread `spacing.listIndent` (default 20); `gapWidth` defaults to 6 |
| `listItem` | T | inherits `paragraph` |
| `codeBlock` | T, M, `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `padding`, **new** `syntax` (13 colours, below) | `fonts.mono`, 0.875 × base, `colors.codeBg`, `radius.code` |
| `codeBlockHeader` | `color`, `fontFamily`, `fontSize`, `lineHeight`, `backgroundColor`, `borderBottomColor`, `borderBottomWidth`, `paddingHorizontal`, `paddingVertical` | `colors.muted`, `colors.codeBg`, `colors.border` |
| `table` | M, `borderColor`, `borderWidth`, `borderRadius`, `align` (`'left' \| 'center' \| 'right'`, a table narrower than its container), `horizontalOverflow` (bleed in points on each side of a scrolling table), **new** `headerBackgroundColor`, `headerColor`, `headerFontFamily`, `rowEvenBackgroundColor`, `rowOddBackgroundColor` (zebra) | `colors.border`; header is bold today (`tableHeaderCell` variant). Zebra: the first body row is even (0-based over body rows, header excluded). enriched-markdown calls `headerColor` `headerTextColor`. Bleed replaces any left/right margin of the table |
| `tableCell` | T, `backgroundColor`, `padding`, `paddingHorizontal`, `paddingVertical` | inherits `paragraph` |
| `divider` | `backgroundColor`, `height`, M | `colors.border` |
| `image` | M, `borderRadius`, `aspectRatio` (also the placeholder until the size is known), `height` (fixed), `maxHeight` (fit, aspect kept), `resizeMode` (`'contain' \| 'cover' \| 'stretch' \| 'center' \| 'none'`) | `imageRatio`, `radius.code`. Sizing precedence `aspectRatio` > `maxHeight` > `height`; `resizeMode` `'cover'` when `aspectRatio` or `maxHeight` is set |
| `inlineImage` | **new** `size` (square side in points, scaled to fit) | — |
| `htmlBlock` | `color`, `fontFamily`, `fontSize`, M | `fonts.mono`, `colors.muted` |
| `footnoteDefinition` | `color`, `fontSize`, `lineHeight`, **new** `highlightColor` (jump flash) | 0.875 × base, `colors.footnoteHighlight` |
| `checkbox` (task list) | **new** `color`, `checkedColor`, `size`, `borderColor` (unchecked box), `checkmarkColor`, `borderRadius`, `checkedText` (`TextStyle` or `false`) | `checkbox.*`; `size` defaults to 0.9 × the list font size |

`syntax` keys ([P3-33](../phase-3/decisions.md#p3-33-syntax-colours-are-a-core-theme-token-that-follows-the-theme-mode)): the 13 token types incl. `plain`, `inserted`, `deleted`. A partial object merges onto the scheme's palette. Names align with enriched-markdown's where they map, and `operator`, `punctuation`, `variable` and `embedded` default to the base `color` ([P3a-4](./decisions.md#p3a-4-theme-details-settled-in-the-whitelist)).

**Inheritance:** inline elements inherit `fontSize`, `fontFamily`, `fontWeight` and `color` from the containing block (nested `Text`); an element sets only what it changes. A list item inherits from `paragraph`, a blockquote's children from `blockquote` text props.

**`lineHeight`** is in points and, as on any RN `Text`, an exact height: tall inline content (an inline image, a larger `fontSize`) is clipped, not pushed apart. Enriched-markdown's is a minimum. Document this next to the prop.

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
| `footnoteReference` | `color`, **new** `fontScale` | `colors.link`, 0.75 |
| `footnoteBackLink` | `color` | `colors.link` |

No props: `inlineImage`, `lineBreak`, `htmlInline`, `tableRow`, `listItem` layout. Plain text is not an element: style it through `paragraph`.

## Plugin elements

A plugin that adds an element gets a top-level key; a plugin that decorates a core element nests under it. Each plugin declares its keys and their prop types by augmenting the same map it uses today for element props (`PluginElementPropsMap`), so they are type-checked and cannot clash with core keys, `dark` or `light`.

| Plugin | Key | Accepts |
|---|---|---|
| mentions | none | a mention is styled by the `link.variants` entry that matches its URL, else `link` |
| admonitions | `blockquote.admonitions.<kind>`, kind one of `note`, `tip`, `important`, `warning`, `caution` | `color` (accent: bar, title, icon), `backgroundColor`. Geometry and fonts come from `blockquote`, so one `blockquote` style restyles every callout. Defaults: GitHub's accent palette, `backgroundColor` a tint of the accent |
| highlight, emoji | none | code colours come from `codeBlock.syntax` |

Shape, after enriched-markdown's [admonitions](https://docs.swmansion.com/enriched-markdown/react-native/api-reference/style-properties#admonitions) (`blockquote.admonitions.<kind>`), with RN prop names:

```tsx
theme={{
  blockquote: {
    borderLeftWidth: 4,
    padding: 12,
    admonitions: { caution: { color: '#b91c1c', backgroundColor: '#fef2f2' } },
  },
  dark: { blockquote: { admonitions: { caution: { color: '#f87171' } } } },
}}
```

## What happens to each current token

| Token | Becomes |
|---|---|
| `colors.text` | default `color` of `paragraph`, `h1`–`h6`, `codeBlock`; set it on `paragraph` |
| `colors.muted`, `colors.border`, `colors.codeBg`, `colors.quoteBar`, `colors.highlight`, `colors.link` | per-element props above (`blockquote.color`, `divider.backgroundColor`, `codeBlock.backgroundColor`, …); the scheme blocks supply the defaults |
| `colors.footnoteHighlight` | `footnoteDefinition.highlightColor` |
| `fonts.body` / `heading` / `mono` | `fontFamily` on `paragraph`, `h1`–`h6`, `codeBlock`; family or face map as today ([P1-16](../phase-1/decisions.md#p1-16-font-faces-for-custom-fonts)) |
| `fontSize.base` | `paragraph.fontSize`; headings and inline sizes derive from it unless set |
| `fontSize.scale` | internal heading ratio; set `h1`–`h6` sizes directly |
| `lineHeight` | per-element `lineHeight`, in points |
| `spacing.block` | internal default of the `marginBottom` values |
| `spacing.listIndent` | **dropped**: nothing reads it |
| `radius.code` | `codeBlock.borderRadius`, `image.borderRadius` |
| `listBullets` | `list.bullets` |
| `imageRatio` | `image.aspectRatio` |
| `checkbox.*` | `checkbox.*` |
| `syntax.*` | `codeBlock.syntax` |
| `elements.<X>.text` / `.container` | the flat props of key `x`; the `Heading` function becomes `h1`–`h6` |

## Not theme

`codeBlock={{ header, lineNumbers, wrap }}`, `onCopyPress`, `footnotes.backLinkMark` and the task glyph characters are behaviour or content and stay props. The line-number gutter (`codeBlockGutter`) and `footnoteSection` are structural: they derive from `codeBlock` and `footnoteDefinition` and have no key.

## Settled

Decided with the maintainer, recorded in [P3a-4](./decisions.md#p3a-4-theme-details-settled-in-the-whitelist):

- **Heading sizes** scale from `paragraph.fontSize` by an internal ratio, unless an `h1`–`h6` sets its own `fontSize`.
- **`lineHeight`** is in points; the built-in themes compute them.
- **`footnoteSection`** stays derived, with no key.
- **`blockquote`** keeps the RN names `borderLeftColor` and `borderLeftWidth`; add `barColor`/`barWidth` aliases only if the docs read badly.
- **`syntax` names** align with enriched-markdown's where they map, and `operator`, `punctuation`, `variable` and `embedded` default to the base `color`.
- **Link variants** nest under `link` (below).

## Link variants

Enriched-markdown styles links by URL pattern: a top-level `linkVariants` object whose keys are regular expressions (`'^user:'`), each taking link props; mentions are styled the same way. Ours nests the idea under `link`, so there is no new top-level key:

```tsx
theme={{
  link: {
    color: '#2563EB',
    variants: {
      '^user:': { color: '#1264A3', backgroundColor: '#E8F5FB', textDecorationLine: 'none' },
      '^channel:': { color: '#065F46', backgroundColor: '#D1FAE5', textDecorationLine: 'none' },
    },
  },
}}
```

- A variant accepts the same props as `link` and is merged over it.
- Keys are regular expression sources tested against the `href` in object order; the first match wins, and no match uses plain `link`.
- Mentions: the `mention` key of the `mentions` plugin is dropped. A mention is styled by the variant that matches its URL, else by `link`.
- Variants work inside the `dark` and `light` blocks like any other prop.

## Implementation notes

Agreed, not blocking the whitelist:

1. **Whitelist enforcement.** Mapped types per key, plus a dev-only warning for unknown props.
2. **Per-platform defaults.** A table (system font, mono family, line height, `fontScale`), written once the built-in themes are rewritten.
3. **Link variants.** Built as described above for now: the first matching pattern wins, a mention is matched by its URL. Whether a mention's URL always carries its scheme, how an invalid regular expression behaves in development, and the pattern syntax (taken from the maintainer's example; enriched-markdown's `MENTIONS.md` is unread) are revisited later.
4. **Decoration colour.** On Android a decoration line takes the text colour, so `strikethrough.color` and `underline.color` also colour the text there. Document it with the props. `inlineCode.borderColor` is not offered; check on a device before adding it.
5. **Not adopted:** `video`, spoiler particles, `baselineOffsetScale`, `math` (a plugin-owned key if a math plugin ships), `link.underline` (we use `textDecorationLine`).
6. **Provenance.** Names and defaults taken from enriched-markdown's `STYLES.md` come from a subagent's read of that file; re-check each against the source when implementing.
