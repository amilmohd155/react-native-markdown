# Phase 3 · Official plugins

Emoji, mentions and admonitions as official plugins; math is deferred. All three are built. [Highlight](#highlight) is built too (P3-29 to P3-34). Decisions: [P3-21 to P3-27](./decisions.md). Reference: [04 · Plugins](../04-api.md#plugins).

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

- A block container `Admonition { kind, title }`. `titles` overrides the default title per kind. The title is stored on the node (so `components.Admonition` receives it) and is the plugin's `contextKey`.
- The marker `[!KIND]` must be alone on the first line, any case, at any depth (lists, nested blockquotes). Text after it, or an unknown kind, leaves a plain blockquote. A bare marker is an empty alert.
- Theme: `elements.Admonition` styles every kind, `AdmonitionNote`/`Tip`/`Important`/`Warning`/`Caution` one kind (theme-only elements, no component). Defaults: the `Blockquote` layout, a per-kind accent bar and tint, light or dark by the text color. `components.Admonition` replaces the render.
- A11y: the container has `accessibilityRole="summary"` and the title as its label. It is not `accessible` (that would fold the body into one stop); wording and grouping are for the accessibility pass.
- Implementation: a core rule after `block` retypes the matching `blockquote_open`/`blockquote_close` to `admonition_open`/`admonition_close` and strips the marker, because `registry.ts` rejects a token type mapped twice.

## Highlight

Built and verified ([P3-29 to P3-34](./decisions.md#p3-29-hand-rolled-tokenizers-with-a-stateless-replaceable-contract); device checks in [REPORT.md](../../../bench/results/REPORT.md#phase-3-highlight-implementation-check-s25-fe)). Syntax highlighting for fenced code, as `@docren/react-native-markdown/highlight`: a subpath entry like the plugins above, pure JS, so it is not in the main bundle.

- `highlight({ languages?, tokenize?, maxLength? })`, passed in `plugins`. It supplies only `components.CodeBlock`, no `syntax` rules, so the open-fence stream fast path stays on ([P3-32](./decisions.md#p3-32-the-open-fence-fast-path-is-gated-on-syntax-not-on-any-plugin)).
- `languages` maps a fence tag to a tokenizer and extends or overrides the built-ins (JavaScript, TypeScript, JSON, shell, diff, Python; tags in [04 · `/highlight`](../04-api.md#highlight)); `tokenize` is the fallback for other tags; unknown tags render plain. A tokenizer is `(code, lang) => { type, text }[]`, sync and stateless, tokens concatenating to the input; a throw or a mismatch renders plain, with a dev-only warning ([P3-29](./decisions.md#p3-29-hand-rolled-tokenizers-with-a-stateless-replaceable-contract)).
- Colours come from the core `tokens.syntax` (13 types, light and dark defaults, following the `theme` prop; a partial override merges onto them) ([P3-33](./decisions.md#p3-33-syntax-colours-are-a-core-theme-token-that-follows-the-theme-mode)).
- Streaming and size: highlighted as it arrives, as memoised Texts of 2 lines (more past blank lines) in one accessible, labelled View; once closed, a block of up to 800 characters is one Text, so selection covers it all (on larger blocks it stays inside one chunk on Android, crosses chunks exactly on web, and iOS copies one whole Text); above `maxLength` (default 50,000 characters) the block is plain ([P3-30](./decisions.md#p3-30-highlighted-code-renders-as-one-text-per-2-lines), [P3-31](./decisions.md#p3-31-highlight-up-to-maxlength-50000-characters-then-plain)).
- Core changes in the same PR: the fast-path gate, a `CodeBlock` `open` prop, `tokens.syntax` ([P3-34](./decisions.md#p3-34-highlight-scope-core-changes-and-exit-criteria)).
- Deferred: highlighted lines, titles.

The highlighted block takes the same `codeBlock={{ header, lineNumbers, wrap }}` options as the default one (header with fence tag, Wrap and Copy; a line-number gutter mirrored beside its chunks, or one row per line with wrap). `codeBlock` and `onCopyPress` are core `<Markdown>` props, not `highlight()` options ([P3-35](./decisions.md#p3-35-code-block-header-line-numbers-and-wrap-in-pure-js), [04 · Code block header](../04-api.md#code-block-header)).

Bring your own tokenizer (about 25 lines, no shipped adapter or peer dependency; typechecked with `lowlight@3` and `@types/hast`):

```ts
import { createLowlight, common } from 'lowlight';
import type { ElementContent, RootContent } from 'hast';
import { highlight, type SyntaxTokenType, type Token } from '@docren/react-native-markdown/highlight';

const lowlight = createLowlight(common);
const TYPES: Record<string, SyntaxTokenType> = {
  'hljs-keyword': 'keyword', 'hljs-meta': 'keyword', 'hljs-string': 'string',
  'hljs-regexp': 'string', 'hljs-number': 'number', 'hljs-comment': 'comment',
  'hljs-title': 'function', 'hljs-title.class_': 'type', 'hljs-type': 'type',
  'hljs-built_in': 'type', 'hljs-attr': 'property', 'hljs-property': 'property',
  'hljs-literal': 'constant', 'hljs-operator': 'operator', 'hljs-punctuation': 'punctuation',
  'hljs-addition': 'inserted', 'hljs-deletion': 'deleted',
};

function tokenize(code: string, lang: string): Token[] {
  const out: Token[] = [];
  const walk = (nodes: (RootContent | ElementContent)[], type: SyntaxTokenType) => {
    for (const n of nodes) {
      const last = out[out.length - 1];
      if (n.type === 'text' && last?.type === type) out[out.length - 1] = { type, text: last.text + n.value };
      else if (n.type === 'text' && n.value) out.push({ type, text: n.value });
      else if (n.type === 'element') {
        const cls = [n.properties.className].flat().join('.'); // 'hljs-title.function_'
        walk(n.children, TYPES[cls] ?? TYPES[cls.split('.')[0] ?? ''] ?? type);
      }
    }
  };
  try {
    if (lowlight.registered(lang)) walk(lowlight.highlight(lang, code).children, 'plain');
  } catch { out.length = 0; }
  return out.length || !code ? out : [{ type: 'plain', text: code }];
}

highlight({ tokenize });
```

## Streaming

`hideIncomplete` knows only the built-in delimiters. A half-typed `:smi` shows raw; `> [!NO` shows as a blockquote with the unclosed `[` hidden but the rest (`!NO`) visible, and `> [!NOTE]` becomes an empty alert before any body arrives. Both swap to the emoji or the alert when they complete. Accepted for now ([P3-26](./decisions.md#p3-26-no-plugin-incomplete-tail-streaming-hook-yet)); no hook.

## Deferred

- **`math`.** Needs a renderer (no pure-JS one in RN) and the incomplete-tail hook, since `$$` blocks flicker while streaming. Roadmap: [Phase 3](../07-roadmap.md#phase-3-scale--polish).
- **Container fences** (`::: note`): a second admonition syntax with its own parser rule; only if asked for.
- **Popover and chip extras** for mentions beyond `components.Mention`.
- **An incomplete-tail hook** so plugins can hide their own unfinished syntax ([P3-26](./decisions.md#p3-26-no-plugin-incomplete-tail-streaming-hook-yet)).
