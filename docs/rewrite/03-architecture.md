# 03 · Architecture

## Design principles

1. **Work proportional to change.** Unchanged input does nothing. A changed block re-renders only that block. A streamed chunk re-parses only the tail.
2. **Pay once.** Themes, parser instances and default elements are built once and shared.
3. **Flat and immutable data.** No AST mutation after parsing, and no per-node array copies.
4. **Minimal host work.** Few React elements, few shadow nodes, few native views.
5. **Correct by default.** CommonMark + GFM pass the official spec suites without user configuration.
6. **Swappable layers.** The parser, renderer and component are separate, so each can be replaced or used on its own.
7. **Private model, public elements.** The node format is an internal detail chosen for speed and memory. Users see only element components with semantic props, plugins and theme tokens. See [08](./08-model-and-api.md).

## Layers

```
┌───────────────────────────────────────────────────────────────┐
│ Public API: <Markdown>, components, plugins, theme tokens     │  ← stable contract
├───────────────────────────────────────────────────────────────┤
│ Renderer:  BlockList → memo(Block) → inline flattener         │
│            (reads node table → semantic element props)        │
├───────────────────────────────────────────────────────────────┤
│ Document model (private): flat node table + block index       │
├───────────────────────────────────────────────────────────────┤
│ ParserBackend:  markdown-it (JS)  |  md4c/cmark-gfm (JSI)     │
│                 both emit the same node table                 │
└───────────────────────────────────────────────────────────────┘
```

What is exported ([04](./04-api.md)):

- `parse(source, options) → MarkdownDocument`: an opaque, immutable handle, usable ahead of render time, in tests or on a server
- `<Markdown source | document>`, which parses (if needed) and renders with memoization
- `visit(doc, visitor)`: read-only traversal using the same semantic props as components
- `toMdast(doc)` from `/mdast`: opt-in interop with unified/remark

The node table, tokens and backends' internals are not exported.

---

## 1. Parser layer

### Backend interface

```ts
interface ParserBackend {
  name: string;
  /** Parse a full document into the node table. */
  parse(source: string, options: ParseOptions): NodeTable;
  /** Optional: parse a substring starting at a block boundary (streaming). Offsets are shifted by `offset`. */
  parseFrom?(source: string, offset: number, options: ParseOptions): NodeTable;
}
```

### Default backend: markdown-it

Why markdown-it:

- It's pure JS, so it runs in Expo Go, on the web, and in Jest with no native build.
- It claims 100% CommonMark compliance.
- It's 7–15× faster than micromark in our benchmark ([02](./02-benchmarks.md)).
- GFM tables and strikethrough are built in. The rest of GFM comes from plugins:

