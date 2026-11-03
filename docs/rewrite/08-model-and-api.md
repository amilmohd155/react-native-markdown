# 08 · Data model & public API: options and decision

Earlier drafts assumed **mdast-shaped nodes** so that v0.x render rules and users' knowledge would carry over. The rewrite is allowed to break the API, so that assumption has been revisited. This document is the investigation and the resulting decision. Docs [03](./03-architecture.md) and [04](./04-api.md) follow it.

## TL;DR

1. **Split the internal model from the public API.** Users never see the parser's node format. That frees the internal representation to be chosen purely for speed and memory, and lets it change later (e.g. JS → native backend) without breaking anyone.
2. **Internal model: a flat, struct-of-arrays node table.** It is about 3× smaller in memory than an object tree and 5.5× smaller than today's mdast, and costs only about 1 ms more to build. It's also the same layout the native backend would hand over the JSI boundary, so both backends feed one renderer.
3. **Public API: element components with semantic, primitive props** (`Heading { level }`, `Link { href }`, `CodeBlock { code, language }`). They replace `renderRules({ node, styles, parentStack, extras })`. Plus a **plugin** system that bundles syntax, element and theme, and a **token-based theme**.
4. **mdast is kept only as an opt-in export** (`toMdast(doc)` in a separate entry point) for people who want the unified/remark ecosystem.

---

## Part 1: Internal data model

### What the model has to do

- Be built from markdown-it tokens (JS backend) **and** from a native parser's output (phase 4).
- Give top-level blocks a stable key and a content hash, for memoization.
- Allow cheap splicing at a block boundary, for streaming.
- Stay small in memory. Chat apps keep **many** documents alive (message history).
- Be fast to read during render.

### Options

| Option | Description |
|---|---|
| **A. mdast object tree** | Today's format: `{ type, children: [...], position: {...} }` per node |
| **B. Own object tree** | Same shape as A, but our own field names and no `position` objects |
| **C. Flat node table** | Struct of arrays: `type: Uint8Array`, `parent/firstChild/nextSibling: Int32Array`, plus a string table and a sparse attribute table |
| **D. Render straight from tokens** | No model. Renderers read markdown-it tokens directly |

D is rejected without measuring. It ties the renderer and any public API to markdown-it's token format, which the native backend can't reproduce cheaply, and retaining tokens costs more memory than any other option (see below).

### Measurements

Script: [`bench/model.mjs`](../../bench/model.mjs). Fixture: the same ~97 KB GFM document used in [02](./02-benchmarks.md), with 6,421 nodes. Node 22. For memory, 20 documents were kept alive, then the retained heap was measured after a forced GC (`--expose-gc`), including `ArrayBuffer`s.

**Build time** (median of 11 runs):

| Step | JIT | `--jitless` |
|---|---|---|
| markdown-it parse (tokens) | 21.0 ms | 76.6 ms |
| + tokens → object tree (B) | +0.5 ms | +1.8 ms |
| + tokens → flat table (C) | +1.8 ms | +2.7 ms |
| *for reference: micromark → mdast (A, current)* | *201.8 ms* | *663.4 ms* |

**Retained memory per document:**

| Kept alive | MB per 97 KB doc | vs. flat table |
|---|---|---|
| mdast tree (A, current) | 2.10 | 5.5× |
| raw markdown-it tokens (D) | 2.22 | 5.8× |
| object tree (B) | 1.23 | 3.2× |
| **flat table (C)** | **0.38** | 1× |

### Reading the results

- **Speed doesn't decide this.** Converting tokens to either B or C costs 1–3 ms against a 77 ms parse with no JIT. The parser dominates. The model only adds a few percent.
- **Memory does.** For a chat with 200 messages of about 5 KB each (1 MB of markdown in total), the measured ratios scale to roughly:
  - about 22 MB for mdast,
  - about 13 MB for an object tree,
  - about **4 MB** for the flat table.

  On low-end Android, where the JS heap is shared with the rest of the app, that difference is significant. Most of the table's remaining memory is the text strings themselves.
