# Phase 1 · Token → node table mapping

This is the specification for the single conversion pass described in [03 · Why a flat token stream fits the block model](../03-architecture.md#why-a-flat-token-stream-fits-the-block-model). It maps every markdown-it token to rows in the private node table ([03 · Document model](../03-architecture.md#2-document-model)).

All token names and fields below were **checked against markdown-it 15.0.3 and markdown-it-footnote** output on 2026-11-03, with `html: true`.

## Conventions

- **Row:** one node in the table, written as `(type, flags, attrs, text)`.
- **Container:** a node pushed on the stack by an `*_open` token and popped by the matching `*_close`.
- **Top-level block:** any row created by a token with `level === 0` (opening or self-contained). It starts an entry in the block index. Its source range comes from `token.map` and the line-offset table. Close tokens have `map === null` and are never used for ranges.
- **Text runs:** adjacent `text` children are merged into one text row while building ([03 · Inline flattener](../03-architecture.md#inline-flattener)).

## Node types

The `NodeType` enum (`Uint8`). Plugin types are registered from 128 upward.

| Id | NodeType | Element (public) | Kind |
|---|---|---|---|
| 0 | `Root` | — | — |
| 1 | `Heading` | `Heading` | block |
| 2 | `Paragraph` | `Paragraph` | block |
| 3 | `Blockquote` | `Blockquote` | block |
| 4 | `List` | `List` | block |
| 5 | `ListItem` | `ListItem` | block |
| 6 | `CodeBlock` | `CodeBlock` | block |
| 7 | `Divider` | `Divider` | block |
| 8 | `HtmlBlock` | `HtmlBlock` | block |
| 9 | `Table` | `Table` | block |
| 10 | `TableHead` | — (structural; rows get `header`) | block |
| 11 | `TableBody` | — (structural) | block |
| 12 | `TableRow` | `TableRow` | block |
| 13 | `TableCell` | `TableCell` | block |
| 14 | `FootnoteSection` | — (container for definitions) | block |
| 15 | `FootnoteDefinition` | `FootnoteDefinition` | block |
| 32 | `Text` | — (raw string) | inline |
| 33 | `Strong` | `Strong` | inline |
| 34 | `Emphasis` | `Emphasis` | inline |
| 35 | `Strikethrough` | `Strikethrough` | inline |
| 36 | `InlineCode` | `InlineCode` | inline |
| 37 | `Link` | `Link` | inline |
| 38 | `Image` | `Image` / `InlineImage` (decided at render, [element-props](./element-props.md#image-vs-inlineimage)) | inline |
| 39 | `LineBreak` | `LineBreak` | inline |
| 40 | `HtmlInline` | `HtmlInline` | inline |
| 41 | `Underline` | `Underline` | inline |
| 42 | `Highlight` | `Highlight` | inline |
| 43 | `Superscript` | `Superscript` | inline |
| 44 | `Subscript` | `Subscript` | inline |
| 45 | `Kbd` | `Kbd` | inline |
| 46 | `FootnoteReference` | `FootnoteReference` | inline |
| 128+ | plugin types | plugin element names | per plugin |

### Flag bits (`Uint8`)

| Bit | Name | Used by |
|---|---|---|
| 0 | `ORDERED` | `List`, `ListItem` |
| 1 | `TIGHT` | `List` (and its paragraphs render without block spacing) |
| 2 | `TASK` | `ListItem` is a task item |
| 3 | `CHECKED` | `ListItem` with `TASK` |
| 4 | `HEADER` | `TableRow`, `TableCell` inside `thead` |
| 5 | `HARD` | `LineBreak` (hard break, as opposed to a soft break rendered as a newline) |
| 6 | `AUTOLINK` | `Link` created from `<…>` or a GFM autolink |
| 7 | `INLINE_VIEW` | plugin inline node declared `inlineView: true` ([D8](../07-roadmap.md#decisions)) |

## Block tokens

| Token | Row | Attrs / text | Notes |
|---|---|---|---|
| `heading_open` / `_close` | `Heading` | `level` from `tag` (`h1`→1) | Setext and ATX produce the same token. Slug `id` is computed at the end of the pass ([element-props](./element-props.md#per-element)). |
| `paragraph_open` / `_close` | `Paragraph` | — | When `token.hidden === true` (paragraph in a tight list), set `TIGHT` on the enclosing `List` instead. The row is still created. |
| `blockquote_open` / `_close` | `Blockquote` | — | |
| `bullet_list_open` / `_close` | `List` | `markup` (`-`, `*`, `+`) | |
| `ordered_list_open` / `_close` | `List` + `ORDERED` | `start` from attr `start` (default 1); delimiter from `markup` (`.` or `)`) | |
| `list_item_open` / `_close` | `ListItem` | `index` (position in parent) | `ORDERED` copied from parent. Task detection: see [Task lists](#task-lists). |
| `fence` | `CodeBlock` | `language` = first word of `info`, `meta` = rest of `info` (trimmed), or `null` | `text` = `content`. markdown-it leaves `info` raw, so the converter decodes escapes and entities with `md.utils.unescapeAll` first (CommonMark requires it). |
| `code_block` | `CodeBlock` | `language = null`, `meta = null` | Indented code. `text` = `content`. |
| `hr` | `Divider` | — | |
| `html_block` | `HtmlBlock` | — | `text` = `content`. Never interpreted ([D3](../07-roadmap.md#decisions)). `tagfilter` applies first. |
| `table_open` / `_close` | `Table` | `align[]` collected from the first row's `th` | |
| `thead_open` / `_close` | `TableHead` | — | Sets `HEADER` on descendant rows and cells. |
| `tbody_open` / `_close` | `TableBody` | — | |
| `tr_open` / `_close` | `TableRow` | `index` | |
| `th_open` / `td_open` (+ `_close`) | `TableCell` (+ `HEADER` for `th`) | `align` from attr `style`: `text-align:left\|center\|right` → `'left'\|'center'\|'right'`, missing → `null`; `column` index | Cells contain an `inline` token directly (no paragraph). |
| `inline` | — | — | Its `children` are converted in the inline pass below, under the current container. |

## Inline tokens (`inline.children`)

| Token | Row | Attrs / text | Notes |
|---|---|---|---|
| `text` | `Text` | `text` = `content` | Entities and backslash escapes are already resolved (`text_special` is merged by markdown-it's `text_join`). Adjacent runs are merged. |
| `softbreak` | `Text` | `"\n"` | Merged into the surrounding text run. How a soft break renders (space vs. newline) is [P1-2](./decisions.md#p1-2-soft-line-breaks). |
| `hardbreak` | `LineBreak` + `HARD` | — | |
| `em_open` / `_close` | `Emphasis` | — | |
| `strong_open` / `_close` | `Strong` | — | |
| `s_open` / `_close` | `Strikethrough` | — | GFM strikethrough (markdown-it core) |
| `code_inline` | `InlineCode` | `text` = `content` | |
| `link_open` / `_close` | `Link` | `href` (attr), `title` (attr or `null`) | `markup === 'autolink'` (from `<…>`) or `markup === 'linkify'` (GFM autolink via linkify-it + wrapper, [P1-1](./decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps)) → `AUTOLINK`. markdown-it's `validateLink` has already rejected `javascript:`, `vbscript:`, `file:` and non-image `data:`. See [P1-3](./decisions.md#p1-3-url-sanitization-layers). |
| `image` | `Image` | `src`, `title`; `alt` = concatenated text of `token.children` | The `alt` attr is empty in the token. markdown-it builds alt text from the image's children. |
| `html_inline` | see [Raw HTML pairing](#raw-html-pairing) | | |
| `footnote_ref` | `FootnoteReference` | `label` = `meta.label`, `index` = `meta.id + 1`, `subId` = `meta.subId` | |

**Reference definitions** (`[ref]: url`) emit **no tokens**. markdown-it resolves reference links during parsing (`env.references`) and emits ordinary `link_open`/`image` tokens. Unresolved references stay as literal text, as CommonMark requires. No extra work is needed.

## Raw HTML pairing

`html: true` must be enabled in markdown-it so that HTML is tokenized. Each tag is a separate `html_inline` token (`<sup>` and `</sup>` are two tokens around a `text` token). The safe subset ([04 · Raw HTML](../04-api.md#raw-html)) is applied while converting:

```
on html_inline(content):
  tag = parseSimpleTag(content)          // /^<\/?([a-z]+)\s*\/?>$/i, no attributes → null
  if mode == 'strip':                     drop the token; continue
  if tag && tag.name in allowlist:
    if tag.name == 'br':                  add LineBreak + HARD
    elif opening:                         push element row (Superscript, Underline, …) onto the inline stack, with a pending marker
    elif closing && top of stack is the same element with a pending marker:
                                          pop
    else:                                 add Text(content)          // unmatched close → literal
  else:                                   add HtmlInline(text=content) // rendered as literal text, or dropped in 'strip' mode
at end of inline token:
  for each still-pending opened element:  convert it back: prepend Text("<tag>") and keep its children (literal-text fallback)
```

- **Attributes:** tags with attributes (`<span class="x">`) don't match `parseSimpleTag` and become literal text. That's deliberate: attributes are never interpreted.
- **Nesting:** pairing is per `inline` token. HTML can't span blocks.
- **Unclosed tags:** an unclosed allowlisted tag falls back to literal text plus its content, so content is never dropped.

| Tag | Row |
|---|---|
| `br` | `LineBreak` + `HARD` |
| `b`, `strong` | `Strong` |
| `i`, `em` | `Emphasis` |
| `s`, `del` | `Strikethrough` |
| `u` | `Underline` |
| `mark` | `Highlight` |
| `sup` / `sub` | `Superscript` / `Subscript` |
| `kbd` | `Kbd` |

## Task lists

markdown-it core has no task lists. The in-house `taskLists` plugin is a markdown-it **core rule** that runs after `inline`:

1. For each `list_item_open`, look at the first `inline` token of the item's first paragraph.
2. If its first child is `text` whose content starts with `[ ] `, `[x] ` or `[X] `, set `meta.task = { checked }` on the `list_item_open` token and strip the 4-character prefix from the text.
3. The converter maps `meta.task` to `TASK` and, if checked, `CHECKED`.

This follows the GFM spec's task list rules: only at the start of the item's first paragraph, followed by whitespace.

## Footnotes

`markdown-it-footnote` emits:

| Token | Row | Notes |
|---|---|---|
| `footnote_ref` (inline) | `FootnoteReference` | See the inline table |
| `footnote_block_open` / `_close` | `FootnoteSection` | **Has `map === null`**, appended after all other blocks |
| `footnote_open` / `_close` | `FootnoteDefinition` | `label` = `meta.label`, `index` = `meta.id + 1` |
| `footnote_anchor` | — (dropped) | The back-reference is rendered by `FootnoteDefinition` itself |

Because the footnote section has no `map`, its block index entry is synthesized:
- `blockStart` = `blockEnd` = `source.length`;
- key `fn`;
- hash computed over the definitions' text rows.

See [P1-4](./decisions.md#p1-4-footnote-section-identity).

## Plugin tokens

Plugins register `token → NodeType` through `nodes: { Name: { token, kind, inlineView?, from } }` ([04 · Plugins](../04-api.md#plugins)):

- `token: 'math_inline'` matches self-contained tokens. For `*_open`/`*_close` pairs, register the base name (e.g. `container_note`), and the converter treats it as a container.
- `from(token)` returns the node's props. They're stored in the sparse attrs table, so they must be serializable plain values.
- `inlineView: true` sets the `INLINE_VIEW` flag.

## Unknown tokens

Any token type with no mapping (a plugin that emits a token nobody registered):
- **Self-contained:** a `Text` row with `content` (inline), or a `Paragraph` containing that `Text` (block).
- **Open/close pair:** the children are kept and the wrapper is dropped.
- A dev-mode warning names the token type once per document.

Content is never silently dropped.

## Not emitted / ignored

- `text_special`: already merged into `text` by markdown-it's `text_join` core rule.
- **`linkify` is enabled, behind the GFM wrapper** ([P1-1](./decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps)). Raw linkify-it matches never reach the converter unfiltered. The wrapper has already unwrapped non-GFM matches (e.g. `README.md`) back into text and trimmed trailing punctuation.
