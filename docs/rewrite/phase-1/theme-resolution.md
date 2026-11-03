# Phase 1 · Theme resolution

This is how a `ThemeInput` ([04 · Theme](../04-api.md#theme)) becomes the resolved, cached styles that elements receive as `style`.

## Merge order

Later layers override earlier ones:

```
1. base theme tokens         lightTheme | darkTheme  ('auto' picks by useColorScheme())
2. user tokens               theme.colors / fonts / fontSize / lineHeight / spacing / radius
        │  derive
        ▼
3. derived element styles    from the merged tokens (table below)
4. plugin element themes     in plugin order (preset plugins first, then `plugins` prop)
5. user element overrides    theme.elements
        │  split + create
        ▼
resolved: { [Element]: { text: TextStyle id, container: ViewStyle id } } via StyleSheet.create
```

Tokens are merged per group, shallowly (`colors` merges key by key). Element overrides are merged per element into `text` and `container` separately. A function override such as `Heading: (level) => …` is called once per level at resolve time, not at render time.

## Derived element styles

Values are shown for the default tokens (`fontSize.base = 16`, `fontSize.scale = 1.2`, `lineHeight = 1.5`, `spacing.block = 12`).

| Element | text | container |
|---|---|---|
| Block text base (`Paragraph`, cells, list items) | `fontSize: base`, `lineHeight: base * lineHeight`, `color: colors.text`, `fontFamily: fonts.body` | `marginBottom: spacing.block` |
| `Heading` (level n) | `fontSize: round(base * scale^(6 - n))`: h1 40, h2 33, h3 28, h4 23, h5 19, h6 16. `fontWeight: '700'` for h1–h2, `'600'` otherwise. `fontFamily: fonts.heading ?? fonts.body` | `marginTop: spacing.block * 1.5`, `marginBottom: spacing.block * 0.5` |
| `Strong` | `fontWeight: '700'` **only** | — |
| `Emphasis` | `fontStyle: 'italic'` only | — |
| `Strikethrough` | `textDecorationLine: 'line-through'` only | — |
| `Underline` | `textDecorationLine: 'underline'` only | — |
| `Highlight` | `backgroundColor: colors.highlight` only | — |
| `Superscript` / `Subscript` | `fontSize: base * 0.75`, `lineHeight` unchanged; vertical offset via [P1-5](./decisions.md#p1-5-superscript-and-subscript-rendering) | — |
| `Link` | `color: colors.link`, `textDecorationLine: 'underline'` only | — |
| `InlineCode` / `Kbd` | `fontFamily: fonts.mono`, `fontSize: base * 0.9`, `backgroundColor: colors.codeBg` | — |
| `CodeBlock` | `fontFamily: fonts.mono`, `fontSize: base * 0.875`, `lineHeight: base * 0.875 * 1.45` | `backgroundColor: colors.codeBg`, `borderRadius: radius.code`, `padding: spacing.block` |
| `Blockquote` | `color: colors.muted` | `borderLeftWidth: 4`, `borderLeftColor: colors.quoteBar`, `paddingLeft: spacing.block` |
| `List` | — | `paddingLeft: 0`, `marginBottom: spacing.block` (`0` when nested) |
| `ListItem` | — | `flexDirection: 'row'`; marker column `minWidth: spacing.listIndent` |
| `Table` / `TableCell` | header cell: `fontWeight: '600'` | cell: `borderColor: colors.border`, `borderWidth: StyleSheet.hairlineWidth`, `padding: spacing.block * 0.5` |
| `Divider` | — | `height: StyleSheet.hairlineWidth`, `backgroundColor: colors.border`, `marginVertical: spacing.block` |

**Inline styles carry only what they change.** `Strong` sets only `fontWeight`, so a `Strong` inside a `Heading` keeps the heading's size and font. Nested `<Text>` inherits everything else. This replaces the v0.x fixed `fontSize: 16` on links ([01](../01-current-state.md#bugs-found)).

Only portable font weights are used (`'400'`, `'600'`, `'700'`).

## List markers

- **Bullets by depth:** `•`, `◦`, `▪`, then repeat. Overridable with the `listBullets: string[]` token.
- **Ordered markers** are aligned to the right in a fixed-width marker column, whose width is computed per list from the longest marker. This keeps "9." and "10." aligned.

## Caching

- **Resolve cache key:** `[colorScheme, themeInput]`.
  - `themeInput` is compared **shallowly per group** (`colors`, `fonts`, …, `elements`), so an inline object literal with equal values hits the cache.
  - Built-in themes are resolved once per color scheme at first use and kept for the app's lifetime.
- **One `StyleSheet.create` call per resolved theme**, covering all elements and heading levels.
- **The resolved theme is shared through `MarkdownThemeContext`.** `useMarkdownTheme()` returns `{ tokens, styles }`.
- **The plugin set is part of the key**, because plugins add elements and theme layers.

## Dark mode

`theme="auto"` subscribes to `useColorScheme()`. A change of scheme swaps to the other cached resolved theme. That changes `ctx`, so all blocks re-render once, which is expected and cheap compared with a re-parse.
