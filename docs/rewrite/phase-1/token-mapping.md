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
| `html_block` | `HtmlBlock` | `filteredHtml` = `meta.filteredHtml`, only when the tagfilter plugin filtered a tag | `text` = `content`. Never interpreted ([D3](../07-roadmap.md#decisions)). HTML output uses `filteredHtml` when present ([P1-13](./decisions.md#p1-13-tagfilter-records-filtered-html-instead-of-rewriting-the-text)). Same for `HtmlInline`. |
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
| `s_open` / `_close` | `Strikethrough` | — | GFM strikethrough: `~x~` or `~~x~~` (in-house rule with cmark-gfm semantics, [P1-11](./decisions.md#p1-11-in-house-strikethrough-with-cmark-gfm-semantics)) |
| `code_inline` | `InlineCode` | `text` = `content` | |
| `link_open` / `_close` | `Link` | `href` (attr), `title` (attr or `null`) | `markup === 'autolink'` (from `<…>`) or `markup === 'linkify'` (GFM autolink via linkify-it + wrapper, [P1-1](./decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps)) → `AUTOLINK`. markdown-it's `validateLink` has already rejected `javascript:`, `vbscript:`, `file:` and non-image `data:`. See [P1-3](./decisions.md#p1-3-url-sanitization-layers). |
| `image` | `Image` | `src`, `title`; `alt` = concatenated text of `token.children` | The `alt` attr is empty in the token. markdown-it builds alt text from the image's children. |
| `html_inline` | see [Raw HTML pairing](#raw-html-pairing) | | |
| `footnote_ref` | `FootnoteReference` | `label` = `meta.label`, `index` = `meta.id + 1`, `subId` = `meta.subId` | |

**Reference definitions** (`[ref]: url`) emit **no tokens**. markdown-it resolves reference links during parsing (`env.references`) and emits ordinary `link_open`/`image` tokens. Unresolved references stay as literal text, as CommonMark requires. No extra work is needed.

## Raw HTML pairing

`html: true` must be enabled in markdown-it so that HTML is tokenized. Each tag is a separate `html_inline` token (`<sup>` and `</sup>` are two tokens around a `text` token). The safe subset ([04 · Raw HTML](../04-api.md#raw-html)) is applied while converting:

Pairing is decided in a **pre-pass** over the inline token's children, so the main pass never has to rewrite a node it already created (`src/parse/htmlSubset.ts`):

```
pre-pass (pairHtmlTags), one stack shared with markdown containers:
  allowed, non-void open tag (not <br>, not self-closing)  → push it
  allowed close tag, top of stack is the same tag            → mark both as paired, pop
  markdown container open (em_open, link_open, …)            → push a marker
  markdown container close                                   → pop up to and including its marker
                                                               (html tags still open inside it stay unpaired)

main pass, on html_inline(content):
  mode == 'strip'                         → drop the token (text around it is kept)
  tag = parseSimpleTag(content)           // /^<(\/?)([a-z][a-z0-9]*)\s*(\/?)>$/i; attributes → null
  tag allowed && tag is <br> (opening)    → LineBreak + HARD
  tag allowed && paired                   → open: push the element (Superscript, Underline, …); close: pop
  tag allowed && not paired               → Text(content), merged into the run (unmatched or unclosed)
  otherwise                               → HtmlInline(content), shown as literal text
```

An unclosed `<sup>x` therefore comes out as the literal text `<sup>x`, the same result the "convert back" approach would give.

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

1. For each `list_item_open` whose first block is a paragraph, look at the paragraph's `inline` token.
2. If its first child is `text` that starts with `[ ]`, `[x]` or `[X]` (a tab also counts as blank) followed by a space or tab, strip the marker and that one whitespace character. If the marker is the whole text and a `softbreak` follows (`- [ ]` then content on the next line), drop both. Then set `meta.task = { checked }` on the `list_item_open` token.
3. The converter maps `meta.task` to `TASK` and, if checked, `CHECKED`.

This follows the GFM spec's task list rules: only at the start of the item's first paragraph, followed by whitespace. Not tasks: `- [ ]` with nothing after it (as on GitHub), `[@]`, `[x]a`. The rule runs before `text_join`, so an escaped `\[x]` (a `text_special` token) is never a marker. Implementation: `src/plugins/taskLists.ts`.

Known difference: cmark-gfm detects the marker before inline parsing, so `- [x] a` stays a task even if `[x]` is a defined link reference. Here the reference link wins. No spec example covers it.

## Footnotes

`markdown-it-footnote` emits:

| Token | Row | Notes |
|---|---|---|
| `footnote_ref` (inline) | `FootnoteReference` | See the inline table |
| `footnote_block_open` / `_close` | `FootnoteSection` | **Has `map === null`**, appended after all other blocks |
| `footnote_open` / `_close` | `FootnoteDefinition` | `label` = `meta.label`, `index` = `meta.id + 1`, `references` = number of `footnote_anchor` tokens inside it |
| `footnote_anchor` | — (dropped) | One per reference to the definition. Counted into `references`; the back-links are rendered by `FootnoteDefinition` itself |

- Definitions come in order of first reference; unused definitions are not emitted. An unresolved `[^x]` stays text.
- markdown-it-footnote's inline footnotes (`^[text]`) are disabled (`footnote_inline`): GitHub doesn't have them.
- The plugin's `footnote_open` tokens have `level === 0` and no `map`, so they never start a block of their own.

Because the footnote section has no `map`, its block index entry is synthesized:
- `blockStart` = `blockEnd` = `source.length`;
- key: its index, like every block;
- block context: per definition, its `index`, `label`, `references` and source text (the lines its tokens' `map`s cover), since the section's own range is empty (P1-9).

A block containing a `footnote_ref` adds `fn<id>.<subId>` to its block context: its number depends on references in earlier blocks.

See [P1-4](./decisions.md#p1-4-footnote-section-identity). Implementation: `src/plugins/footnotes.ts`, `src/parse/convert.ts`, `convertInline.ts`.

## Plugin tokens

Plugins register `token → NodeType` through `nodes: { Name: { token, kind, inlineView?, from } }` ([04 · Plugins](../04-api.md#plugins)):

- `token: 'math_inline'` matches self-contained tokens. For `*_open`/`*_close` pairs, register the base name (e.g. `container_note`), and the converter treats it as a container.
- `from(token)` returns the node's props. They're stored in the sparse attrs table, so they must be serializable plain values.
- `inlineView: true` sets the `INLINE_VIEW` flag.
- Node type ids are assigned from 128 in plugin order, then node order. The table's `pluginNodes` lists `{ name, kind, inlineView }` per id, so the renderer can resolve them.
- A `block` node only matches tokens in the block stream, an `inline` node only in `inline.children`. A token of the other kind is handled as unknown (below).
- Plugin names must be unique; they are part of the document context ([P1-9](./decisions.md#p1-9-block-identity-by-source-text-plus-context-and-index-keys)). The markdown-it instance is cached per preset and plugin list (by object identity), so pass the same plugin objects on every parse.
- Implementation: `src/plugins/registry.ts`, used by `src/parse/convert.ts` and `convertInline.ts`.

## Unknown tokens

Any token type with no mapping (a plugin that emits a token nobody registered):
- **Self-contained:** a `Text` row with `content` (inline), or a `Paragraph` containing that `Text` (block).
- **Open/close pair:** the children are kept and the wrapper is dropped.
- A dev-mode warning names the token type once per document.

Content is never silently dropped.

## Not emitted / ignored

- `text_special`: already merged into `text` by markdown-it's `text_join` core rule.
- **Linkify runs only through the `autolinks` plugin** ([P1-1](./decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps)), which replaces markdown-it's `linkify` rules with GFM ones; the `linkify` option itself stays off. Raw linkify-it matches never reach the converter: non-GFM matches (e.g. `README.md`) stay text and trailing punctuation is already trimmed.
