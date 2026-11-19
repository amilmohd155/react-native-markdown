# 04 · Public API (proposed)

The reasoning behind this design, including the options rejected, is in [08 · Data model & public API](./08-model-and-api.md). In short, users work with **elements with semantic props**, **plugins** and **theme tokens**. They never see the parser's internal node format.

## `<Markdown>`

```tsx
<Markdown
  source={text}
  theme={theme}                          // tokens + element overrides, or 'light' | 'dark' | 'auto'
  components={{ CodeBlock: MyCodeBlock }} // override any element
  plugins={[math]}                        // added to the preset
  onLinkPress={(href) => { router.push(href); return false; }}
/>
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `source` | `string` | — | Either `source` or `document` is required |
| `document` | `MarkdownDocument` | — | Pre-parsed with `parse()`. Skips parsing at render time. |
| `preset` | `'gfm' \| 'commonmark' \| { base: 'gfm', exclude: GfmPluginName[] }` | `'gfm'` | GFM is a set of built-in plugins, footnotes included |
| `plugins` | `MarkdownPlugin[]` | `[]` | Added on top of the preset |
| `components` | `Partial<Components>` | built-in | See the [element catalog](#element-catalog) |
| `theme` | `ThemeInput \| 'light' \| 'dark' \| 'auto'` | `'auto'` | See [Theme](#theme) |
| `onLinkPress` | `(href, info) => boolean \| void` | opens with `Linking` | Called first for every link. Return `false` to cancel the default. The default opens only `http`, `https`, `mailto`, `tel` and relative URLs, so custom-scheme deep links need this handler ([P1-3](./phase-1/decisions.md#p1-3-url-sanitization-layers)). Errors from `openURL` are caught. |
| `onImagePress` | `(src, info) => void` | none | |
| `onTaskToggle` | `({ index, checked, text }) => void` | none | Called after a tap flips a task checkbox ([P3-16](./phase-3/decisions.md#p3-16-library-owned-task-toggle-with-an-index-checked-text-payload)). `index` is global and 0-based; `text` is the item's own plain text. The library owns the box state (cleared when `source` changes); persisting is the app's job. |
| `enableTaskListItemToggle` | `boolean` | `true` | `false`: read-only checkboxes, no callback. Boxes are also inert while a stream runs ([P3-18](./phase-3/decisions.md#p3-18-interactive-by-default-with-enabletasklistitemtoggle-inert-while-streaming)). |
| `onFootnotePress` | `(label, info, { offset }) => void \| false` | none | Makes footnote references and back-links pressable. `info = { index, direction: 'reference' \| 'definition', reference }`: where to go, and which reference (1-based). `offset`: with `footnotes.target: 'definition'`, the definition's y inside the section block (`number \| undefined`, [P3-15](./phase-3/decisions.md#p3-15-opt-in-exact-definition-jump-and-highlight)). In `scroll` and `virtualize` the container then scrolls there (references to the footnote section, back-links to their reference); return `false` to skip that. In the default `View` the app scrolls, and so does a list of your own with `useMarkdownBlocks` (`onFootnoteScrollTo`, [P3-14](./phase-3/decisions.md#p3-14-usemarkdownblocks-takes-onfootnotescrollto-for-the-apps-own-list)) ([P1-15](./phase-1/decisions.md#p1-15-footnote-navigation-through-an-onfootnotepress-handler), [P3-9](./phase-3/decisions.md#p3-9-onfootnotepress-runs-first-and-can-skip-the-jump)). Not called, and the footnote section not rendered, while a stream runs until `done()` ([P3-12](./phase-3/decisions.md#p3-12-the-footnote-section-and-its-links-wait-for-done)). |
| `footnotes` | `{ labels?, backLinkMark?, target?, highlight? }` | English labels, `↩` | `labels`: `{ reference(index), backLink(index, reference) }`, the accessibility labels of references ("Footnote 1") and back-links ("Back to reference 1") ([P3-11](./phase-3/decisions.md#p3-11-footnote-labels-for-references-and-back-links)). `backLinkMark`: `(reference, total) => string`, the visible text of a back-link; `reference` is which reference it returns to (1-based), `total` how many the footnote has, default `↩`, then `↩²`, `↩³`… ([P3-13](./phase-3/decisions.md#p3-13-footnote-back-links-are-inline-nodes-at-the-end-of-the-definition)). `target`: `'section'` (default) or `'definition'`: a reference press scrolls to its own definition. `highlight`: `true` or `{ color?, duration? }` flashes the definition (reference press) or reference (back-link press); off by default ([P3-15](./phase-3/decisions.md#p3-15-opt-in-exact-definition-jump-and-highlight)). The object may be inline; the functions inside must be module level. |
| `scroll` | `boolean \| ScrollOptions` | `false` | `<Markdown>` renders its own `ScrollView` instead of a `View` (all blocks mounted). Options: `header`, `footer`, `style`, `contentContainerStyle`, `onScroll`, `scrollEventThrottle`, `autoScroll` (follow-tail: `true` or `{ threshold }` in pixels, default 40), `ref` (a [`MarkdownListRef`](#markdownlistref)), `componentRef` (the scroll component's instance, e.g. Reanimated's `useAnimatedRef()`), `jumpToFootnotes` (default `true`; `false` leaves footnote presses to `onFootnotePress`, [P3-8](./phase-3/decisions.md#p3-8-built-in-footnote-jump-in-the-owned-containers)), and `component`, a stable scroll-view type (e.g. `Animated.ScrollView`) that forwards `ref` ([P3-2](./phase-3/decisions.md#p3-2-markdown-stays-a-view-scroll-and-virtualize-opt-in-to-a-scroll-container), [P3-4](./phase-3/decisions.md#p3-4-scroll-and-virtualize-take-typed-options-with-a-stable-list-component-slot), [P3-5](./phase-3/decisions.md#p3-5-follow-tail-implemented-in-the-library-the-same-on-scrollview-and-flatlist)). |
| `virtualize` | `boolean \| VirtualizeOptions` | `false` | For long standalone documents: the owned container becomes a `FlatList` (implies `scroll`). Options: those of `scroll` (including `autoScroll`, `ref` and `componentRef`), `initialNumToRender` (default 10), `windowSize` (default 11), and `component`, a stable list type (e.g. `Animated.FlatList`); `removeClippedSubviews` stays off. With `scroll` options too, a field set here wins. For FlashList or full control use the block hook ([P3-3](./phase-3/decisions.md#p3-3-a-headless-block-hook-underneath-scroll-and-virtualize)). |
| `html` | `'safe' \| 'text' \| 'strip' \| { allow: HtmlTag[] }` | `'safe'` | `'safe'` renders an allowlist of tags as elements and shows the rest as text. See [Raw HTML](#raw-html). |
| `images` | `'allow' \| 'deny' \| { allowHosts: string[] }` | `'allow'` | Use `'deny'` or an allowlist for untrusted content. A refused image renders as its alt text. `allowHosts` entries are exact hosts or `*.example.com` (subdomains only); relative and `data:` images don't match. See [P1-21](./phase-1/decisions.md#p1-21-images-policy-semantics). |
| `softBreak` | `'space' \| 'newline'` | `'space'` | How soft line breaks render. `'space'` matches browsers and GitHub ([P1-2](./phase-1/decisions.md#p1-2-soft-line-breaks)). |
| `scriptFallback` | `'smaller' \| 'raised'` | `'smaller'` | Superscript/subscript content with no Unicode form (`TM`, `[1]`). Unicode-convertible content (`mc²`, `H₂O`) always renders as Unicode characters. `'raised'` uses inline views, with accessibility and styling costs ([P1-17](./phase-1/decisions.md#p1-17-unicode-characters-for-superscript-and-subscript-by-default)). |
| `selectable` | `boolean` | `false` | Text selection within each block |
| `maxFontSizeMultiplier` | `number` | unset | Accessibility |
| `backend` | `ParserBackend` | JS (markdown-it) | `nativeBackend` from `/native` in phase 4 |

Memoization is internal. Callers don't need to `useMemo` the `theme`, `components` or `plugins` objects. They're compared shallowly, key by key, to decide whether the render context needs rebuilding.

### `MarkdownListRef`

The `ref` option of `scroll` and `virtualize`, the same on both: `scrollToEnd(options?)` (also resumes `autoScroll`), `scrollToOffset(offset, options?)` and `scrollToBlock(index, options?)`. Options: `animated` (default `true`); `scrollToBlock` adds `viewPosition` (0 top, 0.5 middle, 1 bottom) and `viewOffset`. The index is clamped into range; no blocks does nothing. With `scroll`, a `ref` (or the footnote jump of a document with footnotes) wraps each block in a `View` to record its offset, so the jump is exact once laid out; with `virtualize`, an unmeasured block (and `scrollToEnd` on a list not yet measured to its end) is reached through an estimate and retries that continue while the list measures further; a drag cancels them. `scrollToOffset` and `scrollToBlock` pause `autoScroll` unless they land at the end.

### `useMarkdownBlocks`

```tsx
const { data, keyExtractor, renderItem, getItemType } = useMarkdownBlocks({ document, theme });
<FlashList data={data} keyExtractor={keyExtractor} renderItem={renderItem} getItemType={getItemType} />