- **The flat table matches the native boundary format.** The phase 4 native backend has to return a binary node buffer anyway ([03](./03-architecture.md#optional-backend-native-via-jsi-phase-4)). If the JS backend produces the same table, there is **one renderer, one test suite and one streaming implementation** for both backends, and no decode step on the native path.
- **Streaming splices are trivial.** Blocks are contiguous ranges of node ids, so "replace everything from the last open block onward" means truncating the arrays to that block's first id and appending the re-parsed tail.

These are Node measurements. The ratios between options should hold on Hermes, but absolute numbers will differ (see [02](./02-benchmarks.md)).

### Decision

**C, the flat node table, kept private.**

```ts
// internal, not exported
interface NodeTable {
  count: number;
  type: Uint8Array;          // NodeType enum
  flags: Uint8Array;         // e.g. ordered, tight, checked, header-cell
  parent: Int32Array;
  firstChild: Int32Array;
  nextSibling: Int32Array;
  text: Int32Array;          // index into `strings`, -1 if none
  attr: Int32Array;          // index into `attrs` (sparse: url/title/lang/align…), -1 if none
  strings: string[];
  attrs: NodeAttrs[];
  blocks: Int32Array;        // node ids of top-level blocks
  blockStart: Int32Array;    // source offsets of each block
  blockEnd: Int32Array;
  blockHash: Uint32Array;
}
```

Because the table is private, this decision can be reversed. If profiling on a device shows the table's indirection costs more at render time than its memory saves, switching to B doesn't change the public API. That reversibility comes from the API decision below.

---

## Part 2: Public API

### Problems with the v0.x API (and with simply porting it)

```ts
renderRules: { heading: ({ node, styles, children, parentStack, extras }) => … }
```

1. **It exposes the internal model.** Users read `node.depth` and `node.url`, so the parser's format is frozen into the public contract. Choosing the flat table, or any later change, would break it.
2. **Props aren't memo-friendly.** `node` objects, the whole `styles` map, `parentStack` arrays and an untyped `extras` bag change identity on every parse. A user's `React.memo` component can never bail out.
3. **Syntax and rendering are configured separately.** `extensions` (parser) and `renderRules` (renderer) aren't linked. Adding "math" means wiring a micromark extension, an mdast extension and a render rule by hand, and nothing checks they agree.
4. **Styling means overriding every element.** There's no way to say "my link color is X and my body font is Y" once.
5. **Some names are AST jargon.** `depth`, `url`, `lang`, `delete`, `thematicBreak` aren't the words app developers use.

### Options

| Option | Example | Verdict |
|---|---|---|
| **Keep render functions over nodes** (v0.x style, typed) | `heading: ({ node }) => <H level={node.depth}/>` | Couples users to the internal model. Rejected. |
| **Element components with semantic props** | `Heading: ({ level, children, style }) => …` | **Chosen.** Familiar (react-markdown, MDX), typed, and memo-friendly. |
| **Slot/variant API** (style-only, no custom components) | `variants={{ heading: 'serif' }}` | Too limited for code blocks, images, mentions. Possible later as sugar over the theme. |
| **Fully headless** (hooks only, user renders everything) | `const doc = useMarkdown(src); doc.blocks.map(...)` | Kept as a lower-level escape hatch, not the main API. |

### The chosen design

#### 1. Element components

```tsx
<Markdown
  source={text}
  components={{
    Heading: ({ level, children, style }) => <Text style={[style, myHeading]}>{children}</Text>,
    CodeBlock: ({ code, language }) => <Highlighter code={code} language={language} />,
    Link: ({ href, children, style }) => <MyLink to={href} style={style}>{children}</MyLink>,
  }}
/>
```

- **Props are primitives plus `children` and `style`.** `level`, `href`, `language` and `checked` are strings, numbers or booleans. A user's `memo(Heading)` bails out whenever the block is unchanged.
- **Names are semantic and React-friendly.** `href`, `src`, `language`, `level`, `Strikethrough`, `ThematicBreak` → `Divider`. The full catalog is in [04](./04-api.md#element-catalog).
- **`style` is the resolved theme style for that element**, already split into text and container styles. Users merge it or replace it.
- **Wrapping replaces `defaultRender`.** The default components are exported (`import { defaults } from '…'`), so `CodeBlock: (p) => p.language === 'mermaid' ? <Mermaid …/> : <defaults.CodeBlock {...p}/>` is ordinary React.
- **Plain text is never a component.** Text runs are raw strings, so the single-`<Text>`-per-block optimization ([03](./03-architecture.md#inline-flattener)) holds. Text is styled through the theme. Inline components (`Strong`, `Link`, …) must return Text-compatible output, unless the element is declared `inlineView: true`, in which case it may return a `View` rendered as an inline attachment. Undeclared Views trigger a dev warning.

#### 2. Plugins bundle syntax, element and theme

```ts
const math = definePlugin({
  name: 'math',
  syntax: { markdownIt: (md) => md.use(texmath), native: 'math' },   // parser side
  nodes: {
    InlineMath: { kind: 'inline', inlineView: true, from: (tok) => ({ tex: tok.content }) }, // rendered as a View (e.g. KaTeX)
    BlockMath:  { kind: 'block',  from: (tok) => ({ tex: tok.content }) },
  },
  components: { InlineMath: KatexInline, BlockMath: KatexBlock },  // default rendering
  theme: { BlockMath: { container: { marginVertical: 12 } } },
});

<Markdown source={text} plugins={[math]} components={{ BlockMath: MyMath }} />
```

- **One unit adds a feature end to end.** Types flow from `nodes` to `components`, so `components.BlockMath` is checked against `{ tex: string }`.
- **GFM itself is a plugin set** (`tables`, `taskLists`, `strikethrough`, `autolinks`, `footnotes`, `tagfilter`). The default `preset="gfm"` includes them all, which is how "GFM by default" works. `preset="commonmark"` drops them to shrink the bundle or enforce strict CommonMark.
- **Third-party features have one install pattern:** mentions, emoji shortcodes, admonitions, math, mermaid.
- **The native backend is covered.** `syntax.native` names a built-in native extension. A plugin without it marks the document as JS-backend only, and the library falls back automatically.

#### 3. Theme tokens, then element overrides

```ts
const theme = createTheme({
  colors: { text: '#1c1c1c', muted: '#666', link: '#1e6fff', codeBg: '#f4f4f5', border: '#e4e4e7', quoteBar: '#3840ba' },
  fonts: { body: undefined, heading: undefined, mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  fontSize: { base: 16, scale: 1.2 },          // heading sizes derived: base * scale^(6 - level)
  lineHeight: 1.5,
  spacing: { block: 12, listIndent: 20 },
  radius: { code: 6 },
  elements: { Heading: (level) => ({ text: { fontWeight: level <= 2 ? '700' : '600' } }) },  // overrides
}, lightTheme);
```

- **Most apps change 3–5 tokens instead of overriding 20 elements.**
- **Element overrides are still available** for full control.
- **Light and dark presets ship with the library.** `theme="auto"` follows `useColorScheme()`.
- **Resolved once per change of the theme value** into `StyleSheet` entries, then shared through context ([03](./03-architecture.md#theme)).

#### 4. Lower-level and interop APIs

| API | Purpose |
|---|---|
| `parse(source, opts) → MarkdownDocument` | An opaque, immutable handle. Cacheable and testable. Parse ahead of time, e.g. on message arrival. |
| `<Markdown document={doc}/>` | Render a pre-parsed document, which skips parsing at render time. |
| `visit(doc, { Heading(props, path) {…} })` | Read-only traversal using the same semantic props as components, e.g. to build a table of contents or extract links. |
| `toMdast(doc)` (`/mdast` entry) | Convert to mdast for unified/remark tooling. Tree-shaken away unless imported. |
| `useMarkdownStream()` | Streaming ([05](./05-streaming.md)). |

### What this gains compared with the mdast-shaped API

| | mdast-shaped render rules (earlier draft) | Components + plugins + tokens (decision) |
|---|---|---|
| Internal model can change (table, native) | ❌ breaking change | ✅ private |
| User `memo` components bail out | ❌ node and styles objects change identity | ✅ primitive props |
| Adding a syntax feature | 2–3 unrelated configs | 1 plugin, type-checked end to end |
| Restyling the whole document | override many elements | change a few tokens |
| Vocabulary | AST (`depth`, `url`, `lang`) | app (`level`, `href`, `language`) |
| Familiar to React developers | partly | ✅ (react-markdown `components`, MDX) |
| unified/remark ecosystem | native | via `toMdast` (opt-in) |
| Migration effort from v0.x | lower | higher, with a shim and a codemod-able mapping in [04](./04-api.md#migration-from-v0x) |

## Decisions on the API details

Decided on 2026-11-03 (full list in [07](./07-roadmap.md#decisions)):

1. **Component key casing: PascalCase** (`Heading`, `CodeBlock`), as for MDX. This also applies to plugin `nodes`, theme `elements` and `visit()` keys.
2. **One `Heading` with a `level` prop**, not `Heading1…6`. Per-level styling goes through the theme.
3. **`visit()` is read-only.** Transforms happen only at parse time, through plugins, so documents stay immutable.
4. **Inline Views are allowed if declared** (`inlineView: true`). See [03](./03-architecture.md#inline-views).

Still open: whether the flat table's render-time cost is acceptable on a device. That's a phase 1 measurement, and falling back to an object tree doesn't change the API.
