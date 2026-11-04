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
| `onTaskToggle` | `(checked, info) => void` | none | Makes task list checkboxes interactive |
| `onFootnotePress` | `(label, info) => void` | none | Makes footnote references and back-links pressable. `info = { index, direction: 'reference' \| 'definition', reference }`: where to go, and which reference (1-based). The app scrolls; the renderer doesn't own the scroll view ([P1-15](./phase-1/decisions.md#p1-15-footnote-navigation-through-an-onfootnotepress-handler)). |
| `virtualize` | `boolean \| FlashListProps` | `false` | For long standalone documents |
| `html` | `'safe' \| 'text' \| 'strip' \| { allow: HtmlTag[] }` | `'safe'` | `'safe'` renders an allowlist of tags as elements and shows the rest as text. See [Raw HTML](#raw-html). |
| `images` | `'allow' \| 'deny' \| { allowHosts: string[] }` | `'allow'` | Use `'deny'` or an allowlist for untrusted content. A refused image renders as its alt text. `allowHosts` entries are exact hosts or `*.example.com` (subdomains only); relative and `data:` images don't match. See [P1-21](./phase-1/decisions.md#p1-21-images-policy-semantics). |
| `softBreak` | `'space' \| 'newline'` | `'space'` | How soft line breaks render. `'space'` matches browsers and GitHub ([P1-2](./phase-1/decisions.md#p1-2-soft-line-breaks)). |
| `scriptFallback` | `'smaller' \| 'raised'` | `'smaller'` | Superscript/subscript content with no Unicode form (`TM`, `[1]`). Unicode-convertible content (`mc²`, `H₂O`) always renders as Unicode characters. `'raised'` uses inline views, with accessibility and styling costs ([P1-17](./phase-1/decisions.md#p1-17-unicode-characters-for-superscript-and-subscript-by-default)). |
| `selectable` | `boolean` | `false` | Text selection within each block |
| `maxFontSizeMultiplier` | `number` | unset | Accessibility |
| `backend` | `ParserBackend` | JS (markdown-it) | `nativeBackend` from `/native` in phase 4 |

Memoization is internal. Callers don't need to `useMemo` the `theme`, `components` or `plugins` objects. They're compared shallowly, key by key, to decide whether the render context needs rebuilding.

## Element catalog

Every component receives the props below, plus `children` (except where noted) and `style`, the resolved theme style for that element.

### Block elements

| Component | Props | Default rendering |
|---|---|---|
| `Heading` | `level: 1–6`, `id: string` (slug) | `<Text accessibilityRole="header">` |
| `Paragraph` | — | `<Text>` |
| `Blockquote` | — | `<View>` with a bar |
| `List` | `ordered: boolean`, `start: number`, `tight: boolean` | `<View>` |
| `ListItem` | `index`, `ordered`, `marker: string`, `checked: boolean \| null` | Row with a marker column. A checkbox when `checked !== null`. |
| `CodeBlock` | `code: string`, `language: string \| null`, `meta: string \| null` (no `children`) | Horizontal `ScrollView` + `<Text>` |
| `Table` | `align: ('left' \| 'center' \| 'right' \| null)[]` | Horizontal `ScrollView`, cached column widths |
| `TableRow` | `header: boolean`, `index` | `<View>` row |
| `TableCell` | `align`, `header: boolean`, `column` | `<View>` + `<Text>` |
| `Divider` | — (no `children`) | Hairline `<View>` |
| `Image` (block) | `src`, `alt`, `title` (no `children`) | `<Image>` with a cached aspect ratio and a placeholder |
| `HtmlBlock` | `html: string` (no `children`) | Literal text (block HTML is never in the safe subset) |
| `FootnoteDefinition` | `label`, `index`, `references` | Collected into a footer section. `references`: how many back-links to render |

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
    native?: NativeExtensionId;             // native backend (phase 4)
  };
  nodes?: { [K in keyof N]: {
    kind: 'block' | 'inline';
    inlineView?: boolean;     // inline only: may render a View as an inline attachment (decision D8)
    token: string;
    from: (tok: Token) => N[K];
  } };
  components?: { [K in keyof N]?: ComponentType<N[K] & { children?: ReactNode; style: ElementStyle }> };
  theme?: Partial<ElementOverrides<keyof N>>;
}

const definePlugin: <N>(p: MarkdownPlugin<N>) => MarkdownPlugin<N>;
```

- **Built-in GFM plugins:** `tables`, `taskLists`, `strikethrough`, `autolinks`, `footnotes`, `tagfilter`. `preset="gfm"` includes all of them.
- **Planned official plugins:** `math`, `mentions`, `emoji`, `admonitions`. Each is a separate entry point so it can be tree-shaken.
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

```ts
import { toMdast } from '@docren/react-native-markdown/mdast'; // opt-in unified interop
```

## Streaming

```tsx
const stream = useMarkdownStream({ plugins });   // { append, reset, done, document }
useEffect(() => llm.onToken(stream.append), []);
return <Markdown document={stream.document} />;
```

See [05](./05-streaming.md).

## Migration from v0.x

| v0.x | v1 |
|---|---|
| `markdown` | `source` |
| `styles` + `mergeStyle` | `theme` (tokens plus `elements` overrides, always merged onto a base) |
| `renderRules.heading({ node })` using `node.depth` | `components.Heading({ level })` |
| `renderRules.link` using `node.url`, `extras.onPress` | `components.Link({ href })` / `onLinkPress` |
| `renderRules.code` using `node.lang`, `node.value` | `components.CodeBlock({ language, code })` |
| `renderRules.inlineCode` | `components.InlineCode({ code })` |
| `renderRules.delete` | `components.Strikethrough` |
| `renderRules.thematicBreak` | `components.Divider` |
| `renderRules.image` | `components.Image` (block) / `components.InlineImage` |
| `renderRules.text` | theme tokens (text isn't a component) |
| `listBulletStyle`, `customBulletElement` | `components.ListItem` (`marker`) or theme |
| `extensions` (mdast-util-from-markdown) | `plugins` (`definePlugin` with `syntax.markdownIt`) |
| `debug` | removed (use React DevTools) |

A temporary `renderRules` → `components` adapter (`fromRenderRules()`, deprecated on arrival) can ship in v1.0 for the simple cases in this table, plus a migration guide.
