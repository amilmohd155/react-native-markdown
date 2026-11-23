# 04 · Public API (proposed)

The reasoning behind this design, including the options rejected, is in [08 · Data model & public API](./08-model-and-api.md). In short, users work with **elements with semantic props**, **plugins** and **a flat theme**. They never see the parser's internal node format.

## `<Markdown>`

```tsx
<Markdown
  source={text}
  theme={theme}                          // flat per-element object, or 'light' | 'dark' | 'auto'
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
| `theme` | `FlatThemeInput \| 'light' \| 'dark' \| 'auto'` | `'auto'` | See [Theme](#theme) |
| `onLinkPress` | `(href, info) => boolean \| void` | opens with `Linking` | Called first for every link. Return `false` to cancel the default. The default opens only `http`, `https`, `mailto`, `tel` and relative URLs, so custom-scheme deep links need this handler ([P1-3](./phase-1/decisions.md#p1-3-url-sanitization-layers)). Errors from `openURL` are caught. |
| `onImagePress` | `(src, info) => void` | none | |
| `onImageError` | `({ src, alt, title }) => void` | none | An image failed to load. A press on the error state retries ([P3-36](./phase-3/decisions.md#p3-36-image-size-polish-explicit-sizes-a-hardened-cache-fade-in-and-a-retry)). |
| `imageSizes` | `{ [src]: { width, height } }` | none | Known sizes, read before the cache: the image reserves its box on the first render, no shift. The object may be inline. `prefetchImageSizes(urls)` fills the cache ahead of time ([P3-36](./phase-3/decisions.md#p3-36-image-size-polish-explicit-sizes-a-hardened-cache-fade-in-and-a-retry)). |
| `onTaskToggle` | `({ index, checked, text }) => void` | none | Called after a tap flips a task checkbox ([P3-16](./phase-3/decisions.md#p3-16-library-owned-task-toggle-with-an--index-checked-text--payload)). `index` is global and 0-based; `text` is the item's own plain text. The library owns the box state (cleared when `source` changes); persisting is the app's job. |
| `enableTaskListItemToggle` | `boolean` | `true` | `false`: read-only checkboxes, no callback. Boxes are also inert while a stream runs ([P3-18](./phase-3/decisions.md#p3-18-interactive-by-default-with-enabletasklistitemtoggle-inert-while-streaming)). |
| `onFootnotePress` | `(label, info, { offset }) => void \| false` | none | Makes footnote references and back-links pressable. `info = { index, direction: 'reference' \| 'definition', reference }`: where to go, and which reference (1-based). `offset`: with `footnotes.target: 'definition'`, the definition's y inside the section block (`number \| undefined`, [P3-15](./phase-3/decisions.md#p3-15-opt-in-exact-definition-jump-and-highlight)). In `scroll` and `virtualize` the container then scrolls there (references to the footnote section, back-links to their reference); return `false` to skip that. In the default `View` the app scrolls, and so does a list of your own with `useMarkdownBlocks` (`onFootnoteScrollTo`, [P3-14](./phase-3/decisions.md#p3-14-usemarkdownblocks-takes-onfootnotescrollto-for-the-apps-own-list)) ([P1-15](./phase-1/decisions.md#p1-15-footnote-navigation-through-an-onfootnotepress-handler), [P3-9](./phase-3/decisions.md#p3-9-onfootnotepress-runs-first-and-can-skip-the-jump)). Not called, and the footnote section not rendered, while a stream runs until `done()` ([P3-12](./phase-3/decisions.md#p3-12-the-footnote-section-and-its-links-wait-for-done)). |
| `footnotes` | `{ labels?, backLinkMark?, target?, highlight? }` | English labels, `↩` | `labels`: `{ reference(index), backLink(index, reference) }`, the accessibility labels of references ("Footnote 1") and back-links ("Back to reference 1") ([P3-11](./phase-3/decisions.md#p3-11-footnote-labels-for-references-and-back-links)). `backLinkMark`: `(reference, total) => string`, the visible text of a back-link; `reference` is which reference it returns to (1-based), `total` how many the footnote has, default `↩`, then `↩²`, `↩³`… ([P3-13](./phase-3/decisions.md#p3-13-footnote-back-links-are-inline-nodes-at-the-end-of-the-definition)). `target`: `'section'` (default) or `'definition'`: a reference press scrolls to its own definition. `highlight`: `true` or `{ color?, duration? }` flashes the definition (reference press) or reference (back-link press); off by default ([P3-15](./phase-3/decisions.md#p3-15-opt-in-exact-definition-jump-and-highlight)). The object may be inline; the functions inside must be module level. |
| `codeBlock` | `{ header?, lineNumbers?, wrap? }` | all `false` | `header`: a bar above each code block with the fence tag, Wrap and Copy, drawn by the [`CodeBlockHeader`](#block-elements) element. `lineNumbers`: a fixed gutter column, never selected or copied, hidden from accessibility. `wrap`: wrap long lines; the start state, which the header's Wrap button flips ([P3-35](./phase-3/decisions.md#p3-35-code-block-header-line-numbers-and-wrap-in-pure-js)). Applies to the default and the highlighted `CodeBlock`. |
| `onCopyPress` | `({ code, language, meta }) => void` | none | The header's Copy button shows only when set. The library has no clipboard dependency: the app writes it ([recipe](#code-block-header)). Disabled while the fence is still streaming. |
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

### Code block header

```tsx
import * as Clipboard from 'expo-clipboard';   // web: navigator.clipboard.writeText(code)

