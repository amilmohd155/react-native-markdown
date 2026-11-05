# Migrating from v0.x to v1

v1 is a rewrite with a new API. The props are different, you no longer see mdast nodes, and a few defaults changed. This guide walks every v0.x prop and render rule to its v1 replacement.

If you aren't ready, v0.x stays on the `main` branch and keeps getting bug fixes. Pin `@docren/react-native-markdown@^0.8`.

- [Checklist](#checklist)
- [`markdown` → `source`](#markdown--source)
- [`styles` and `mergeStyle` → `theme`](#styles-and-mergestyle--theme)
- [`renderRules` → `components`](#renderrules--components)
  - [`heading`](#heading)
  - [`link` and `onLinkPress`](#link-and-onlinkpress)
  - [`code`](#code)
  - [`inlineCode`](#inlinecode)
  - [`delete`](#delete)
  - [`thematicBreak`](#thematicbreak)
  - [`image`](#image)
  - [`text`](#text)
- [`listBulletStyle` and `customBulletElement`](#listbulletstyle-and-custombulletelement)
- [`extensions` → `plugins`](#extensions--plugins)
- [`debug`](#debug)
- [New behaviour to know about](#new-behaviour-to-know-about)
- [There is no `renderRules` adapter](#there-is-no-renderrules-adapter)

## Checklist

1. Rename `markdown` to `source`.
2. Replace `styles` / `mergeStyle` with `theme`.
3. Replace each `renderRules` entry with the matching `components` entry (table below).
4. Replace `listBulletStyle` / `customBulletElement` with a theme token or a `ListItem` component.
5. Rewrite `extensions` as `plugins`. GFM (tables, strikethrough, task lists, autolinks, footnotes) is now built in, so drop any GFM extension.
6. Remove `debug`.
7. Read [New behaviour to know about](#new-behaviour-to-know-about). Three defaults changed in ways that can bite: link handling, images and raw HTML.

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

Code blocks labelled `jsx` below are v0.x. Blocks labelled `tsx` are v1.

## `markdown` → `source`

```jsx
<Markdown markdown={text} />
```

```tsx
import { Markdown } from '@docren/react-native-markdown';

export function Note({ text }: { text: string }) {
  return <Markdown source={text} />;
}
```

- `source` is a `string`. v0 also took a `Uint8Array`; decode it yourself first.
- To skip parsing at render time, parse once with `parse()` and pass `document` instead of `source`. You pass one or the other.

```tsx
import { Markdown, parse } from '@docren/react-native-markdown';

const doc = parse('# Hello');

export function Hello() {
  return <Markdown document={doc} />;
}
```

## `styles` and `mergeStyle` → `theme`

v0 took a `StyleMap` keyed by mdast node type (`heading1`, `blockquote`, `listBullet`...). v1 has a `theme`: design **tokens** (colors, fonts, sizes, spacing) from which every element's style is derived, plus per-element **`elements`** overrides for what tokens can't express.

```jsx
<Markdown
  markdown={text}
  styles={{
    blockquote: { backgroundColor: '#cad8ee', borderRadius: 12 },
    link: { color: 'tomato' },
    heading1: { fontSize: 32 },
  }}
/>
```

```tsx
import { Markdown, createTheme } from '@docren/react-native-markdown';

const theme = createTheme({
  colors: { link: 'tomato' },
  fontSize: { base: 16, scale: 1.25 },
  elements: {
    Blockquote: {
      container: { backgroundColor: '#cad8ee', borderRadius: 12 },
    },
    Heading: (level) => ({ text: { fontWeight: level <= 2 ? '700' : '600' } }),
  },
});

export function Styled({ text }: { text: string }) {
  return <Markdown source={text} theme={theme} />;
}
```

What changed:

- **`mergeStyle` is gone.** A theme always merges onto a base: the built-in theme for the current color scheme, or the one you pass as the second argument of `createTheme(input, base)`. To start from scratch, override every token you care about.
- **Each element has a `text` and a `container` style.** `text` is a `TextStyle`, `container` is a `ViewStyle`. View and text styles can't be mixed up, which v0's single style object allowed.
- **`heading1`…`heading6` are one `Heading` entry.** Give it an object, or a function of the level. Hoist the function: the theme compares it by identity.
- **Built-in themes.** `theme="light" | "dark" | "auto"` (the default is `'auto'`, which follows `useColorScheme()`). `lightTheme` and `darkTheme` are exported as bases. This replaces the v0 roadmap item "dark mode".
- **The theme is memoised for you.** You don't need `useMemo` around `theme`, `components` or `plugins`; they are compared shallowly. Define them outside the component anyway when you can.
- **Fonts.** `fonts.body`, `fonts.heading` and `fonts.mono` take a family name, or a face map (`{ regular, italic, bold, boldItalic }`) for custom fonts loaded with `expo-font`.

How v0 style keys map:

| v0 `styles` key | v1 |
|---|---|
| `root`, `text` | tokens: `colors.text`, `fonts.body`, `fontSize.base`, `lineHeight`. Style the wrapping view yourself for a container. |
| `heading1`…`heading6` | `elements.Heading` (object or `(level) => …`), sizes from `fontSize.base` and `fontSize.scale` |
| `paragraph` | `elements.Paragraph` |
| `strong`, `emphasis` | `elements.Strong`, `elements.Emphasis` |
| `delete` | `elements.Strikethrough` |
| `thematicBreak` | `elements.Divider`, `colors.border` |
| `blockquote` | `elements.Blockquote`, `colors.quoteBar` |
| `code` | `elements.CodeBlock`, `colors.codeBg`, `radius.code`, `fonts.mono` |
| `inlineCode` | `elements.InlineCode` |
| `link` | `elements.Link`, `colors.link` |
| `image` | `elements.Image` |
| `list`, `listItem`, `listItemContent` | `elements.List`, `elements.ListItem`, `spacing.listIndent` |
| `listBullet` | `listBullets` token (see [below](#listbulletstyle-and-custombulletelement)) |

If a component needs the resolved styles of other elements, call `useMarkdownTheme()` inside it. It returns `{ tokens, styles, headings }` and only works inside `<Markdown>`.

## `renderRules` → `components`

This is the biggest change. A v0 render rule received an **mdast node** and pre-rendered children, and you had to supply a `key`:

```jsx
renderRules={{
  heading: ({ node, children, styles }) => (
    <Text key={node.key} style={styles[`heading${node.depth}`]}>{children}</Text>
  ),
}}
```

A v1 component is an ordinary React component. Its props are **semantic** (`level`, `href`, `code`), it gets `children` and a resolved `style`, and React keys are handled for you. You never see mdast, `parentStack` or `extras`.

Three things carry over from every rule below:

- **No `node`.** Read the semantic props instead. The table in each section shows which.
- **No `key`.** Delete `key={node.key}`.
- **`style` replaces `styles[...]`.** It is `{ text, container }`, already resolved from the theme. Spread `style.text` on a `<Text>` and `style.container` on a `<View>`.

Type your components with `ElementProps<'Name'>` when you define them outside the `components` object. To wrap a built-in instead of replacing it, use `defaults`:

```tsx
import {
  Markdown,
  defaults,
  type ElementProps,
} from '@docren/react-native-markdown';

function CodeBlock(props: ElementProps<'CodeBlock'>) {
  return <defaults.CodeBlock {...props} />;
}

const components = { CodeBlock };

export function Wrapped({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

### `heading`

`node.depth` becomes `level`. The slug is available as `id`, for example for a table of contents.

```jsx
renderRules={{
  heading: ({ node, children }) => (
    <Text key={node.key} style={{ fontSize: 40 - node.depth * 4 }}>
      {children}
    </Text>
  ),
}}
```

```tsx
import { Text } from 'react-native';
import { Markdown, type ElementProps } from '@docren/react-native-markdown';

function Heading({ level, children, style }: ElementProps<'Heading'>) {
  return (
    <Text
      accessibilityRole="header"
      style={[style.text, { fontSize: 40 - level * 4 }]}
    >
      {children}
    </Text>
  );
}

const components = { Heading };

export function Headings({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

Use a `Heading` theme function instead of a component when you only want to change styles.

### `link` and `onLinkPress`

`node.url` becomes `href`. You rarely need a custom `Link` any more: handle navigation with `onLinkPress`, and style the link with the theme.

`onLinkPress` changed behaviour, so read this one carefully. In v0, providing it **replaced** `Linking.openURL`. In v1 it is called **first**, with `(href, info)`, and the default open still happens afterwards unless you return `false`.

```jsx
const onLinkPress = (url) => {
  if (!url.startsWith('/')) return Linking.openURL(url);
  router.push(url);
};

<Markdown markdown={text} onLinkPress={onLinkPress} />;
```

```tsx
import { Linking } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Markdown } from '@docren/react-native-markdown';

export function Doc({ text }: { text: string }) {
  const router = useRouter();

  return (
    <Markdown
      source={text}
      onLinkPress={(href) => {
        if (href.startsWith('/')) {
          router.push(href as Href);
          return false; // handled: skip the default
        }
        // Custom schemes are never opened by the default, so open them here:
        if (!/^(https?|mailto|tel):/i.test(href)) {
          void Linking.openURL(href).catch(() => {});
          return false;
        }
        return true; // http(s), mailto and tel: let the default open them
      }}
    />
  );
}
```

Things to know:

- If your v0 handler opened every URL itself, **return `false`** from the v1 handler or the link opens twice.
- The default opens only `http`, `https`, `mailto` and `tel`. Relative URLs and custom schemes (`myapp://…`) are reported to `onLinkPress` but never opened by default. Deep links need your handler.
- `info` is `{ title }`, the link's title attribute (or `null`).
- Errors from `openURL` are caught.

If you really need a custom link element (a chip, a different press target), use `components.Link`:

```tsx
import { Text } from 'react-native';
import { Markdown, type ElementProps } from '@docren/react-native-markdown';

function Link({ href, children, style }: ElementProps<'Link'>) {
  return (
    <Text style={style.text} accessibilityRole="link" accessibilityHint={href}>
      {children}
    </Text>
  );
}

const components = { Link };

export function Links({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

A custom `Link` that handles its own `onPress` bypasses `onLinkPress` and the scheme allowlist. Prefer the handler unless you need that.

An inline element may only return text-compatible output (`<Text>`, strings). To return a `View` (a chip, a badge), wrap the component in `inlineView()` so it is laid out as an inline attachment:

```tsx
import { Text, View } from 'react-native';
import {
  Markdown,
  inlineView,
  type InlineViewProps,
} from '@docren/react-native-markdown';

// An inline view also receives `baseline`: the font metrics of the text it
// sits in, because inline attachments don't align to the baseline by themselves.
function LinkChip({ href, children, baseline }: InlineViewProps<'Link'>) {
  return (
    <View
      accessibilityHint={href}
      style={{ height: baseline.lineHeight, justifyContent: 'center' }}
    >
      <Text>{children}</Text>
    </View>
  );
}

const components = { Link: inlineView(LinkChip) };

export function Chips({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

### `code`

`node.lang` becomes `language` (or `null`), `node.value` becomes `code`. There is also `meta`, the rest of the info string. A code block has no `children`.

```jsx
import CodeHighlighter from 'react-native-code-highlighter';

renderRules={{
  code: ({ node }) => (
    <CodeHighlighter key={node.key} language={node.lang || 'plaintext'}>
      {node.value}
    </CodeHighlighter>
  ),
}}
```

```tsx
import CodeHighlighter from 'react-native-code-highlighter';
import { Markdown, type ElementProps } from '@docren/react-native-markdown';

function CodeBlock({ language, code }: ElementProps<'CodeBlock'>) {
  return (
    <CodeHighlighter language={language ?? 'plaintext'}>{code}</CodeHighlighter>
  );
}

const components = { CodeBlock };

export function Highlighted({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

There is still no built-in syntax highlighter; bring your own, as before.

### `inlineCode`

`node.value` becomes `code`. No `children`.

```jsx
renderRules={{
  inlineCode: ({ node }) => <Text key={node.key}>{node.value}</Text>,
}}
```

```tsx
import { Text } from 'react-native';
import { Markdown, type ElementProps } from '@docren/react-native-markdown';

function InlineCode({ code, style }: ElementProps<'InlineCode'>) {
  return <Text style={style.text}>{code}</Text>;
}

const components = { InlineCode };

export function Inline({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

### `delete`

Renamed to `Strikethrough`. It is on by default now (strikethrough is part of GFM, which v1 enables).

```jsx
renderRules={{
  delete: ({ node, children }) => <Text key={node.key}>{children}</Text>,
}}
```

```tsx
import { Text } from 'react-native';
import { Markdown, type ElementProps } from '@docren/react-native-markdown';

function Strikethrough({ children, style }: ElementProps<'Strikethrough'>) {
  return (
    <Text style={[style.text, { textDecorationLine: 'line-through' }]}>
      {children}
    </Text>
  );
}

const components = { Strikethrough };

export function Struck({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

### `thematicBreak`

Renamed to `Divider`. No `children`.

```jsx
renderRules={{
  thematicBreak: ({ node }) => <View key={node.key} style={{ height: 1 }} />,
}}
```

```tsx
import { View } from 'react-native';
import { Markdown, type ElementProps } from '@docren/react-native-markdown';

function Divider({ style }: ElementProps<'Divider'>) {
  return <View style={[style.container, { height: 2 }]} />;
}

const components = { Divider };

export function Divided({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

### `image`

v0 had one `image` rule. v1 splits it in two, because an image alone in a paragraph is a **block** and an image inside a line of text is **inline**:

| v1 element | When | Props |
|---|---|---|
| `Image` | the image is the only content of its paragraph | `src`, `alt`, `title` |
| `InlineImage` | the image sits inside a line of text | `src`, `alt`, `title`, `width`, `height` |

`node.url` becomes `src`. Override both if you want consistent images. Reference-style images (`![alt][ref]`) resolve to the same elements; there is nothing to do for them.

```jsx
import { Image } from 'expo-image';

renderRules={{
  image: ({ node }) => (
    <Image key={node.key} source={{ uri: node.url }} alt={node.alt ?? ''} />
  ),
}}
```

```tsx
import { Image } from 'expo-image';
import { Markdown, type ElementProps } from '@docren/react-native-markdown';

function BlockImage({ src, alt }: ElementProps<'Image'>) {
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt}
      style={{ width: '100%', height: 300, borderRadius: 8 }}
    />
  );
}

function SmallImage({ src, alt }: ElementProps<'InlineImage'>) {
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt}
      style={{ width: 20, height: 20 }}
    />
  );
}

const components = { Image: BlockImage, InlineImage: SmallImage };

export function Pictures({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

Image loading is also gated by the new [`images` policy](#images).

### `text`

Plain text is **not** a component in v1. Text runs are raw strings inside the block's `<Text>`, which keeps paragraphs a single text layout. Style it with theme tokens instead:

```jsx
renderRules={{
  text: ({ node }) => <Text key={node.key} style={{ color: '#222' }}>{node.value}</Text>,
}}
```

```tsx
import { Markdown, createTheme } from '@docren/react-native-markdown';

const theme = createTheme({
  colors: { text: '#222' },
  fonts: { body: 'Georgia' },
  fontSize: { base: 17 },
});

export function Body({ text }: { text: string }) {
  return <Markdown source={text} theme={theme} />;
}
```

If you used a `text` rule to transform the content (emoji shortcodes, mentions), write a [plugin](#extensions--plugins) instead.

## `listBulletStyle` and `customBulletElement`

`listBulletStyle="dash"` becomes a `listBullets` theme token: one bullet per nesting depth. `customBulletElement` becomes a `ListItem` component, which receives the computed `marker` and renders the row itself.

```jsx
<Markdown markdown={text} listBulletStyle="dash" />
```

```tsx
import { Markdown, createTheme } from '@docren/react-native-markdown';

const theme = createTheme({ listBullets: ['–', '·'] });

export function Dashes({ text }: { text: string }) {
  return <Markdown source={text} theme={theme} />;
}
```

```jsx
<Markdown markdown={text} customBulletElement={<Icon name="star" />} />
```

```tsx
import { Text, View } from 'react-native';
import { Markdown, type ElementProps } from '@docren/react-native-markdown';

function ListItem({ marker, ordered, children, style }: ElementProps<'ListItem'>) {
  return (
    <View style={[{ flexDirection: 'row' }, style.container]}>
      <Text style={style.text}>{ordered ? marker : '★'} </Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const components = { ListItem };

export function Stars({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

`ListItem` also receives `index`, and `checked` (`boolean | null`) for task list items. A custom `ListItem` replaces the whole row, so render the checkbox yourself when `checked !== null`, or leave task lists to the default.

## `extensions` → `plugins`

v0 `extensions` were mdast-util-from-markdown/micromark extensions. v1 parses with markdown-it, so those extensions **do not work** and there is **no adapter** for them. Rewrite each one as a plugin made with `definePlugin`:

- `syntax.markdownIt` adds the syntax (a markdown-it rule).
- `nodes` maps the tokens your rule produces to element props.
- `components` renders them, and `theme` styles them.

```jsx
// v0: a micromark syntax extension + an mdast-util extension
import { mention, mentionFromMarkdown } from './mention';

<Markdown
  markdown={text}
  extensions={[mention()]}
  mdastExtensions={[mentionFromMarkdown()]}
  renderRules={{ mention: ({ node }) => <Text>@{node.value}</Text> }}
/>;
```

```tsx
import { Text } from 'react-native';
import { Markdown, definePlugin } from '@docren/react-native-markdown';

const mentions = definePlugin({
  name: 'mentions',
  syntax: {
    markdownIt: (md) => {
      // `@name` → a self-contained inline `mention` token.
      md.inline.ruler.before('emphasis', 'mention', (state, silent) => {
        const match = /^@(\w+)/.exec(state.src.slice(state.pos));
        if (!match) return false;
        if (!silent) {
          const token = state.push('mention', 'span', 0);
          token.content = match[1]!;
        }
        state.pos += match[0].length;
        return true;
      });
    },
  },
  nodes: {
    Mention: {
      kind: 'inline',
      token: 'mention',
      from: (token) => ({ userId: token.content }),
    },
  },
  components: {
    // `userId` is inferred from `from` above.
    Mention: ({ userId, style }) => <Text style={style.text}>@{userId}</Text>,
  },
  theme: { Mention: { text: { color: '#0a66c2' } } },
});

const plugins = [mentions];

export function Chat({ text }: { text: string }) {
  return <Markdown source={text} plugins={plugins} />;
}
```

Notes:

- **GFM is built in.** Tables, task lists, strikethrough, autolinks and footnotes are part of the default `preset="gfm"`. Remove any GFM `extensions`. Set `preset="commonmark"` for strict CommonMark, or `preset={{ base: 'gfm', exclude: ['tables'] }}` to drop individual features.
- **Plugins come after the preset**, in array order, and a later plugin overrides an earlier one. The `components` and `theme` props override all plugins.
- To use a plugin's elements in the `components` and `theme.elements` props of `<Markdown>`, a plugin package declares them once by augmenting `PluginElementPropsMap` (see [04 · Element catalog](rewrite/04-api.md#types)).
- A plugin element that renders a `View` inline must set `inlineView: true` on its node.

## `debug`

Removed. Use React DevTools to inspect the rendered tree. Delete the prop.

## New behaviour to know about

These are changes in what the same markdown produces, or in what your handlers receive.

### Links

See [`link` and `onLinkPress`](#link-and-onlinkpress). In short: `onLinkPress` runs first and no longer replaces the default; return `false` to cancel it; the default only opens `http`, `https`, `mailto` and `tel`.

### Images

`images` controls which images load. The default, `'allow'`, matches v0. For untrusted content (user posts, LLM output) restrict it. A refused image renders as its alt text.

```tsx
import { Markdown } from '@docren/react-native-markdown';

export function Untrusted({ text }: { text: string }) {
  return (
    <Markdown
      source={text}
      images={{ allowHosts: ['images.example.com', '*.cdn.example.com'] }}
    />
  );
}
```

- `'allow'` loads every image.
- `'deny'` loads none.
- `{ allowHosts }` loads images whose host is listed. Entries are exact hosts, or `*.example.com` for subdomains only (not the bare domain). Relative and `data:` images never match.

Use `onImagePress(src, { alt, title })` to make images pressable.

### HTML

v0 did not render HTML. v1 reads it, and `html` controls what happens:

| `html` | Behaviour |
|---|---|
| `'safe'` (default) | An allowlist of inline tags becomes elements (`<br>`, `<b>`, `<strong>`, `<i>`, `<em>`, `<s>`, `<del>`, `<u>`, `<mark>`, `<sup>`, `<sub>`, `<kbd>`). Everything else is shown as literal text. |
| `'text'` | All HTML shown as literal text. This is the closest to v0. |
| `'strip'` | Tags removed, the text between them kept. |
| `{ allow: [...] }` | Your own subset of the supported tags. |

Attributes are always ignored, and block-level HTML (`<div>`, `<details>`, `<table>`) is never interpreted. If you want v0's output exactly, use `html="text"`.

```tsx
import { Markdown } from '@docren/react-native-markdown';

export function LiteralHtml({ text }: { text: string }) {
  return <Markdown source={text} html="text" />;
}
```

### Other changes

- **GFM on by default.** In v0, tables, task lists, strikethrough, autolinks and footnotes were plain text. Content that contained, say, `~~x~~` or a pipe table now renders as elements. Use `preset="commonmark"` to keep the old text output.
- **Soft line breaks.** A single newline inside a paragraph renders as a space, like browsers and GitHub. Set `softBreak="newline"` to keep line breaks.
- **Superscript and subscript** from `<sup>` and `<sub>` use Unicode characters where one exists (`mc²`, `H₂O`). `scriptFallback` controls the rest.
- **Interactive callbacks are opt-in.** `onTaskToggle` makes task checkboxes pressable, `onFootnotePress` makes footnote references and back-links pressable (the app does the scrolling).
- **Keys.** Never add `key` to a component's output. v1 handles keys.

## There is no `renderRules` adapter

An earlier design floated a temporary `fromRenderRules()` adapter. It was dropped ([P1-26](rewrite/phase-1/decisions.md#p1-26-no-fromrenderrules-adapter)): v0 rules need an mdast `node`, pre-rendered `children` and `parentStack`, none of which v1 has, so an adapter could only fake them and would only cover rules that read one or two node fields. Those are exactly the one-line renames shown above. Rules that use anything more need a manual rewrite either way.

If you need to walk the document yourself (a table of contents, say), use `visit()`:

```tsx
import { parse, visit } from '@docren/react-native-markdown';

export function headings(source: string) {
  const toc: { level: number; id: string; text: string }[] = [];
  visit(parse(source), {
    Heading: ({ level, id }, { text }) => toc.push({ level, id, text }),
  });
  return toc;
}
```