| GFM feature | Source |
|---|---|
| Tables | built in |
| Strikethrough | in-house rule replacing the built-in one, which needs `~~` ([phase-1 P1-11](./phase-1/decisions.md#p1-11-in-house-strikethrough-with-cmark-gfm-semantics)) |
| Task list items | `markdown-it-task-lists` or a small in-house rule |
| Autolinks (extended) | linkify-it with fuzzy matching, plus a thin GFM wrapper (filter, reject, trim). It passes 49/55 GFM autolink cases; the 6 edge cases are allowlisted ([phase-1 P1-1](./phase-1/decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps)). |
| Disallowed raw HTML (tagfilter) | in-house post-processing (small) |
| Footnotes (GitHub feature, not in the GFM spec; **on by default**) | `markdown-it-footnote` |

- **Its flat token stream suits a block list.** Converting it to our block model is a single linear pass, with no recursion over a deep tree. See [Why a flat token stream fits the block model](#why-a-flat-token-stream-fits-the-block-model) below.

marked was faster still in the benchmark. It's not the default because its CommonMark compliance is weaker and its extension model is less structured.

### Why a flat token stream fits the block model

#### What markdown-it produces

`md.parse()` doesn't return a tree. It returns a **flat array of tokens** in document order. Nesting is encoded in each token's fields, not by putting objects inside other objects:

- `nesting`: `1` opens a container (`*_open`), `-1` closes it (`*_close`), `0` is self-contained (`inline`, `fence`, `hr`, …).
- `level`: nesting depth. **`level === 0` marks a top-level block.**
- `map`: `[startLine, endLine)` source line range, set on open and self-contained block tokens.
- `children`: only on `inline` tokens. This is again a **flat** array of inline tokens, using the same `_open`/`_close` convention.

For this input:

```md
# Title

- one **bold**
  > quote
- two

Para
```

markdown-it 15 produces this token stream (captured from a real run):

```
level type               nesting map     inline children
0     heading_open        1     [0,1]
1     inline              0     [0,1]   text "Title"
0     heading_close      -1
0     bullet_list_open    1     [2,6]   ← top-level block #2 starts
1     list_item_open      1     [2,4]
2     paragraph_open      1     [2,3]
3     inline              0     [2,3]   text "one ", strong_open, text "bold", strong_close
2     paragraph_close    -1
2     blockquote_open     1     [3,4]
3     paragraph_open      1     [3,4]
4     inline              0     [3,4]   text "quote"
3     paragraph_close    -1
2     blockquote_close   -1
1     list_item_close    -1
1     list_item_open      1     [4,6]
…
0     bullet_list_close  -1             ← top-level block #2 ends
0     paragraph_open      1     [6,7]   ← top-level block #3 starts
1     inline              0     [6,7]   text "Para"
0     paragraph_close    -1
```

#### What this gives us

1. **Top-level block boundaries are already there.** Every token with `level === 0` and `nesting !== -1` starts a new top-level block, and its `map` gives that block's line range. We never have to search a tree to find the blocks we memoize and virtualize.

2. **Block ranges and identity cost almost nothing.**
   - A line-start offset table is built once per parse (native `indexOf` jumps between newlines).
   - It turns each block's `map` into `[start, end)` character offsets in O(1).
   - Identity needs no hashing: the renderer compares block source text natively, plus small context strings ([P1-9](./phase-1/decisions.md#p1-9-block-identity-by-source-text-plus-context-and-index-keys)).

3. **The conversion is one forward loop with an explicit stack.** It appends rows to the flat node table ([§2](#2-document-model)). The token stream is already in document order, so node ids come out in document order too, and each top-level block occupies a contiguous id range.

   ```ts
   function tokensToTable(tokens: Token[], source: string, t: TableBuilder): void {
     const lineOffsets = computeLineOffsets(source); // once per parse
     const stack: number[] = [ROOT];                 // node ids of open containers

     for (const tok of tokens) {                     // single pass, O(tokens)
       const parent = stack[stack.length - 1];
       if (tok.nesting === 1) {                      // *_open → container node
         const id = t.add(typeOf(tok), parent, attrsOf(tok));
         if (tok.level === 0) t.beginBlock(id, lineOffsets[tok.map![0]], lineOffsets[tok.map![1]]);
         stack.push(id);
       } else if (tok.nesting === -1) {              // *_close
         stack.pop();
       } else if (tok.type === 'inline') {           // inline children: same open/close pattern
         addInline(tok.children!, parent, t);        // runs of text merged into one string row
       } else {                                      // fence / hr / html_block … → leaf node
         const id = t.add(typeOf(tok), parent, attrsOf(tok), tok.content);
         if (tok.level === 0) t.beginBlock(id, lineOffsets[tok.map![0]], lineOffsets[tok.map![1]]);
       }
     }
     t.finish(blocks, source, context);              // block index + identity context (P1-9)
   }
   ```

   - Each token is visited exactly once, so the cost is linear in the number of tokens. On the 97 KB benchmark document, this costs about 2–3 ms on top of a 77 ms parse with no JIT ([08](./08-model-and-api.md#measurements)).
   - No object is created per node (only typed-array writes and string pushes), nothing is mutated after the build, and no `parentStack` arrays are copied.

#### Why this is better than the current approach

| | Today (micromark → mdast → recursive walk) | Proposed (markdown-it tokens → linear pass) |
|---|---|---|
| Passes over the document | micromark builds events, `mdast-util-from-markdown` builds a tree, then 2 transform walks (refs, keys) and a recursive render walk | Parse, then one linear conversion pass |
| Finding top-level blocks | Implicit in `root.children`, with positions read from nested `position` objects | `level === 0` tokens, with line ranges in `map` |
| Traversal | Recursive, one JS call frame per nesting level | Iterative, with an explicit stack |
| Per-node allocation | An mdast object per node, plus a `[node, ...parentStack]` copy at every node | None: typed-array rows |
| Retained memory (97 KB doc) | 2.10 MB | 0.38 MB |
| Deeply nested input (e.g. 10,000 `>` characters) | Can overflow the JS call stack, and on a phone the limit may be lower than in Node | Stack depth is just an array length, so it can't overflow |

#### Benefits for streaming and virtualization

- **Streaming ([05](./05-streaming.md)):**
  - The tail re-parse needs to know where the last top-level block starts. That's `blockStart` of the last open block.
  - Because block ids are contiguous, splicing means truncating the table at that block's first node id and appending the re-parsed tail with the same loop, with offsets shifted.
- **Virtualization:**
  - An off-screen block costs only its table rows. React elements and props are created only when the block is first rendered.
  - Keeping raw tokens around for lazy inline conversion was considered and rejected: retained tokens cost more memory than the whole table ([08](./08-model-and-api.md#measurements)).

#### Caveats

- `map` is in **lines**, not characters, so the line-offset table is required. Inline tokens have no `map`. That's fine, because identity is only needed at block granularity.
- Close tokens have `map === null`. A block's range comes from its opening token.
- Plugins can emit custom tokens. Each plugin declares `nodes: { Name: { token, kind, from } }` ([04](./04-api.md#plugins)), which registers a `tokenType → node type + attrs` mapping. Unknown token types fall back to a generic node rendered as text, so content is never dropped silently.

### Optional backend: native via JSI (phase 4)

- **md4c** (C): very fast, passes the CommonMark spec, supports tables, strikethrough and task lists. Its autolinks are "permissive" and differ from the GFM spec, and it has no footnotes. Used by `react-native-nitro-markdown` and `react-native-enriched-markdown`.
- **cmark-gfm** (C): GitHub's reference GFM implementation, including footnotes. Slower than md4c, but the most exact compliance.

Rule for the boundary: **don't return JSON or build one JS object per node over JSI.** Encode the result as a single `ArrayBuffer`:

```
header | node table (type u8, flags u8, parent u32, firstChild u32, next u32, textStart u32, textLen u32, attrs u32) | string table (UTF-16)
```

This is **the same layout as the JS backend's node table** ([§2](#2-document-model)). The JS side wraps the buffer in typed-array views with no decode step, and one renderer serves both backends. This is the main way to keep the native speedup from being lost to transfer cost.

### Parse options

```ts
interface ParseOptions {
  preset?: 'gfm' | 'commonmark';   // default 'gfm': tables, task lists, strikethrough,
                                   // autolinks, tagfilter, footnotes (each a built-in plugin)
  plugins?: MarkdownPlugin[];      // added on top of the preset
  html?: 'safe' | 'text' | 'strip' | { allow: HtmlTag[] }; // default 'safe' (see Raw HTML below)
  maxInputLength?: number;         // guard against pathological input
}
```

---

## 2. Document model

The model is **private**. The full investigation (options, measurements, decision) is in [08](./08-model-and-api.md).

```ts
// internal, not exported
interface NodeTable {
  count: number;
  type: Uint8Array;          // NodeType enum (built-in + plugin-registered)
  flags: Uint8Array;         // ordered, tight, checked, header cell, …
  parent: Int32Array;
  firstChild: Int32Array;
  nextSibling: Int32Array;
  text: Int32Array;          // index into `strings`, -1 if none
  attr: Int32Array;          // index into `attrs` (sparse: href, title, language, align, …), -1 if none
  strings: string[];
  attrs: NodeAttrs[];
  // block index: top-level blocks, contiguous id ranges
  blocks: Int32Array;        // first node id of each top-level block
  blockStart: Int32Array;    // source offsets
  blockEnd: Int32Array;
  blockContext: string[];    // per block: values derived from outside it (heading slugs, …)
  // block identity (P1-9)
  source: string;            // the parsed source (a reference, not a copy)
  context: string;           // document context: preset, html mode, plugins, reference definitions
}

// public: an opaque handle
interface MarkdownDocument { readonly blockCount: number; /* no node access */ }
```

- **Why a flat table:**
  - About 3× less retained memory than an object tree, and 5.5× less than today's mdast.
  - About 1 ms extra build cost.
  - Same layout as the native backend's buffer.
  - Trivial splicing for streaming.

  The numbers are in [08](./08-model-and-api.md#measurements).
- **References are resolved while parsing.** A reference link becomes a link node when its definition exists. Otherwise it stays as text, as CommonMark requires. No separate transform pass.
- **Identity exists only at block granularity** ([P1-9](./phase-1/decisions.md#p1-9-block-identity-by-source-text-plus-context-and-index-keys)).
  - **Key:** the block's index. Not its offset: editing a block moves the offsets of every later block, and offset-based keys would remount them all.
  - **Unchanged** (`isSameBlock`): same document context, same block context, same source text (lengths first, then a native string compare). Source text alone isn't enough: reference definitions, de-duplicated heading slugs and parse options come from outside a block.
  - Inline elements are keyed by position within their block, which is safe because a block's inline content is always rebuilt as a unit.
- **Immutable after build.** A streaming update produces a new table that shares the unchanged prefix arrays where possible (typed-array `subarray` views).
- **Reversible.** Because nothing outside the renderer reads the table, it could be swapped for an object tree if device profiling ever favours that, without an API change.

Why only top-level blocks get identity: that's the granularity of memoization and virtualization. Finer granularity costs more in bookkeeping than it saves.

---

## 3. Rendering layer

### BlockList

```tsx
function BlockList({ doc, ctx, virtualize }) {
  if (virtualize) {
    return <FlashList data={doc.blocks} keyExtractor={b => b.key}
                       renderItem={({ item }) => <Block block={item} ctx={ctx} />} />;
  }
  return <View>{doc.blocks.map(b => <Block key={b.key} block={b} ctx={ctx} />)}</View>;
  // `doc.blocks` here is a lightweight view over the table's block index: { index, id, key }
}
```

- `virtualize` defaults to off. Chat messages are short, and nesting a virtualized list inside the host app's own `FlatList` is a footgun.
- FlashList is an optional peer dependency, with a fallback to `FlatList`.

### Block (memoized)

```tsx
const Block = memo(
  BlockImpl,
  (a, b) => a.ctx === b.ctx && isSameBlock(a.table, a.index, b.table, b.index)
);
```

- `ctx` holds the resolved theme, the merged component map (defaults → plugins → `components` prop), the event handlers and other options. It's created once per change of those props, inside `useMemo`, so its identity is stable.
- A changed or streamed block re-renders. Every other block bails out at the `memo` check.

### Inline flattener

Inline content (`text`, `strong`, `emphasis`, `delete`, `inlineCode`, `link`, `break`, `image`) renders into **one `<Text>` per block**:

```tsx
<Text style={theme.paragraph.text}>
  Plain text is a raw string,{' '}
  <Text style={theme.strong.text}>bold</Text>
  {' and '}
  <Text style={theme.link.text} onPress={…}>a link</Text>
</Text>
```

- **Adjacent plain-text nodes are merged into one string.**
- **Under Fabric, a block of nested Text is one native view** (`ParagraphComponentView` on iOS, one `Spannable` on Android). The remaining cost is React elements and C++ shadow nodes, and this keeps both to a minimum.
- **Inline images** render as an inline `<Image>` inside Text when they have explicit dimensions. Otherwise the paragraph is split and the image renders as a block.

#### Inline views

Elements declared `inlineView: true` (plugin nodes, or built-ins wrapped with `inlineView()`) render a `View` nested inside the paragraph's `<Text>`. React Native lays these out as inline attachments on iOS, Android and the web.
- **No up-front cost.** The flag is known when the table is built, so the renderer doesn't detect it at runtime. Paragraphs without declared elements take the plain-text path.
- **Baseline alignment.** Inline attachments don't align to the text baseline automatically, so declared components receive the paragraph's font metrics to offset themselves.
- **Undeclared Views.** An undeclared inline component that returns a `View` triggers a dev-mode warning.
- **Building element props from the table.** For each node, the renderer reads `type`, `flags` and `attr` and builds that element's **semantic props** (`{ level }`, `{ href, title }`, `{ code, language }`). It then calls the component from the merged map. Props are primitives, so user components wrapped in `React.memo` can bail out.

### Default elements

The full catalog with props is in [04](./04-api.md#element-catalog).

| Element | Default rendering |
|---|---|
| `Heading` / `Paragraph` | One `<Text>` via the inline flattener. `Heading` gets `accessibilityRole="header"`. |
| `List` / `ListItem` | `View` rows with a marker column. Ordered markers use `start`. Task items render a checkbox glyph (read-only by default, interactive with `onTaskToggle`). Nesting depth comes from context, not a parent-stack copy. |
| `Blockquote` | `View` with a container style, rendering its child blocks recursively (not memoized individually). |
| `CodeBlock` | `ScrollView horizontal` + one `<Text>`. Syntax highlighting is a plugin (or a user `CodeBlock`), loaded lazily and outside the core bundle. |
| `Table` / `TableRow` / `TableCell` | `ScrollView horizontal`. Column widths are computed once per table (max cell intrinsic width, capped) and cached by block hash. |
| `Divider` | `View` hairline. |
| `Image` (block) | `<Image>` with a cached aspect ratio (`Image.getSize`, memoized by URL). A placeholder box holds the space, to avoid layout jumps. |
| `HtmlBlock` / `HtmlInline` | Allowlisted inline tags become elements. Everything else is literal text ([Raw HTML](#raw-html)). |
| `FootnoteReference` / `FootnoteDefinition` | Superscript links. Definitions are collected into a footer section. |

### Raw HTML

Default `html="safe"`. markdown-it emits each inline HTML tag as a separate `html_inline` token (`<sup>` and `</sup>` are two tokens). The converter pairs them:
- An allowlisted opening tag pushes an element node (`Superscript`, `Underline`, …) onto the stack, and the matching closing tag pops it.
- `<br>` becomes a `LineBreak`.
- Unmatched, unknown or attribute-dependent tags become text nodes holding the literal HTML. Content is never dropped.
- `html_block` tokens (`<div>`, `<details>`, …) are never interpreted. They become `HtmlBlock` nodes rendered as text.

This happens inside the single token → table pass, so it costs nothing extra. GFM's tagfilter (disallowed raw HTML) still applies first. The full subset is in [04](./04-api.md#raw-html).

### Theme

A theme has two levels ([04](./04-api.md#theme)):

1. **Tokens:** `colors`, `fonts`, `fontSize` (base + scale), `lineHeight`, `spacing`, `radius`. Most apps change only these.
2. **Element overrides:** `elements: { [Element]?: { text?: TextStyle; container?: ViewStyle } }`, for full control.

- **Text and container styles are separate namespaces**, which removes the `_VIEW_SAFE_` duplication and its bug class.
- **Element keys are a closed union** (the built-in elements plus those registered by plugins), so typos fail to compile.
- **The default theme is built once at module load** with `StyleSheet.create`. User themes are deep-merged once per change of the `theme` value (with a `useMemo`/WeakMap cache).
- **Base text style cascades through context**, so a link inside a heading inherits the heading's font size.
- **Light and dark themes ship with the library.** Portable font weights only (`'400'`, `'600'`, `'700'`).

---

## 4. Cross-cutting concerns

### Links and security

- One `onLinkPress(href, info) => boolean | void`. Returning `false` cancels the default `Linking.openURL`, whose errors are caught.
- URL sanitization by default: `javascript:`, `data:` (except images, when allowed) and `vbscript:` are rejected.
- `images: 'allow' | 'deny' | { allowHosts: string[] }` for untrusted content such as LLM output.
- A `maxInputLength` guard, plus a document in the CommonMark pathological-input tests ([06](./06-testing.md)).

### Accessibility

- No hardcoded `maxFontSizeMultiplier`. It's exposed as a prop.
- `accessibilityRole` for headers, links, images (alt text) and list structure.
- Text selection works per block with `selectable` on each block's `<Text>`. Selection across blocks isn't supported, which is the same limit as other React Native renderers.

### Bundle size

- The core is markdown-it plus its plugins. Its minified size compared with the current micromark + mdast + GFM stack still needs measuring in phase 1. Highlighting and the native backend are separate entry points (`/highlight`, `/native`).
- `sideEffects: false` lets bundlers tree-shake unused default elements and plugins.
- `toMdast` lives in `/mdast`, so the mdast types and converter cost nothing unless imported.

### Package layout

```
src/
  parse/        backend interface, markdown-it backend, token → table conversion
  model/        node table, builder, block index, block identity (private)
  plugins/      definePlugin, built-in GFM plugins (tables, taskLists, strikethrough, autolinks, footnotes, tagfilter)
  render/       BlockList, Block, inline flattener, table → props, default elements
  theme/        tokens, createTheme, light/dark themes, context
  api/          parse, visit, public types
  mdast/        toMdast (separate entry point)
  stream/       useMarkdownStream, tail re-parse
  components/   <Markdown>
  native/       (phase 4) JSI backend
```
