# React Native Markdown Renderer

![NPM License](https://img.shields.io/npm/l/%40amilmohd155%2Freact-native-markdown)
![NPM Version](https://img.shields.io/npm/v/%40amilmohd155%2Freact-native-markdown)
![runs with expo](https://img.shields.io/badge/Runs%20with%20Expo-4630EB.svg?style=flat-square&logo=EXPO&labelColor=f3f3f3&logoColor=000)
![npm](https://img.shields.io/badge/types-included-blue?style=flat-square)

A flexible and performant Markdown renderer for React Native, powered by MDAST. Supports custom styling, nested elements, and extendable render rules for full control over output.

## Features

- 📄 CommonMark-Compliant – Parses and renders Markdown based on the CommonMark spec
- 🧩 GFM Support – Extend Markdown with GitHub Flavored Markdown features via pluggable extensions.
- ⚛️ React Native First – Designed specifically for rendering Markdown in React Native environments
- 🎯 AST-Based Rendering – Fine-grained control using custom render rules powered by MDAST nodes
- 🛠️ Fully Customizable – Customize how each Markdown element is rendered with flexible render rules
- 🧠 Lightweight & Tree-Shakeable – Minimal footprint with no bundled syntax highlighters
- 🔐 TypeScript First – Strong typing throughout for safer and more predictable code

**_Markdown_** – Render Markdown with customizable components, AST access, and full control over rendering behavior.

## Acknowledgements

This package is inspired by [react-native-markdown-display](https://github.com/iamacup/react-native-markdown-display) — many thanks to the original author for laying the groundwork for Markdown rendering in React Native.

We’ve built on this foundation with a fully type-safe architecture, swapped in the lighter and more modern mdast-util-from-markdown parser for better performance and maintainability, and added extended support for more Markdown elements, custom rendering, and advanced features.

## Installation

NPM

```sh
npm install @amilmohd155/react-native-markdown
```

Yarn

```sh
yarn add @amilmohd155/react-native-markdown
```

PNPM

```sh
pnpm add @amilmohd155/react-native-markdown
```

## Base Usage

```jsx
import { View, StyleSheet, ScrollView } from 'react-native';

import { Markdown } from '@amilmohd155/react-native-markdown';

export default function App() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown
          markdown={`#Hello world`}
          }
        />
      </ScrollView>
    </View>
  );
}

export default App;
```

For more detailed usage ⬇️

### Props and Methods

The `<Markdown>` component takes the following props.

| Prop                | Type                  | Default                              | Description                                                                                                                                                                                                            |
| ------------------- | --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| markdon             | string \| Uint8Array  | N/A                                  | `required` The Markdown content to render. Accepts plain strings or .md file contents as Uint8Array.                                                                                                                   |
| style               | StyleMap \| null      | [source](./src/libs/styles.ts)       | Styles applied to Markdown elements. Pass a map of styles keyed by Markdown element types.                                                                                                                             |
| mergeStyle          | boolean               | true                                 | Whether to merge default styles with the user-provided style map. If `false`, only your styles are used.                                                                                                               |
| renderRules         | RenderRules           | [source](./src/libs/renderRules.tsx) | Customize how specific Markdown elements are rendered using an object of render functions. Merged by default.                                                                                                          |
| listBulletStyle     | 'disc' \| 'dash'      | 'disc'                               | Defines the default bullet style for unordered lists (• or –).                                                                                                                                                         |
| customBulletElement | ReactElement \| null  | N/A                                  | Override the default list bullet with a custom React element. Applies to all unordered list items.                                                                                                                     |
| onLinkPress         | (url: string) => void | N/A                                  | Callback invoked when a link is pressed. Useful for navigation or analytics.                                                                                                                                           |
| extensions          | Extension[]           | []                                   | Extend or modify Markdown parsing by providing custom MDAST extensions. Useful for GFM or custom syntax. [To know more](https://github.com/syntax-tree/mdast-util-from-markdown?tab=readme-ov-file#list-of-extensions) |
| debug               | boolean               | false                                | Enable debug logs during parsing and rendering for development purposes.                                                                                                                                               |

## Syntax Support

- [x] blockquote
- [x] break
- [x] code
- [x] emphasis
- [x] definition
- [x] heading
  - [x] heading1
  - [x] heading3
  - [x] heading4
  - [x] heading2
  - [x] heading5
  - [x] heading6
- [x] image
- [x] imageReference
- [x] inlineCode
- [x] link
- [x] linkReference
- [x] list
- [x] listItem
- [x] paragraph
- [x] root
- [x] strong
- [x] text
- [x] thematicBreak
- [ ] strikethrough
- [ ] table
  - [ ] tableCell
  - [ ] tableRow
- [ ] html
- [ ] yaml

## Rules and Styles

### Styling Elements

Text styles follow a cascading approach, similar to how CSS works. Global styles can be set using the root style, which will apply across most Markdown elements, while still allowing you to override specific styles on individual elements when needed.

Keep in mind: the text style does not affect all text nodes—especially things like list bullets. If you want to apply a consistent style (e.g. color or font) to all text, it’s better to define it in the root style instead.

#### Styles

Styles allow you to customize the appearance of specific Markdown elements, overriding the default styling behavior,
[Default styling](./src/libs/styles.ts).

> By default, your styles are merged with the built-in styles. To override them completely, refer to the mergeStyle prop.

<details>

<summary>Styling example</summary>

<p>

```jsx
export default function App() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown
          markdown={mdxString}
          styles={{
            blockquote: {
              backgroundColor: '#cad8ee',
              borderRadius: 12,
            },
          }}
        />
      </ScrollView>
    </View>
  );
}
```

</p>

</details>

#### Rules

Rules let you define how specific Markdown elements should be rendered. You can find the default implementation [here](./src/libs/renderRules.tsx).

Note: When defining rules, make sure to assign a unique key to each component. You can use a custom value or the key provided in the node property.

> ℹ️ You don’t need to define rules for definition, linkReference, or imageReference, as these are internally resolved to link and image. You can still use them in your Markdown content. If you need customization, override the render rules for link and image.

> If you’re using this package with Expo, it’s recommended to use expo-image for rendering images.

> ⚠️ Currently, there’s a known issue with the type definition of node.key. Until it’s resolved in an upcoming patch, you can use `(node as any).key` or `@ts-ignore` to avoid TypeScript errors.

<details>

<summary>Render rule example</summary>

<p>

```jsx
 export default function App() {

const mdxString = `
          ![Alt text](https://fastly.picsum.photos/id/70/200/200.jpg?hmac=hRU7tEHltyLUTf0bCrAWFXlPRXOBTsvCcvL-dIUG2CE "Image title")
          `

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown
          markdown={mdxString}
          renderRules={{
            image: ({ node }) => (
              <Image
                key={(node as any).key}
                source={{ uri: node.url }}
                alt={node.alt ?? ""}
                style={{ width: "100%", height: 300, borderRadius: 8 }}
              />
            ),
          }}
        />
      </ScrollView>
    </View>
  );
}
```

</p>

</details>

#### Syntax Highlighing

This package doesn't include a syntax highlighting mechanish built-in, this decision was taken to keep the package lightweight. But you can use a package like [react-native-syntax-highlighter](https://www.npmjs.com/package/react-native-syntax-highlighter) or[react-native-code-highlighter](https://github.com/gmsgowtham/react-native-code-highlighter)

Once the syntax highlighter is implemented, you can use it by ovveridding `renderRule.code`.

This package does not include built-in syntax highlighting, as it aims to remain lightweight. However, you can integrate external libraries like [react-native-syntax-highlighter](https://www.npmjs.com/package/react-native-syntax-highlighter) or[react-native-code-highlighter](https://github.com/gmsgowtham/react-native-code-highlighter) for that functionality.

Once integrated, you can apply syntax highlighting by overriding the renderRule.code function.

An example implementation can be found in the included example app.

<details><summary>Syntax highlighting render rule</summary>

<p>

```jsx
<Markdown
  markdown={mdxString}
  renderRules={{
    code: ({ node }) => (
      <CodeHighlighter
        key={(node as any).key}
        hljsStyle={atomOneDarkReasonable}
        language={node.lang || 'plaintext'}
        scrollViewProps={{
          bounces: false,
          contentContainerStyle: styles.codeContentContainer,
        }}
        textStyle={styles.codeTextStyle}
      >
        {node.value}
      </CodeHighlighter>
    ),
  }}