// Footnote jump in your own FlatList: the app scrolls, and retries when the target is not measured yet.
const ref = useRef<FlatList>(null);
const blocks = useMarkdownBlocks({
  document,
  onFootnoteScrollTo: (index) => ref.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }),
});
<FlatList ref={ref} data={blocks.data} keyExtractor={blocks.keyExtractor} renderItem={blocks.renderItem}
  onScrollToIndexFailed={({ index, averageItemLength }) => {
    ref.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
    setTimeout(() => ref.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }), 100);
  }} />
```

Takes one options object: `source` or `document` plus the other props of `<Markdown>` except `scroll` and `virtualize`, and `onFootnoteScrollTo(index, label, info, { offset })` ([P3-14](./phase-3/decisions.md#p3-14-usemarkdownblocks-takes-onfootnotescrollto-for-the-apps-own-list)): a footnote press runs `onFootnotePress` first (`false` skips), then calls it with the block to scroll to (the section for a reference, the reference's block for a back-link). `index` is the block index, which is also the position in `data`; add your own offset when one list shows several documents. `offset` is `undefined` at the press when the section is not mounted yet; the callback is then called again with it once measured (at most 5 s later), so make it safe to run twice. Nothing is pressable while a stream runs. Returns one item per top-level block for your own list. `data` is a new array per document change (unchanged blocks keep their items); the three functions never change identity. `renderItem` needs no provider, and `getItemType` is the element name, a FlashList recycling hint. No follow-tail: the list does it ([P3-3](./phase-3/decisions.md#p3-3-a-headless-block-hook-underneath-scroll-and-virtualize), [P3-5](./phase-3/decisions.md#p3-5-follow-tail-implemented-in-the-library-the-same-on-scrollview-and-flatlist)).

## Element catalog

Every component receives the props below, plus `children` (except where noted) and `style`, the resolved theme style for that element.

### Block elements

| Component | Props | Default rendering |
|---|---|---|
| `Heading` | `level: 1–6`, `id: string` (slug) | `<Text accessibilityRole="header">` |
| `Paragraph` | — | `<Text>` |
| `Blockquote` | — | `<View>` with a bar |
| `List` | `ordered: boolean`, `start: number`, `tight: boolean` | `<View>` |
| `ListItem` | `index`, `ordered`, `marker: string`, `checked: boolean \| null` | Row with a marker column. A checkbox when `checked !== null`. `checked` is the source value; a custom slot calls `useTaskState(taskIndex, checked, text)` for `{ checked, interactive, toggle }` (displayed state, shared store, fires `onTaskToggle`). |
| `CodeBlock` | `code: string`, `language: string \| null`, `meta: string \| null` (no `children`) | Horizontal `ScrollView` + `<Text>` |
| `Table` | `align: ('left' \| 'center' \| 'right' \| null)[]` | Horizontal `ScrollView`, cached column widths |
| `TableRow` | `header: boolean`, `index` | `<View>` row |
| `TableCell` | `align`, `header: boolean`, `column` | `<View>` + `<Text>` |
| `Divider` | — (no `children`) | Hairline `<View>` |
| `Image` (block) | `src`, `alt`, `title` (no `children`) | `<Image>` with a cached aspect ratio and a placeholder |
| `HtmlBlock` | `html: string` (no `children`) | Literal text (block HTML is never in the safe subset) |
| `FootnoteDefinition` | `label`, `index`, `references` | Collected into a footer section. `references`: how many back-links it ends with (`FootnoteBackLink` elements inside its last paragraph, [P3-13](./phase-3/decisions.md#p3-13-footnote-back-links-are-inline-nodes-at-the-end-of-the-definition)) |

### Inline elements

By default, inline elements must return Text-compatible output (`<Text>`, strings, nested `<Text>`), so the paragraph stays a single text layout.

**Inline Views (declared):** an element declared `inlineView: true` may return a `View`, such as a mention chip, a badge or rendered math. It is laid out as a native inline attachment inside the paragraph's `<Text>`. Declare it:
- on a plugin node: `nodes: { Mention: { kind: 'inline', inlineView: true, … } }`, or
- for a built-in element: `components={{ Link: inlineView(MyLinkChip) }}`.

Returning a `View` from an undeclared inline element triggers a dev-mode warning. Declared elements get a `baseline` alignment helper in their props, because inline attachments in React Native don't align to the text baseline automatically.

| Component | Props |
|---|---|
| `Strong`, `Emphasis`, `Strikethrough` | — |
| `InlineCode` | `code: string` (no `children`) |
| `Link` | `href`, `title` |
| `InlineImage` | `src`, `alt`, `title`, `width?`, `height?` |
| `LineBreak` | `hard: boolean` (no `children`) |
| `FootnoteReference` | `label`, `index`, `reference` (1-based) |
| `FootnoteBackLink` | `label`, `index`, `reference` (1-based), `total`. End of a footnote definition's last paragraph, one per reference; the text comes from `footnotes.backLinkMark` |
| `Underline`, `Highlight` | — (from `<u>`, `<mark>` in the [safe HTML subset](#raw-html)) |
| `Superscript`, `Subscript` | — (from `<sup>`, `<sub>`) |
| `Kbd` | — (from `<kbd>`) |
| `HtmlInline` | `html: string`. Any HTML tag outside the allowlist, shown as literal text by default. |

Plain text is **not** a component. Text runs are raw strings inside the block's `<Text>`. Style them with the theme (`colors.text`, `fonts.body`, `fontSize`).

### Wrapping a default

```tsx
import { Markdown, defaults } from '@docren/react-native-markdown';

