# Phase 3 · Official plugins

Emoji, mentions and admonitions as official plugins; math is deferred. Emoji and mentions are built; admonitions is design only. Decisions: [P3-21 to P3-27](./decisions.md). Reference: [04 · Plugins](../04-api.md#plugins).

## Packaging

Each plugin is a subpath entry of the one package ([P3-22](./decisions.md#p3-22-plugins-are-subpath-entries-of-one-package-pure-js)): `@docren/react-native-markdown/emoji`, `/mentions`, `/admonitions`. Not imported by the main entry, so an app only bundles what it uses.

- Pure JS, so Expo Go works ([D2](../07-roadmap.md#decisions)). `check:expo-go` and `check:public-types` loop over the `exports` subpaths rather than a fixed list, so a new entry is covered without editing the scripts.
- Each is a `definePlugin` value (`src/plugins/definePlugin.ts`): `syntax.markdownIt`, `nodes`, `components`, `theme`. Users pass them in `plugins`, after the preset's.
- Tested with unit fixtures, outside the spec runner, since none is in CommonMark or GFM ([P3-27](./decisions.md#p3-27-plugins-are-tested-with-unit-fixtures-outside-the-spec-runner)).

## Emoji

`:name:` becomes the Unicode character at parse time ([P3-23](./decisions.md#p3-23-emoji-is-parse-time-text-substitution-with-a-pluggable-resolver)). No node: the result is plain text, so themes, components and selection are unaffected.

```ts
import { emoji } from '@docren/react-native-markdown/emoji';
import nodeEmoji from 'node-emoji';

<Markdown plugins={[emoji({ resolve: (n) => nodeEmoji.get(n) })]} />
```

`emoji({ resolve?, map?, defaults? })`: the user `resolve` runs first, then `map`, then the built-in table of about 50 common names (`defaults: false` drops it). An unknown name stays as literal text, as do code spans, escapes and autolinked URLs: the rule runs after core `linkify` (so URLs are already link tokens) and before `text_join`. The resolver must be sync and pure: it is not part of the parse-context string, so a changed resolver does not invalidate a cached parse.

## Mentions

`[@Alice](user://alice)` is an ordinary link whose scheme the plugin recognizes; it becomes an inline `Mention { scheme, id, label, url }` ([P3-24](./decisions.md#p3-24-mentions-are-scheme-links-converted-to-a-mention-node)). Model: [enriched-markdown mentions](https://docs.swmansion.com/enriched-markdown/rich-text-formatting/mentions).

- `mentions({ schemes })`: the schemes to convert (`['user', 'channel']`), matched case-insensitively against `[text](scheme://rest)` links. `label` is the link text flattened to plain text; `id` is everything after `scheme://`, percent-decoded (a malformed `%` is kept raw). `user:alice` (no `//`), autolinks `<user://alice>`, bare linkified URLs and links with an empty or image label stay normal links. The id keeps any `?query#hash`; `url` is the raw link. Other links are untouched. `schemes` are part of the parse-context key, so cached parses never mix schemes.
- `theme.Mention` ([D5](../07-roadmap.md#decisions)): one element for all schemes, falling back to `Link`. No per-scheme map.
- `components.Mention` replaces the render (a chip, an avatar); it receives `scheme`, so it can branch per scheme. It gets no press handler: call `useMentionPress()` (from `/mentions`) inside it and pass the `{ scheme, id, url, label }` it already has, which reaches `onMentionPress` or the `onLinkPress` fallback like the default.
- `onMentionPress({ scheme, id, url, label })` returns void. When set it fully handles the press; when unset the press goes to `onLinkPress` with the raw url. The default `onLinkPress` opens only http/https/mailto/tel, so `user://` does nothing.

A mention in a source without the plugin is still a working link.

## Admonitions

GitHub alerts: `> [!NOTE]` as the first line of a blockquote; kinds `note`, `tip`, `important`, `warning`, `caution` ([P3-25](./decisions.md#p3-25-admonitions-are-github-alerts-an-opt-in-non-gfm-plugin)). Not in CommonMark or GFM, so it is opt-in and works under the `'commonmark'` preset too.

- A block container `Admonition { kind }`. `titles` overrides the default title per kind.
- `theme.admonition`, per kind. `components.Admonition` replaces the render.
- A11y: a role and a label prefixed with the title; wording in the accessibility pass.
- Open: the marker sits inside a `blockquote_open`. Retype that token to an admonition container in a markdown-it core rule, because `registry.ts` rejects a token type mapped twice (so the plugin cannot map `blockquote` itself).

## Streaming

`hideIncomplete` knows only the built-in delimiters. A half-typed `:smi` or `> [!NO` shows raw, then swaps to the emoji or the alert when it completes. Accepted for now ([P3-26](./decisions.md#p3-26-no-plugin-incomplete-tail-streaming-hook-yet)); no hook.

## Deferred

- **`math`.** Needs a renderer (no pure-JS one in RN) and the incomplete-tail hook, since `$$` blocks flicker while streaming. Roadmap: [Phase 3](../07-roadmap.md#phase-3-scale--polish).
- **Container fences** (`::: note`): a second admonition syntax with its own parser rule; only if asked for.
- **Popover and chip extras** for mentions beyond `components.Mention`.
- **An incomplete-tail hook** so plugins can hide their own unfinished syntax ([P3-26](./decisions.md#p3-26-no-plugin-incomplete-tail-streaming-hook-yet)).
