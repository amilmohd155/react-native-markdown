# Phase 1 · Element props derivation

This is how the renderer turns node table rows ([token-mapping.md](./token-mapping.md)) into the public props listed in [04 · Element catalog](../04-api.md#element-catalog). The catalog defines the props; this file defines where each value comes from.

## General rules

- **Props are plain values only:** strings, numbers, booleans, `null` and arrays of those. No table indexes, node ids or tokens leak into props. This is an API-contract test ([06](../06-testing.md)).
- **Every element also gets `children`** (unless the catalog says no `children`) and **`style`**, its resolved theme entry ([theme-resolution.md](./theme-resolution.md)).
- **Prop objects are created when a block renders, not when it's parsed.** Off-screen or memoized blocks never build props.
- **Missing optional values are `null`, never `undefined`.** That keeps shapes stable and simplifies `memo` comparisons.

## Per element

| Element | Prop | Source |
|---|---|---|
| `Heading` | `level` | attr `level` (1–6) |
| | `id` | GitHub-style slug of the heading's plain text: lowercase, spaces → `-`, punctuation removed, de-duplicated per document with `-1`, `-2` suffixes. Computed in a post-pass over `Heading` rows, in document order. |
| `List` | `ordered` | flag `ORDERED` |
| | `start` | attr `start` (ordered), else `1` |
| | `tight` | flag `TIGHT` |
| `ListItem` | `index` | attr `index` |
| | `ordered` | flag `ORDERED` |
| | `marker` | ordered: `` `${start + index}${delimiter}` `` (delimiter `.` or `)` from the list's markup). Bullet: the theme's bullet character for the item's nesting depth ([theme-resolution](./theme-resolution.md#list-markers)). |
| | `checked` | `null` if not `TASK`, else flag `CHECKED` |
| `CodeBlock` | `code` | row text. One trailing newline is removed. |
| | `language` | attr `language` or `null` |
| | `meta` | attr `meta` or `null` |
| `Table` | `align` | attr `align[]` |
| `TableRow` | `header` | flag `HEADER` |
| | `index` | attr `index` |
| `TableCell` | `align` | attr `align` |
| | `header` | flag `HEADER` |
| | `column` | attr `column` |
| `Divider` | — | |
| `Image` / `InlineImage` | `src` | attr `src` (after the image policy, see below) |
| | `alt` | attr `alt` (`''` if none) |
| | `title` | attr `title` or `null` |
| | `width`, `height` (`InlineImage`) | from the image size cache, if known, else `null` |
| `Link` | `href` | attr `href` (sanitized, see below) |
| | `title` | attr `title` or `null` |
| `InlineCode` | `code` | row text |
| `LineBreak` | `hard` | flag `HARD` |
| `FootnoteReference` | `label`, `index` | attrs |
| `FootnoteDefinition` | `label`, `index` | attrs |
| `HtmlBlock` / `HtmlInline` | `html` | row text |
| `Strong`, `Emphasis`, `Strikethrough`, `Underline`, `Highlight`, `Superscript`, `Subscript`, `Kbd`, `Paragraph`, `Blockquote` | — | |
| plugin elements | the plugin's `from(token)` result | sparse attrs |

## Image vs. InlineImage

An `Image` row becomes:
- **`Image` (block)** when it is the only child of a `Paragraph` (ignoring surrounding whitespace text). The paragraph wrapper is then skipped.
- **`InlineImage`** otherwise. Inline images render inside the paragraph's `<Text>`. If their size isn't known yet, they use a small fixed placeholder size from the theme until the size cache fills.

## Policies applied at render time

- **Links:** markdown-it's `validateLink` has already rejected dangerous schemes at parse time. The renderer also checks the scheme against an allowlist (`http`, `https`, `mailto`, `tel`, plus relative URLs) before calling `Linking.openURL` ([P1-3](./decisions.md#p1-3-url-sanitization-layers)). `onLinkPress` always receives the `href`, even for disallowed schemes, so apps can handle custom schemes.
- **Images:** with `images: 'deny'`, or a host outside `allowHosts`, `src` stays in the props but the default `Image` renders its `alt` text in a muted box instead of loading. Custom `Image` components receive `blocked: true`.

## `visit()` props

`visit(doc, { Heading(props, info) {…} })` passes **the same props objects**, built the same way, minus `children` and `style`. `info` holds `{ text, depth, blockIndex }`, where `text` is the element's plain-text content. This keeps the visitor API and the component API in sync by construction.