const components = {
  CodeBlock: (props) =>
    props.language === 'mermaid' ? <Mermaid source={props.code} /> : <defaults.CodeBlock {...props} />,
};
```

### Types

```ts
type Components = {
  [K in ElementName]: ComponentType<ElementProps<K>>;
};
// ElementProps<'Heading'> = { level: 1|2|3|4|5|6; id: string; children: ReactNode; style: ElementStyle }
```

Plugins extend `ElementName` and `ElementProps` through their `nodes` declaration, so their components are type-checked too. Inside `definePlugin`, `components` are checked against the props each node's `from` returns. For the `components` and `theme.elements` props of `<Markdown>`, a plugin package declares its elements once, by augmenting `PluginElementPropsMap`:

```ts
declare module '@docren/react-native-markdown' {
  interface PluginElementPropsMap {
    Mention: { userId: string };
  }
}
```

## Theme

```ts
const theme = createTheme(
  {
    colors: { text, muted, link, codeBg, border, quoteBar, highlight },
    fonts: { body, heading, mono },       // each a family name, or a face map (see below)
    fontSize: { base: 16, scale: 1.2 },   // heading sizes derived from base and scale
    lineHeight: 1.5,
    spacing: { block: 12, listIndent: 20 },
    radius: { code: 6 },
    listBullets: ['•', '◦', '▪'],          // bullet character by nesting depth
    imageRatio: 16 / 9,                    // width / height of a block image's box until its size is known
    checkbox: { color, checkedColor, size, checkedText },  // task checkbox glyph; checked item's own text style (merged onto line-through + dim, or false for none)
    elements: {                            // per-element overrides: { text?, container? }
      Link: { text: { textDecorationLine: 'none' } },
      Heading: (level) => ({ text: { fontWeight: level <= 2 ? '700' : '600' } }),
    },
  },
  lightTheme // base to merge onto
);
```

- `lightTheme` and `darkTheme` ship with the library. `theme="auto"` switches with `useColorScheme()`. A theme input (no base) merges onto the built-in theme of the current scheme; `createTheme(input, base)` pins its base.
- **Font faces:** `fonts.body` and `fonts.heading` take a family name or `{ regular, italic?, bold?, boldItalic? }`; `fonts.mono` takes a name or `{ regular }`. Use a face map with fonts loaded by `expo-font`'s `useFonts` (one family per face), where `fontWeight`/`fontStyle` don't select faces on iOS. Missing faces fall back to `fontWeight`/`fontStyle` ([P1-16](./phase-1/decisions.md#p1-16-font-faces-for-custom-fonts)).
- Element styles are split into `text` and `container`, so view and text styles can't be mixed up.
- Resolved once per change of the theme value (equal values, compared shallowly per group, reuse the cached result), then shared through context. Hoist `Heading` functions: they are compared by identity.
- `useMarkdownTheme()` gives custom components `{ tokens, styles, headings }`: the merged tokens, every element's resolved `{ text, container }`, and the per-level `Heading` styles. It must be called inside `<Markdown>`.

## Plugins

```ts
interface MarkdownPlugin<N extends Record<string, object> = {}> {
  name: string;
  syntax?: {
    markdownIt?: (md: MarkdownIt) => void;  // JS backend
    // native?: NativeExtensionId;          // planned for Phase 4, not in the code yet
  };
  nodes?: { [K in keyof N]: {
    kind: 'block' | 'inline';
    inlineView?: boolean;     // inline only: may render a View as an inline attachment (decision D8)
    token: string;
    from: (tok: PluginToken) => N[K];
  } };
  components?: { [K in keyof N]?: ComponentType<N[K] & { children?: ReactNode; style: ElementStyle }> };
  theme?: Partial<ElementOverrides<keyof N>>;
}

