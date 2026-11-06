/**
 * Device benchmark fixtures. Spec: docs/rewrite/phase-1/benchmark-protocol.md
 * (Fixtures). Hand-written content, no generated or downloaded text.
 *
 * - F1: one chat message (paragraphs, list, inline code, link), ~1 KB.
 * - F2: a typical README (headings, code blocks, tables, lists), ~10 KB.
 * - F3: F2-style content repeated, ~100 KB.
 * - F3-cm: F3 with every GFM construct stripped (`./commonmark`), so v0.8.5
 *   (no GFM) and v1 do the same work. Derived, not hand-written.
 *
 * Deviation from the protocol: no images yet. Local image assets can't be
 * referenced from markdown in the example app without an asset resolver,
 * and remote images would put network time in the numbers.
 *
 * - F5: 200 chat messages for a `FlatList`, ~200 KB (`F5_MESSAGES`). Not in
 *   `FIXTURES`: it has its own run (heap and scroll), see BenchList.tsx.
 *
 * F4 (streaming) comes with phase 2.
 */

import { toCommonMark } from './commonmark';

export const F1 = `Sure! Here's how to fix the **build error** you're seeing.

The problem is that \`metro.config.js\` doesn't know about the monorepo root, so Metro
can't resolve the workspace package. You have two options:

1. Add the root to \`watchFolders\` and point \`nodeModulesPaths\` at both folders.
2. Use [react-native-monorepo-config](https://github.com/satya164/react-native-monorepo-config),
   which does both for you.

The second option is less work:

\`\`\`js
const { withMetroConfig } = require('react-native-monorepo-config');
module.exports = withMetroConfig(getDefaultConfig(__dirname), { root, dirname: __dirname });
\`\`\`

After changing it, restart Metro with \`--clear\` so the old resolution cache is dropped.
If it still fails, send me the full error and the output of \`yarn why react-native\`.
`;

const SECTION = (n: number) => `## ${n}. Configuration

Every option has a sensible default, so most apps only set a few of them. Options are
read once, when the component mounts, and **changing them later re-renders** the
affected blocks without parsing the document again.

| Option | Type | Default | Description |
|---|---|---|---|
| \`source\` | \`string\` | — | The markdown to render |
| \`preset\` | \`'gfm' \\| 'commonmark'\` | \`'gfm'\` | Which syntax to enable |
| \`theme\` | \`Theme \\| 'auto'\` | \`'auto'\` | Colors, fonts and spacing |
| \`softBreak\` | \`'space' \\| 'newline'\` | \`'space'\` | How soft line breaks render |
| \`selectable\` | \`boolean\` | \`false\` | Text selection within blocks |
| \`onLinkPress\` | \`(href) => boolean \\| void\` | opens the URL | Return \`false\` to cancel |

### ${n}.1 Themes

A theme has two levels. **Tokens** cover what most apps change: colors, fonts, the base
font size and the spacing scale. **Element overrides** give full control over a single
element when the tokens aren't enough.

\`\`\`tsx
const theme = createTheme({
  colors: { text: '#1f2328', link: '#0969da', codeBg: '#f6f8fa' },
  fonts: { body: 'Inter', mono: 'JetBrainsMono' },
  fontSize: { base: 16, scale: 1.2 },
  elements: {
    Link: { text: { textDecorationLine: 'none' } },
  },
});
\`\`\`

> Element styles are split into \`text\` and \`container\`, so a view style can never end
> up on a \`<Text>\` by accident. Inline styles only carry what they change: a **bold**
> run inside a heading keeps the heading's size.

### ${n}.2 Custom components

Replace any element by passing a component for it. Components receive plain props,
so wrapping them in \`React.memo\` works as expected:

- \`Heading\` receives \`level\` and \`id\` (a slug for anchors).
- \`CodeBlock\` receives \`code\`, \`language\` and \`meta\`.
- \`Link\` receives \`href\` and \`title\`; its children are the link text.
- \`ListItem\` receives \`index\`, \`marker\` and \`checked\` for task items.
  - Nested lists get their bullet from the theme's \`listBullets\`.
  - Ordered markers align to the right, so "9." and "10." line up.

\`\`\`tsx
function CodeBlock({ code, language }: ElementProps<'CodeBlock'>) {
  if (language === 'mermaid') return <Mermaid source={code} />;
  return <defaults.CodeBlock code={code} language={language} meta={null} />;
}
\`\`\`

### ${n}.3 Performance notes

Parsing happens once per change of \`source\`. Each top-level block is memoized, so
editing the last paragraph of a long document re-renders **only that paragraph**.
For chat apps, parse messages ahead of time with \`parse()\` and pass the document:

1. Parse when the message arrives, outside render.
2. Keep the \`MarkdownDocument\` with the message in your store.
3. Render \`<Markdown document={doc} />\`; nothing is parsed during render.

Long documents can opt into virtualization with \`virtualize\`, which renders blocks
through a list instead of a plain view. Leave it off inside another list: nesting
virtualized lists causes scroll and measurement problems.

---
`;

const README_HEAD = `# react-native-markdown

A fast, themeable **Markdown renderer for React Native**, built on a flat document model
and memoized blocks. It runs in Expo Go, on iOS, Android and the web, and supports
CommonMark plus the full GitHub Flavored Markdown set: tables, task lists,
~~strikethrough~~, autolinks like https://example.com and footnotes[^perf].

- [x] CommonMark and GFM spec suites
- [x] Expo Go, no native code in the default entry
- [ ] Streaming (phase 2)

## Installation

\`\`\`sh
npm install @docren/react-native-markdown
# or
yarn add @docren/react-native-markdown
\`\`\`

## Usage

\`\`\`tsx
import { Markdown } from '@docren/react-native-markdown';

export function Message({ text }: { text: string }) {
  return <Markdown source={text} onLinkPress={(href) => console.log(href)} />;
}
\`\`\`

`;

const README_TAIL = `## License

MIT. See [LICENSE](./LICENSE) for details.

[^perf]: Measured on device in release builds; see the benchmark protocol.
`;

/** ~10 KB: head, three configuration sections, tail. */
export const F2 =
  README_HEAD + SECTION(1) + SECTION(2) + SECTION(3) + README_TAIL;

/** ~100 KB: F2-style content, many sections. */
export const F3 =
  README_HEAD +
  Array.from({ length: 34 }, (_, i) => SECTION(i + 1)).join('') +
  README_TAIL;

/** ~98 KB: F3 without tables, task lists, strikethrough, autolinks and footnotes. */
export const F3_CM = toCommonMark(F3).source;

/** Messages in the F5 chat list. */
export const F5_COUNT = 200;

/**
 * F5: 200 chat messages (~200 KB), rendered one per row of a `FlatList`.
 * Each is F1 with a distinct prefix, so no two messages are identical.
 */
export const F5_MESSAGES: readonly string[] = Array.from(
  { length: F5_COUNT },
  (_, i) => `Re #${i + 1}: ${F1}`
);

export interface Fixture {
  readonly id: 'F1' | 'F2' | 'F3' | 'F3-cm';
  readonly source: string;
}

export const FIXTURES: readonly Fixture[] = [
  { id: 'F1', source: F1 },
  { id: 'F2', source: F2 },
  { id: 'F3', source: F3 },
  { id: 'F3-cm', source: F3_CM },
];

/**
 * `source` with its last sentence edited, for `reRenderOneBlock`: the edit
 * is inside the last block, so exactly one block changes.
 */
export function editLastParagraph(source: string): string {
  const at = source.lastIndexOf('.');
  return `${source.slice(0, at)} (edited)${source.slice(at)}`;
}