const onCopyPress = ({ code }: CodeCopyInfo) => {
  Platform.OS === 'web' ? navigator.clipboard.writeText(code) : Clipboard.setStringAsync(code);
};
<Markdown source={md} codeBlock={{ header: true, lineNumbers: true }} onCopyPress={onCopyPress} />;
```

The header sits outside the code body: with it on, the body is the labelled element and Copy is a second accessible element, and `theme.codeBlock.padding` pads the body, not the bar. Style the bar with `theme.codeBlock.header`, or replace it in `components`; Wrap is part of the default bar (hidden while the fence streams); flipping it remounts the body and resets its horizontal scroll. The gutter is the structural `codeBlockGutter` style, derived from the merged `CodeBlock` text. With numbers on, a larger or open highlighted block, or numbers with wrap, selects only inside one chunk on Android and iOS, so Copy is the way to copy it all. Very large plain blocks on iOS: [P3-35](./phase-3/decisions.md#p3-35-code-block-header-line-numbers-and-wrap-in-pure-js).

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
| `CodeBlock` | `code: string`, `language: string \| null`, `meta: string \| null`, `open: boolean` (true only while a stream's tail fence is unclosed; no `children`) | Horizontal `ScrollView` + `<Text>` (other layouts with `codeBlock`) |
| `CodeBlockHeader` | `language`, `code`, `open`, `wrap: boolean`, `onToggleWrap: (() => void) \| null`, `onCopy: (() => void) \| null` (no `children`). No markdown node: `CodeBlock` draws it with `codeBlock.header`; `visit` never calls it. A `null` callback hides its button. | `<View>` bar: tag, Wrap, Copy |
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

Plain text is **not** a component. Text runs are raw strings inside the block's `<Text>`. Style them with `theme.paragraph` (`color`, `fontFamily`, `fontSize`).

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

Plugins extend `ElementName` and `ElementProps` through their `nodes` declaration, so their components are type-checked too. Inside `definePlugin`, `components` are checked against the props each node's `from` returns. For the `components` prop of `<Markdown>`, a plugin package declares its elements once, by augmenting `PluginElementPropsMap`; a theme key of its own is declared the same way through `PluginThemeMap` (not a core key, `dark` or `light`):

```ts
declare module '@docren/react-native-markdown' {
  interface PluginElementPropsMap {
    Mention: { userId: string };
  }
}
```

## Theme

`theme` is `'light' | 'dark' | 'auto'` (default `'auto'`, follows `useColorScheme()`) or one flat object keyed by element, each key with a closed list of props ([P3a-2](./phase-3a/decisions.md#p3a-2-flat-per-element-theme-tokens-become-internal)). A prop an element does not accept is a type error, plus a dev-only warning for plain JS. Names are React Native style names where one exists; the library routes each prop to the element's `View` or `Text`.

```tsx
const theme = createTheme({
  paragraph: { fontSize: 18 },
  link: { color: '#2563EB' },
  codeBlock: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 16 },
  dark: { link: { color: '#60A5FA' }, codeBlock: { backgroundColor: '#1F2937' } },
});
<Markdown source={md} theme={theme} />;
```

**Keys.** **T** = `color`, `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `textAlign` (`fontFamily` of T on `paragraph`, `h1`-`h6`, `codeBlock` also takes a face map, below). **M** = `marginTop`, `marginBottom`. Defaults, table details (`headerColor`, zebra, `horizontalOverflow`) and what stays a prop, not theme: [theme-props.md](./phase-3a/theme-props.md).