/>
```

</p>

</details>

#### Handling Link

By default, links are handled by `Linking` from react-native. ie,

```tsx
import { Linking } from 'react-native';

Linking.openURL(url);
```

You can override this behavior in one of two ways:

<details>
<summary>
Using the onLinkPress callback
</summary>

<p>

```jsx

export default function App() {
    const mdxString = `[Link to Google](https://www.google.com)`

    const onLinkPress = (url: string) => {
        // Handle link press, e.g., open in a web browser or navigate to a screen
        console.log('Link pressed:', url);
    };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown markdown={mdxString} />
      </ScrollView>
    </View>
  );
}
```

</p>

</details>

<details>
<summary>
Providing a custom renderRule.link implementation
</summary>

<p>

To override the default link behavior, you can use a custom renderRule.link. If you’re using Expo, it’s recommended to use expo-router for internal links and expo-linking for external links.

```tsx
export default function Screen() {
  const markdown = `
[Explore](/explore)
        
[Google](https://google.com)
  `;

  const router = useRouter();

  const handleLinkPress = (url: string) => {
    if (!url.startsWith('/')) {
      // If the URL does not start with '/', treat it as an external link
      // and open it in the default browser.
      return Linking.openURL(url);
    }

    router.push(url as Href);
  };

  const rules: RenderRules = {
    link: ({ node, children }) => {
      return (
        <Text
          key={(node as any).key}
          style={{ color: 'blue', textDecorationLine: 'underline' }}
          onPress={() => handleLinkPress(node.url)}
        >
          {children}
        </Text>
      );
    },
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown markdown={markdown} renderRules={rules} />
      </ScrollView>
    </View>
  );
}
```

</p>

</details>

#### All rules and their associated styles

Most rules and styles share the same names, so refer to the [Syntax Support](#syntax-support) section for the complete list of available rules. Any exceptions with different naming are listed below.

When in doubt check the [default styling](./src/libs/styles.ts) and [default render rules](./src/libs/renderRules.tsx)

> No rules or styles are provided for definition, linkReference, and imageReference, as they are handled internally as link and image, as mentioned above.

| Render Rule | Style                                                             | Note                                                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| heading     | - heading1 - heading2 - heading3 - heading4 - heading5 - heading6 | For a single heading render rule, there are six style variations corresponding to the different heading levels (h1 through h6).                                                                                                                                         |
| listItem    | listItem, listBullet, listItemContent                             | listItem – Style for the container that wraps both the bullet and the content. listBullet – Style for the default bullet used in unordered lists ( • or –). [Not applicablefor custom bullet element] listItemContent – Style for the content portion of the list item. |

## Related

- [react-native-markdown-display](https://github.com/iamacup/react-native-markdown-display)

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

This project is licensed under the MIT License.

[MIT](./LICENSE)

## Authors

- [amilmohd155](https://www.github.com/amilmohd155)

## Built with ❤️

- [mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown)
- [css-to-react-native](https://github.com/styled-components/css-to-react-native)
