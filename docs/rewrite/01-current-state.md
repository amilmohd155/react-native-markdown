# 01 · Current state (v0.8.5)

The whole library is about 780 lines in `src/`. This document records what to keep and what to leave behind.

## Pipeline today

```
markdown string
   │  fromMarkdown() + 2 transform extensions (mutate tree: resolve refs, add keys)
   ▼
mdast tree
   │  ASTRenderer.renderNode()  (recursive, depth-first, children rendered eagerly)
   ▼
React element tree  ← returned directly from <Markdown>
```

In parallel, `getMergedStyles` builds a doubled style map (`key` + `_VIEW_SAFE_key`) on every render.

## Worth keeping

- **Render rules keyed by node type**, with parameter types derived from mdast's `RootContentMap`.
- **mdast-shaped nodes.** The format is well documented, users know it, and the unified ecosystem uses it.
- **Reference resolution** (`[text][ref]`) out of the box.
- **Stable, position-derived keys** as an idea.

## Bugs found

| Where | Problem | Effect |
|---|---|---|
| `libs/renderRules.tsx:96` | `extras?.onPress(url) \|\| Linking.openURL(url)` | A custom `onLinkPress` that returns `undefined` (almost all do) still opens the URL. The `openURL` promise is never caught. |
| `components/ASTRenderer.ts:133` | `table` / `tableRow` / `tableCell` return `null` before render rules are looked up | User `table` rules can never run, though the README advertises GFM through extensions. Children are rendered and then discarded, and a warning is logged on every render. |
| `libs/renderRules.tsx:131` | `html`, `footnote*` and unresolved `linkReference`/`imageReference` fall to `unknown → null` | Content disappears silently. CommonMark requires unresolved references to render as literal text. |
| `utils/resolveReference.ts:78` | Collects definitions from top-level children only | Definitions inside blockquotes or lists are ignored. Uses `indexOf` in a loop (O(n²)). |
| `libs/styles.ts` | `paragraph` has `flexDirection`/`flexWrap`/`width` on `<Text>`. `link` has `transform` and a fixed `fontSize: 16`. Weights `'semibold'`/`'black'` are used. | No-ops on Text. Transforms don't apply to nested Text, and the fixed size overrides heading sizes. Those weight names are iOS-only. |
| `libs/renderRules.tsx:44` | Hardcoded `maxFontSizeMultiplier={1.2}` on every text node | Caps the user's accessibility font scaling. |
| `utils/getKey.ts:12` | Random-key fallback is unreachable, and would be unstable anyway | Dead code. |

## Structural limits (why patching isn't enough)

1. **No caching between renders.** Every render re-parses, re-merges styles (`flatten` + `StyleSheet.create` per key) and rebuilds the full element tree. `memo` rarely helps, because `extensions = []` is a new array each time and users pass inline `styles`/`renderRules`.
2. **Slow parser for mobile.** micromark is 7–15× slower than markdown-it or marked (see [02](./02-benchmarks.md)).
3. **Rendering is not incremental.** A one-character change, or a streamed token, re-parses and re-renders everything.
4. **Monolithic subtree.** Long documents mount every node at once, with no virtualization.
5. **Three tree walks per render.** Reference resolution, key assignment and rendering are separate passes, plus a `[node, ...parentStack]` copy at every node.
6. **One `<Text>` per text node**, which inflates element and shadow-node counts.
7. **The `_VIEW_SAFE_` style hack** doubles the style map and makes choosing the wrong variant an easy bug.
8. **Loose types.** There is a lot of `any`, `StyleMap = Record<string, …>`, and `@ts-ignore` in the module augmentation.
9. **No tests.** The suite is a single `it.todo`, and the release workflow publishes without running any checks. (release-it's `skipChecks: true` is a separate matter: npm Trusted Publishing requires it; see [P1-7](./phase-1/decisions.md#p1-7-keep-release-it-skipchecks-gate-releases-in-the-release-workflow).)
10. **Packaging and docs.**
    - `css-to-react-native` is a runtime dependency but only the example uses it.
    - Peer dependencies are `"*"`.
    - The README's base example doesn't compile.
    - The README promises "GFM support" but tables don't render.