| Key | Accepts |
|---|---|
| `paragraph`, `h1`-`h6` | T, M |
| `blockquote` | T, M, `backgroundColor`, `borderLeftColor`, `borderLeftWidth`, `borderRadius`, `padding` (top and bottom), `paddingLeft` (bar to text), `admonitions` |
| `list` | M, T (item text, over `paragraph`), `bullets` (by depth), `bulletColor`, `bulletSize`, `markerColor`, `markerFontWeight`, `markerMinWidth`, `gapWidth`, `marginLeft` (indent per level), `itemSpacing` |
| `codeBlock` | T, M, `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `padding`, `syntax`, `header` |
| `codeBlock.header` | `color`, `fontFamily`, `fontSize`, `lineHeight`, `backgroundColor`, `borderBottomColor`, `borderBottomWidth`, `paddingHorizontal`, `paddingVertical` |
| `table` | M, T (cell text), `cellPadding`, `cellPaddingHorizontal`, `cellPaddingVertical`, `cellBackgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `align`, `horizontalOverflow`, `headerBackgroundColor`, `headerColor`, `headerFontFamily`, `rowEvenBackgroundColor`, `rowOddBackgroundColor` |
| `divider` | M, `backgroundColor`, `height` |
| `image` | M, `borderRadius`, `aspectRatio`, `height`, `maxHeight`, `resizeMode`, `fadeDuration` |
| `inlineImage` | `size` |
| `htmlBlock` | `color`, `fontFamily`, `fontSize`, M |
| `footnote.definition` | `color`, `fontSize`, `lineHeight`, `highlightColor` |
| `checkbox` | `color`, `checkedColor`, `size`, `borderColor`, `checkmarkColor`, `borderRadius`, `checkedText` |
| `strong` | `color`, `fontFamily`, `fontWeight` |
| `em` | `color`, `fontFamily`, `fontStyle` |
| `strikethrough`, `underline` | `color` (colours the text too on Android) |
| `highlight` | `color`, `backgroundColor` |
| `link` | `color`, `fontFamily`, `fontWeight`, `textDecorationLine`, `backgroundColor`, `variants` |
| `inlineCode`, `kbd` | `color`, `fontFamily`, `fontSize`, `backgroundColor` |
| `superscript`, `subscript` | `color`, `fontScale` |
| `footnote.reference` | `color`, `fontScale` |
| `footnote.backLink` | `color` |