const definePlugin: <N>(p: MarkdownPlugin<N>) => MarkdownPlugin<N>;
```

- **Built-in GFM plugins:** `tables`, `taskLists`, `strikethrough`, `autolinks`, `footnotes`, `tagfilter`. `preset="gfm"` includes all of them.
- **Planned official plugins:** `emoji`, `mentions`, `admonitions`, each a separate entry point (`/emoji`, `/mentions`, `/admonitions`) so it can be tree-shaken; see [phase-3/plugins.md](./phase-3/plugins.md). `math` is deferred.
- **Order:** the preset's plugins first, then `plugins` in array order. A later plugin's components and theme override an earlier one's. The `components` and `theme` props override all plugins.

## Raw HTML

| `html` value | Behaviour |
|---|---|
| `'safe'` (default) | Allowlisted inline tags become elements. Everything else is shown as literal text. |
| `'text'` | All HTML shown as literal text |
| `'strip'` | All HTML tags removed. Text between tags is kept. |
| `{ allow: [...] }` | Your own subset of the supported tags |

**Safe subset:**

| Tag | Element |
|---|---|
| `<br>` | `LineBreak` (`hard: true`). Common in LLM tables. |
| `<b>`, `<strong>` | `Strong` |
| `<i>`, `<em>` | `Emphasis` |
| `<s>`, `<del>` | `Strikethrough` |
| `<u>` | `Underline` |
| `<mark>` | `Highlight` |
| `<sup>`, `<sub>` | `Superscript`, `Subscript` |
| `<kbd>` | `Kbd` |

Attributes are ignored. Unmatched or unknown tags fall back to literal text. Block-level HTML (`<div>`, `<details>`, `<table>` …) is never interpreted; it renders as text or is removed with `'strip'`.

## Lower-level API

```ts
import { parse, visit } from '@docren/react-native-markdown';

const doc = parse(source, { preset: 'gfm', plugins });   // opaque, immutable, cacheable
<Markdown document={doc} />;                             // no parsing during render

const toc: { level: number; id: string; text: string }[] = [];
visit(doc, { Heading: ({ level, id }, { text }) => toc.push({ level, id, text }) });
```

## Streaming

```tsx
const stream = useMarkdownStream({ plugins });   // { append, reset, done, document }
useEffect(() => llm.onToken(stream.append), []);
return <Markdown document={stream.document} />;
```

See [05](./05-streaming.md) for what `streamingConfig` and `onStreamingEnd` do.

## Migration from v0.x

See the [migration guide](../migration-from-v0.md): a checklist and before/after code for every v0 prop (`markdown` → `source`, `styles` → `theme`, `renderRules` → `components`, `extensions` → `plugins`). There is no `renderRules` adapter: v0 rules need an mdast `node`, pre-rendered `children` and `parentStack`, which v1 doesn't have ([P1-26](./phase-1/decisions.md#p1-26-no-fromrenderrules-adapter)).
