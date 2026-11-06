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

**Exit criteria:** passes the spec suites (allowlisting documented exceptions only). Runs unchanged in Expo Go and on the web. Parse plus first render of a 100 KB document is at least 5× faster than v0.8.5 on the device. (Waived by [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) and replaced by absolute F3 budgets in [P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion).)

### Phase 2: Streaming
Implementation detail: [`phase-2/`](./phase-2/README.md).
- `useMarkdownStream` (feeding `<Markdown document>`), tail re-parse with node-table splicing, flush-window batching, optional smoothing.
- Randomized-chunking equivalence tests.

**Exit criteria:** streaming a 10 KB message costs, in total flush cost with the default flush window, at most 2× a single full parse when it arrives in 50 chunks of about 195 characters, and at most 5× when it arrives in 500 chunks of about 20 characters. The original 2× bar for the 500-chunk case is waived (superseded by the 5× bar above). As accepted on 2026-11-06 ([P2-1](./phase-2/decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture)), the bars apply to the steady-state flush cost (excluding the necessary full re-parse that a footnote definition triggers, which is reported separately) at the 50 ms window, and are **waived for documents that end in a footnote definition**, as [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) did for Phase 1; the measured S25 FE figures (`F4a` 6.30× / 7.11×, `F4b` 2.46× / 2.51×) are the accepted ones. A footnote-free variant is held to the original bars and passes on the S25 FE at 50 ms (`F4a` 4.32× / 4.34×, `F4b` 1.42× / 1.44×). The 2× / 5× target text above is kept as written; the acceptance follows it. `F4d` has an absolute bar of at most 20 ms. The iPhone run and `F4c` (a real LLM transcript) are **waived for Phase 2 and deferred** ([P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred), 2026-11-06), as [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) did for Phase 1: no iPhone and no real transcript were available, S25 FE and web are measured, and the synthetic transcripts stay a labelled stand-in. They are added to the v1.0 release gate below.

### Phase 3: Scale & polish
- `virtualize` with FlashList.
- Image aspect-ratio cache and placeholder, table column measurement cache.
- `/highlight` entry point (lazy-loaded tokenizer).
- Footnotes UI, task toggling, accessibility pass.
- F5 `retainedHeap`: decide the method first (an equal hold, with parsed-ahead documents on both sides, or a windowed v1), then measure once after `virtualize`, since `virtualize` changes what F5 holds ([P2-7](./phase-2/decisions.md#p2-7-where-the-phase-1-carry-over-lives); carried over from [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1)).
- The `/mdast` interop entry point ([P1-20](./phase-1/decisions.md#p1-20-tomdast-is-deferred-to-phase-3)), and official plugins (`math`, `mentions`, `emoji`).

### v1.0 release gate
Not a phase; added by [P2-7](./phase-2/decisions.md#p2-7-where-the-phase-1-carry-over-lives) and extended by [P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred), tracked in #37.
- **Low-end Android measurement, or a named waiver.** Re-run the [Phase 1 benchmark protocol](./phase-1/benchmark-protocol.md) on a low-end Android with Hermes (Snapdragon 6xx / Helio G class, 4 GB RAM): F3 parse plus first render, F5 and the F4 streaming bars. It also re-confirms [P1-24](./phase-1/decisions.md#p1-24-keep-the-flat-table-render-ab-against-an-object-tree) and the P1-10 conversion margin. If no such device is available at release, record a waiver by name in a decision, with the reason, as [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) did for Phase 1. It gates no phase.
- **iPhone and `F4c`, or a named waiver.** Added by [P2-8](./phase-2/decisions.md#p2-8-iphone-run-and-f4c-deferred): run the [Phase 2 benchmark protocol](./phase-2/benchmark-protocol.md) on an iPhone (`raf` on iOS, flush cost, background and resume, the open-fence fast path) and replay a real LLM transcript with recorded timing (`F4c`, re-confirming the P2-1 bars): measured, or waived by name in a decision, as for the low-end Android line above. Belongs with #37 (the issue still has to be updated to mention it). It gates no phase.
- **The 5× target is replaced by absolute F3 budgets** ([P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion), measured in the perf-hardening issue #36): `parse`, `firstRender`, `reRenderOneBlock` and `parse+firstRender` ceilings on the S25 FE, checked by `bench/check-budgets.mjs`, plus a conversion budget ([P2-10](./phase-2/decisions.md#p2-10-absolute-conversion-budget-replaces-the-relative-p1-10-budget)). The CommonMark-only ratio against v0.8.5 (2.0× to 2.1× after the autolink fix) is a reference number, not a gate. A budget missed on the low-end device is judged there ([#37](https://github.com/amilmohd155/react-native-markdown/issues/37)).

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
| Breaking API change for current users | migration table ([04](./04-api.md#migration-from-v0x)) and [guide](../migration-from-v0.md) (Phase 1 M8, no adapter: [P1-26](./phase-1/decisions.md#p1-26-no-fromrenderrules-adapter)), and v1.0 semver |
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

- **Done (#36, [P2-9](./phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion)): a fair baseline for the 5× target.** v0.8.5 has no GFM, so F3 is not like for like, and the criterion waived by [P1-25](./phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) (1.0× on the S25 FE) cannot be judged. Build a CommonMark-only variant of F3 and compare v0.8.5 against v1, then profile `firstRender` and Hermes parse. Home: the perf-hardening issue (#36), before Phase 3 starts ([P2-7](./phase-2/decisions.md#p2-7-where-the-phase-1-carry-over-lives)).
- **Render-time cost of the flat node table on a device.** This is a measurement, not a choice. It's scheduled in phase 1. Falling back to an object tree wouldn't change the API ([08](./08-model-and-api.md#decision)).