- **`dark` / `light` blocks** take the same keys. Merge order, later wins, per prop: built-in theme of the active scheme < plugin defaults < top-level keys < the active scheme's block. Top-level keys apply to both schemes. Pin a scheme with `theme="light"` or put values under `light: {…}`.
- **`createTheme(input)`** is a typed identity helper (frozen copy, no `base`): it checks the whitelist for a theme defined outside JSX and lets a package ship a theme as a value. Compose with a spread: `createTheme({ ...brand, link: { color } })`. A plain object is equally valid as `theme`.
- **Sizing.** Headings scale from `paragraph.fontSize` by an internal ratio unless an `h1`-`h6` sets its own `fontSize`. `lineHeight` is in points and, as on any RN `Text`, an exact height: taller inline content (an inline image, a larger `fontSize`) is clipped, so raise `paragraph.lineHeight` with `inlineImage.size`. Inline elements default to `1em` (the parent's size; a number is absolute). `superscript`, `subscript` and `footnote.reference` take `fontScale`, default 0.75 on iOS and web, 0.65 on Android.
- **`link.variants`** styles links by URL: keys are regular-expression sources tested against the `href` in object order, first match wins, no match uses `link`. A variant merges over `link`; across layers per pattern, prop by prop, new patterns append. This is also how mentions are styled (no `Mention` key). An invalid pattern is skipped with a one-time dev warning.
- **`blockquote.admonitions.<kind>`**, kind `note`, `tip`, `important`, `warning` or `caution`: `color` (accent) and `backgroundColor`. Geometry and fonts come from `blockquote`. Defaults are GitHub's palette; a hex `color` gets a default tint, any other format needs `backgroundColor`.
- **`checkbox`** is always a drawn box ([P3a-5](./phase-3a/decisions.md#p3a-5-the-checkbox-is-a-drawn-box)): `size` is the box width in points (default 0.9 x the list font size), `color` the unchecked border (or `borderColor`), `checkedColor` the checked fill (both default to the text colour), `checkmarkColor` the tick (near-black or white by the fill's luminance), `checkedText` the checked item's text style (merged onto line-through and dim, or `false`).
- **`codeBlock.syntax`**: a colour per token type, 15 types (`keyword`, `string`, `number`, `comment`, `function`, `type`, `operator`, `punctuation`, `property`, `constant`, `variable`, `embedded`, `plain`, `inserted`, `deleted`). A partial object merges onto the scheme's palette. `plain`, `operator`, `punctuation`, `variable` and `embedded` follow a custom `codeBlock.color` unless set; the other types follow the scheme only, so with a dark custom `codeBlock.backgroundColor` set `number`, `keyword` and the rest too ([P3-33](./phase-3/decisions.md#p3-33-syntax-colours-are-a-core-theme-token-that-follows-the-theme-mode)).
- **Font faces:** `fontFamily` on `paragraph`, `h1`-`h6` and `codeBlock` takes a family name or `{ regular, italic?, bold?, boldItalic? }` for fonts loaded with `expo-font`'s `useFonts` (`codeBlock`: `{ regular }`). Missing faces fall back to `fontWeight`/`fontStyle` ([P1-16](./phase-1/decisions.md#p1-16-font-faces-for-custom-fonts)).
- `useMarkdownTheme()` gives custom components the resolved flat values for the active scheme (`MarkdownTheme`: the merged flat block, e.g. `useMarkdownTheme().link.color`; props that have a built-in default are required, everything else stays optional, `dark`/`light` already applied). It must be called inside `<Markdown>`.

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
  theme?: FlatThemeBlock;   // plugin defaults: flat keys, merged below the user's theme
}

const definePlugin: <N>(p: MarkdownPlugin<N>) => MarkdownPlugin<N>;
```

- **Built-in GFM plugins:** `tables`, `taskLists`, `strikethrough`, `autolinks`, `footnotes`, `tagfilter`. `preset="gfm"` includes all of them.
- **Official plugins:** `emoji`, `mentions`, `admonitions`, `highlight`, each a separate entry point (`/emoji`, `/mentions`, `/admonitions`, [`/highlight`](#highlight)) so it can be tree-shaken; see [phase-3/plugins.md](./phase-3/plugins.md). `math` is deferred.
- **`emoji({ resolve?, map?, defaults? })`** (`@docren/react-native-markdown/emoji`): turns `:name:` into the Unicode character at parse time. The result is plain text, not a node. Lookup order: `resolve`, then `map`, then about 50 built-in names (`defaults: false` drops them). An unknown name stays literal; code spans, escapes and URLs are untouched. `resolve` must be sync and pure and is not part of the parse cache key. While streaming, a half-typed `:smi` shows raw until the closing colon arrives ([P3-26](./phase-3/decisions.md#p3-26-no-plugin-incomplete-tail-streaming-hook-yet)).
- **Order:** the preset's plugins first, then `plugins` in array order. A later plugin's components and theme override an earlier one's. The `components` and `theme` props override all plugins.

### `/highlight`

```tsx
import { highlight } from '@docren/react-native-markdown/highlight';

const plugins = [highlight()];   // once, at module scope: each call makes a new CodeBlock, which remounts code blocks
<Markdown source={md} plugins={plugins} />;
```

- **Options:** `highlight({ languages?, tokenize?, maxLength? })`. `languages` maps a fence tag to a `Tokenizer`, adding to or overriding the built-ins; `tokenize` is the catch-all for other tags; an untagged block, or a tag nothing knows, renders plain. Tags are trimmed and matched case-insensitively ([P3-29](./phase-3/decisions.md#p3-29-hand-rolled-tokenizers-with-a-stateless-replaceable-contract)).
- **Built-in languages:** `js` `jsx` `javascript` `mjs` `cjs`, `ts` `tsx` `typescript`, `json` `jsonc`, `sh` `bash` `shell` `zsh`, `diff` `patch`, `py` `python`.
- **Tokenizer:** `(code: string, language: string) => readonly Token[]`, with `Token = { type: SyntaxTokenType; text: string }`. Sync and stateless; the token texts joined in order equal `code`. A throw, or (checked in dev only) a mismatch, renders the block plain with a dev warning. The 15 types: `keyword`, `string`, `number`, `comment`, `function`, `type`, `operator`, `punctuation`, `property`, `constant`, `variable`, `embedded`, `plain`, `inserted`, `deleted`. Bring your own (a lowlight recipe of about 20 lines): [plugins.md](./phase-3/plugins.md#highlight).
- **Colours:** `theme.codeBlock.syntax` ([Theme](#theme)). The built-in themes define every type and follow `theme="auto"`; a partial `syntax` merges onto the current scheme's palette. `plain` and the punctuation-like types follow a custom `codeBlock.color`; the colour types do not ([P3-33](./phase-3/decisions.md#p3-33-syntax-colours-are-a-core-theme-token-that-follows-the-theme-mode)).
- **`open`:** the `CodeBlock` prop that is true only while a stream's tail fence is unclosed. While open, finished lines are frozen and colours may be approximate; on close the block is re-tokenized once.
- **Size cap:** a block longer than `maxLength` characters (default 50,000, exported as `DEFAULT_MAX_LENGTH`) renders as the default `CodeBlock`, streaming or not, and stays plain ([P3-31](./phase-3/decisions.md#p3-31-highlight-up-to-maxlength-50000-characters-then-plain)).
- **Selection:** a closed block of up to 800 characters is one `Text`, so selection and copy cover all of it. A larger or open block is one `Text` per 2 lines: selection stays inside one chunk on Android, crosses chunks exactly on web, and iOS (no range selection anywhere) copies one chunk. With the header off, the block is one accessible element labelled with the code ([P3-30](./phase-3/decisions.md#p3-30-highlighted-code-renders-as-one-text-per-2-lines)).
- **Streaming fast path:** the plugin supplies only `components.CodeBlock`, no `syntax`, so the open-fence fast path stays on; any plugin with `syntax` (`emoji`, `mentions`, `admonitions`) turns it off. A custom highlighting `CodeBlock` should be components-only too ([P3-32](./phase-3/decisions.md#p3-32-the-open-fence-fast-path-is-gated-on-syntax-not-on-any-plugin)).

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
