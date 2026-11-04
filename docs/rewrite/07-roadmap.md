# 07 · Roadmap, alternatives & decisions

## Phases

### Phase 1: Core (pure JS)
Implementation detail: [`phase-1/`](./phase-1/README.md).
- markdown-it backend with the full GFM set (linkify-it + thin GFM wrapper for autolinks, see [P1-1](./phase-1/decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps); in-house tagfilter).
- Private flat node table, token → table conversion, block index and block identity (P1-9).
- `BlockList`, memoized `Block`, inline flattener, table → semantic props, all default elements (tables included).
- Public API: `components`, `definePlugin` with GFM implemented as built-in plugins, theme tokens + `createTheme` (light and dark), `parse`/`visit`, `onLinkPress` semantics, URL sanitization.
- CommonMark and GFM spec suites, renderer and API-contract tests, perf CI job.
- Raw HTML safe subset (D3), declared inline views (D8).
- Platform CI: iOS, Android, web (react-native-web), plus an Expo Go check that the main entry has no native imports (D1, D2).
- Device benchmark: current vs. new, on a low-end Android device with Hermes.
- Migration guide and a v1 README, as the last milestone (M8, [P1-22](./phase-1/decisions.md#p1-22-the-migration-guide-is-its-own-milestone-m8)).

**Exit criteria:** passes the spec suites (allowlisting documented exceptions only). Runs unchanged in Expo Go and on the web. Parse plus first render of a 100 KB document is at least 5× faster than v0.8.5 on the device.

### Phase 2: Streaming
- `useMarkdownStream` (feeding `<Markdown document>`), tail re-parse with node-table splicing, frame batching, optional smoothing.
- Randomized-chunking equivalence tests.

**Exit criteria:** streaming a 10 KB message costs under 2× a single full parse in total.

### Phase 3: Scale & polish
- `virtualize` with FlashList.
- Image aspect-ratio cache and placeholder, table column measurement cache.
- `/highlight` entry point (lazy-loaded tokenizer).
- Footnotes UI, task toggling, accessibility pass.
- `fromRenderRules()` migration adapter (deprecated on arrival; M8 decides whether it ships earlier), the `/mdast` interop entry point ([P1-20](./phase-1/decisions.md#p1-20-tomdast-is-deferred-to-phase-3)), and official plugins (`math`, `mentions`, `emoji`).

### Phase 4: Native backend (only if profiling justifies it)
- md4c or cmark-gfm in C++ behind a JSI or Nitro module, with a binary node buffer (no JSON).
- Separate entry point (`/native`) and optional install. Expo Go (D2) and the web (D1) keep the JS backend.
- Must pass the same spec suite as the JS backend.

## Alternatives considered

| Option | Why not (as the default) |
|---|---|
| mdast-shaped public node API (render rules over nodes) | Freezes the internal format into the public contract, and props aren't memo-friendly. See [08](./08-model-and-api.md). |
| mdast object tree as the internal model | 5.5× the memory of a flat table, and doesn't match the native buffer layout ([08](./08-model-and-api.md#measurements)) |
| Keep micromark/mdast, add memoization | Fixes repeated work, but the parse itself is still 7–15× slower and streaming stays expensive |
| marked | Fastest JS parser measured, but weaker CommonMark compliance and a less structured extension model |
| commonmark.js | Fast and compliant, but no GFM, and adding it means maintaining a fork |
| Native parser only (md4c over JSI) | Best raw speed, but needs native builds, drops Expo Go, and web needs a WASM build |
| Native rendering (attributed strings, like `react-native-enriched-markdown`) | Fewest host views, but per-node customization through React components becomes very hard, and it's a large native code base to maintain on two platforms |
| WebView + HTML | Simple and complete, but slow to mount, hard to size, doesn't feel native, and inline React customization is lost |

## Landscape

Two current libraries already take the native route:

- **[react-native-enriched-markdown](https://github.com/software-mansion-labs/react-native-enriched-markdown)** (Software Mansion): md4c, native text rendering, GFM, streaming, math. Requires a native build.
- **[react-native-nitro-markdown](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown)**: md4c over Nitro/JSI, React Native components, streaming, virtualization. No Expo Go or web support.

**Where this rewrite fits:** a fast **pure-JS** core that works everywhere, a typed components + plugins + theme-token API that is easy to customize and extend, and streaming as a first-class feature, with a native backend as an upgrade path rather than a requirement. Pure JS won't match native parse speed on very large documents, which is why phase 4 exists.

## Risks

| Risk | Mitigation |
|---|---|
| markdown-it plugins diverge from the GFM spec | In-house rules for autolinks and tagfilter, plus a per-backend allowlist in the spec suite |
| Tail re-parse heuristics produce wrong intermediate output | `done()` always does a full parse, and randomized equivalence tests |
| Breaking API change for current users | migration table ([04](./04-api.md#migration-from-v0x)) and guide (Phase 1 M8), optional `fromRenderRules()` adapter, and v1.0 semver |
| The flat table's indirection costs too much at render time on a device | Measure in phase 1. The table is private, so it can fall back to an object tree without an API change. |
| Benchmarks so far are Node proxies, not devices | The phase 1 exit criteria require on-device numbers |

## Decisions

Decided on 2026-11-03. Each one is reflected in the linked documents.

| # | Question | Decision | Consequences |
|---|---|---|---|
| D1 | Web (react-native-web) in v1? | **Yes, via the JS backend.** | Web CI job from phase 1. Image sizing and `virtualize` get web code paths. The native backend stays mobile-only. ([06](./06-testing.md#platform-tests)) |
| D2 | Must the default package work in Expo Go? | **Yes, hard requirement.** | The main entry point is pure JS, with no native modules and no config plugin. The native parser is opt-in via `/native` (phase 4). CI checks that the main entry has no native imports. |
| D3 | Raw HTML default | **Safe subset, rest as literal text.** | `html="safe"` (default) maps `br`, `b`, `i`, `u`, `s`, `sub`, `sup`, `kbd`, `mark` to elements. All other HTML is shown as text. Also `'text'`, `'strip'`, or `{ allow: [...] }`. ([03](./03-architecture.md#raw-html), [04](./04-api.md#markdown)) |
| D4 | Footnotes on by default? | **Yes, in the `gfm` preset.** | Matches github.com. Removable: `preset="gfm"` with `exclude: ['footnotes']`. |
| D5 | Component key casing | **PascalCase** (`Heading`, `CodeBlock`). | Applies to `components`, plugin `nodes`, theme `elements` and `visit()` keys. |
| D6 | `Heading` vs `Heading1…6` | **One `Heading` with `level`.** | Per-level styling goes through the theme (`elements.Heading: (level) => …`). |
| D7 | `visit()` write mode? | **Read-only.** | Documents are immutable. Syntax changes happen at parse time through plugins. |
| D8 | Inline Views (chips, badges)? | **Allowed if declared** with `inlineView: true`. | Declared elements render as native inline attachments inside the paragraph's `<Text>`. Undeclared inline components must be Text-compatible, with a dev warning. ([03](./03-architecture.md#inline-views), [04](./04-api.md#inline-elements)) |

## Still open

- **Render-time cost of the flat node table on a device.** This is a measurement, not a choice. It's scheduled in phase 1. Falling back to an object tree wouldn't change the API ([08](./08-model-and-api.md#decision)).
