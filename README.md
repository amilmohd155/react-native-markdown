# React Native Markdown Renderer

![NPM License](https://img.shields.io/npm/l/%40docren%2Freact-native-markdown)
![NPM Version](https://img.shields.io/npm/v/%40docren%2Freact-native-markdown)
![runs with expo](https://img.shields.io/badge/Runs%20with%20Expo-4630EB.svg?style=flat-square&logo=EXPO&labelColor=f3f3f3&logoColor=000)
![npm](https://img.shields.io/badge/types-included-blue?style=flat-square)

A Markdown renderer for React Native. CommonMark and GitHub Flavored Markdown render as native `Text` and `View` elements that you can restyle, replace or extend, in pure JavaScript, so it runs in Expo Go and on the web.

> **v1 pre-release.** This is the documentation for v1, which isn't published to npm yet; `npm install` still gives v0.x. Coming from v0.x? Read the [migration guide](docs/migration-from-v0.md). v0.x keeps getting bug fixes on the `main` branch (`^0.8`).

## Features

- 📄 **CommonMark and GFM.** Parsed with markdown-it. Tables, task lists, strikethrough, autolinks and footnotes are on by default; choose `commonmark` or exclude single features with `preset`.
- 🎨 **Theme tokens.** Colors, fonts, sizes and spacing, with built-in light and dark themes (`theme="auto"` follows the system), plus per-element overrides.
- 🧱 **Replaceable elements.** Swap any element for your own component with `components`. Components get semantic props (`level`, `href`, `code`) and a resolved `style`, never a parser node.
- 🧩 **Plugins.** Add syntax with `definePlugin`: a markdown-it rule, the element it produces, how it renders and how it is themed, all type-checked.
- 🔐 **Safe by default.** Links open only `http`, `https`, `mailto` and `tel`; `images` can be denied or limited to hosts; raw HTML is a small allowlist of inline tags, everything else is shown as text.
- 📦 **Pure JS.** No native module, so Expo Go, the web and any React Native app work unchanged.
- 🔤 **TypeScript first.** Types are included, and plugin elements are typed through `components` and `theme`.

## Installation

```sh
npm install @docren/react-native-markdown
# or
yarn add @docren/react-native-markdown
# or
pnpm add @docren/react-native-markdown
```

Peer dependencies: `react >= 18.2` and `react-native >= 0.76`.

## Usage

```tsx
import { ScrollView } from 'react-native';
import { Markdown } from '@docren/react-native-markdown';

export default function App() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Markdown source={'# Hello world\n\nSome **bold** text and a [link](https://example.com).'} />
    </ScrollView>
  );
}
```

`<Markdown>` doesn't scroll by itself; put it in the scroll view you already have.

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `source` | `string` | — | The Markdown to render. Pass either `source` or `document`. |
| `document` | `MarkdownDocument` | — | Pre-parsed with `parse()`, so nothing is parsed during render. |
| `preset` | `'gfm' \| 'commonmark' \| { base: 'gfm', exclude: GfmPluginName[] }` | `'gfm'` | Which built-in syntax is on. |
| `plugins` | `MarkdownPlugin[]` | `[]` | Added on top of the preset. |
| `components` | `Partial<Components>` | built-in | Replace any element. See [Components](#components). |
| `theme` | `ThemeInput \| 'light' \| 'dark' \| 'auto'` | `'auto'` | See [Theme](#theme). |
| `onLinkPress` | `(href, info) => boolean \| void` | opens with `Linking` | Called first for every link. Return `false` to skip the default. |
| `onImagePress` | `(src, info) => void` | none | Makes images pressable. |
| `onTaskToggle` | `(checked, info) => void` | none | Makes task list checkboxes interactive. |
| `onFootnotePress` | `(label, info) => void` | none | Makes footnote references and back-links pressable. You do the scrolling. |
| `html` | `'safe' \| 'text' \| 'strip' \| { allow: HtmlTag[] }` | `'safe'` | What happens to raw HTML. |
| `images` | `'allow' \| 'deny' \| { allowHosts: string[] }` | `'allow'` | Which images load. A refused image renders as its alt text. |
| `softBreak` | `'space' \| 'newline'` | `'space'` | How a single newline inside a paragraph renders. |
| `scriptFallback` | `'smaller' \| 'raised'` | `'smaller'` | `<sup>` / `<sub>` content with no Unicode form. |
| `selectable` | `boolean` | `false` | Text selection within each block. |
| `maxFontSizeMultiplier` | `number` | unset | Caps font scaling for accessibility. |

The full reference, including every element and its props, is in [`docs/rewrite/04-api.md`](docs/rewrite/04-api.md).

### Links

The default opens `http`, `https`, `mailto` and `tel` links with `Linking`. Relative URLs and custom schemes (deep links) are only reported to `onLinkPress`, so handle them there:

```tsx
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
        return true;
      }}
    />
  );
}
```

### Theme

A theme is a set of tokens, from which every element's style is derived, plus overrides for single elements. It always merges onto a built-in theme.

```tsx
import { Markdown, createTheme } from '@docren/react-native-markdown';

const theme = createTheme({
  colors: { link: 'tomato' },
  fontSize: { base: 16, scale: 1.25 },
  listBullets: ['•', '–'],
  elements: {
    Blockquote: { container: { backgroundColor: '#cad8ee', borderRadius: 12 } },
    Heading: (level) => ({ text: { fontWeight: level <= 2 ? '700' : '600' } }),
  },
});

export function Styled({ text }: { text: string }) {
  return <Markdown source={text} theme={theme} />;
}
```

`lightTheme` and `darkTheme` are exported, and `useMarkdownTheme()` gives custom components the resolved styles. Custom fonts take a family name or a face map (`{ regular, italic, bold, boldItalic }`).

### Components

Every element is a component you can replace. It receives semantic props, `children` where it has them, and `style`: `{ text, container }`, resolved from the theme. To wrap a built-in instead of replacing it, use `defaults`.

```tsx
import { Text } from 'react-native';
import {
  Markdown,
  defaults,
  type ElementProps,
} from '@docren/react-native-markdown';

function CodeBlock(props: ElementProps<'CodeBlock'>) {
  return props.language === 'mermaid' ? (
    <Text>{props.code.split('\n').length}-line diagram</Text>
  ) : (
    <defaults.CodeBlock {...props} />
  );
}

const components = { CodeBlock };

export function Doc({ text }: { text: string }) {
  return <Markdown source={text} components={components} />;
}
```

Block elements: `Heading`, `Paragraph`, `Blockquote`, `List`, `ListItem`, `CodeBlock`, `Table`, `TableRow`, `TableCell`, `Divider`, `Image`, `HtmlBlock`, `FootnoteDefinition`. Inline elements: `Strong`, `Emphasis`, `Strikethrough`, `InlineCode`, `Link`, `InlineImage`, `LineBreak`, `FootnoteReference`, `Underline`, `Highlight`, `Superscript`, `Subscript`, `Kbd`, `HtmlInline`.

Inline elements normally return text. To return a `View` (a chip, a badge), wrap the component in `inlineView()`.

There is no built-in syntax highlighter. Bring your own in a `CodeBlock` component, as above.

### Plugins

A plugin adds syntax, maps it to an element, and renders it:

```tsx
import { Text } from 'react-native';
import { Markdown, definePlugin } from '@docren/react-native-markdown';

const mentions = definePlugin({
  name: 'mentions',
  syntax: {
    markdownIt: (md) => {
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
    Mention: ({ userId, style }) => <Text style={style.text}>@{userId}</Text>,
  },
});

const plugins = [mentions];

export function Chat({ text }: { text: string }) {
  return <Markdown source={text} plugins={plugins} />;
}
```

### Raw HTML

With the default `html="safe"`, these inline tags become elements: `<br>`, `<b>`, `<strong>`, `<i>`, `<em>`, `<s>`, `<del>`, `<u>`, `<mark>`, `<sup>`, `<sub>`, `<kbd>`. Attributes are ignored. Everything else, including block-level HTML, is shown as text. Use `html="text"` to show all HTML as text, `html="strip"` to remove tags, or `html={{ allow: [...] }}` for your own subset.

### Parsing ahead of time

```tsx
import { Markdown, parse, visit } from '@docren/react-native-markdown';

const source = '# Intro\n\n## Setup';
const doc = parse(source); // opaque, immutable, cacheable

const toc: { level: number; id: string; text: string }[] = [];
visit(doc, { Heading: ({ level, id }, { text }) => toc.push({ level, id, text }) });

export const Rendered = () => <Markdown document={doc} />;
```

## Migrating from v0.x

The props changed (`markdown` → `source`, `styles` → `theme`, `renderRules` → `components`, `extensions` → `plugins`), and a few defaults did too: links, images, raw HTML and GFM. The [migration guide](docs/migration-from-v0.md) covers every v0.x prop and render rule with before/after code.

## Compatibility

- React Native 0.76+, React 18.2+.
- Expo Go: no native code, no config plugin. (`yarn check:expo-go` in this repo keeps the main entry free of native imports.)
- Web, through `react-native-web`.

## Roadmap

Planned after v1.0, in order: streaming for LLM output, `virtualize` for long documents, a lazy syntax-highlighting entry point, and an optional native parser backend. Details and the design documents are in [`docs/rewrite`](docs/rewrite/README.md).

## Acknowledgements

Inspired by [react-native-markdown-display](https://github.com/iamacup/react-native-markdown-display), whose author laid the groundwork for Markdown rendering in React Native. Parsing is done by [markdown-it](https://github.com/markdown-it/markdown-it).

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

[MIT](./LICENSE)

## Authors

- [amilmohd155](https://www.github.com/amilmohd155)
