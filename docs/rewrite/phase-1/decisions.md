# Phase 1 · Implementation decisions

Numbered `P1-n`. Design-level decisions (`D1`–`D8`) live in the [roadmap decision log](../07-roadmap.md#decisions). A decision that changes the design must update the design doc it affects.

Each entry is short on purpose: **what we chose and why**. Evidence (tables, device runs) lives in [`bench/results/REPORT.md`](../../../bench/results/REPORT.md), in the linked scripts, and in the PR that made the change. Don't paste measurements here.

**Status:** `Proposed`, `Accepted`, `Superseded by P1-n`. Entry format: `Status · Date`, `Decision`, `Why`, optional `Consequences`.

---

## P1-1: GFM autolinks: linkify-it + thin wrapper, custom code only for proven gaps

Accepted · 2026-11-03

- **Decision:** linkify-it with a thin wrapper (`src/plugins/autolinks.ts`, replacing markdown-it's two `linkify` rules): `fuzzyLink` and `fuzzyEmail` on, `fuzzyIP` off, `xmpp:` schema added. Keep a match only if it starts with `http(s)://`, `ftp://`, `www.`, `mailto:`, `xmpp:` or is an email; reject `+` in an email domain and `_` in the last labels of a `www.` host; trim GFM trailing punctuation, an unbalanced `)` and a trailing entity. Custom matcher code only for proven gaps.
- **Why:** markdown-it's default doesn't link `www.x.com` because `fuzzyLink` is off, not because linkify-it can't. Without the filter, fuzzy mode links `README.md`, `file.js` and `example.com` (`.md`, `.js` are TLDs), which is common in LLM output and not GFM. Result: 49/55 spec cases ([`bench/autolink.cjs`](../../../bench/autolink.cjs)).
- **Allowlisted gaps (6 cases):** email without a leading word boundary (3), unbalanced `)` inside a URL (1), host label starting `_` (1), IDN punycode vs percent-encoding (1). Follow-up only if real transcripts hit one: a targeted scanner for that case.
- **Implementation notes:** the wrapper runs inside the rule replacements, not as a post-pass, because the core rule pre-tests raw paragraph text (breaks `~~www.google.com~~`) and the inline rule consumed trailing `~~`. Cost: about 18% more parse time in Node `--jitless`; `preset: { base: 'gfm', exclude: ['autolinks'] }` removes it. See [token-mapping](./token-mapping.md) (`markup === 'linkify'` → `AUTOLINK`) and [testing-harness](../testing-harness.md#allowlist-format).

## P1-2: Soft line breaks

Accepted · 2026-11-03

- **Decision:** Soft breaks render as a space (browser and GitHub behaviour); `softBreak: 'space' | 'newline'` option.
- **Why:** `<Text>` renders `"\n"` as a real break, which would split wrapped paragraphs. The converter stores `"\n"`; the renderer substitutes, so changing the option never re-parses. See [04](../04-api.md#markdown).

## P1-3: URL sanitization layers

Accepted · 2026-11-03

- **Decision:** Keep markdown-it's `validateLink` (parse time: rejects `javascript:`, `vbscript:`, `file:`, non-image `data:`). At press time open only `http`, `https`, `mailto`, `tel` and relative URLs by default; `onLinkPress` always gets the `href` first and handles other schemes.
- **Why:** `Linking.openURL` can launch arbitrary app schemes. Custom deep links need a handler ([04](../04-api.md#markdown)).

## P1-4: Footnote section identity

Accepted · 2026-11-03

- **Decision:** The footnote section gets a synthesized block entry: `blockStart = blockEnd = source.length`, index key, and block context from its definitions' text.
- **Why:** `markdown-it-footnote` emits it with `map === null`. Streaming must treat it as always open and re-render it on `done()` ([token-mapping](./token-mapping.md#footnotes)).

## P1-5: Superscript and subscript rendering

Accepted · 2026-11-03 · amended by P1-17

- **Decision:** Smaller text (`fontSize * 0.75`), no vertical offset; projects wanting true offset override them as declared inline views ([D8](../07-roadmap.md#decisions)).
- **Why:** RN `<Text>` has no cross-platform baseline offset. Checked on Android and iOS: readable, override works, decision unchanged. The default is now only the fallback in P1-17.

## P1-6: Peer dependency ranges

Accepted · 2026-11-03

- **Decision:** `react >= 18.2`, `react-native >= 0.76`; the old architecture is not tested. Floor raised to `>= 0.82` by [P3-1](../phase-3/decisions.md). Confirm against Expo Go's SDK at release (D2).
- **Why:** v1 relies on Fabric text behaviour for nested Text and inline views. Older RN stays on v0.x.

## P1-7: Keep release-it `skipChecks`; gate releases in the release workflow

Accepted · 2026-11-03

- **Decision:** Keep `npm.skipChecks: true`; add a Verify step (lint, typecheck, unit, spec, Expo Go check) before build and `release-it` in `.github/workflows/release.yml`.
- **Why:** `skipChecks` skips release-it's npm prerequisite checks, not quality checks, and is required with Trusted Publishing (OIDC, no token for `whoami`) per [release-it docs](https://github.com/release-it/release-it/blob/main/docs/npm.md).

## P1-8: Cap markdown-it nesting at 100

Accepted · 2026-11-04

- **Decision:** `maxNesting: 100` for every preset (`src/parse/markdownIt.ts`).
- **Why:** Uncapped, 25,000 nested `>` throws `RangeError` (worse on Hermes); the `commonmark` preset's 20 is low enough for real deep lists. Spec cases deeper than 100 are allowlisted with this as the reason. Our conversion pass is iterative.

## P1-9: Block identity by source text plus context, and index keys

Accepted · 2026-11-04

- **Decision:** No block hashes. A block is unchanged (`isSameBlock`) only if document context (`NodeTable.context`: preset, html mode, plugins, link reference definitions), block context (`NodeTable.blockContext`: heading slugs, footnote numbers and section content) and source text (length first, then native compare) all match. React key = block index.
- **Why:** Hashing cost about 4 ms of the 97 KB conversion and, like text-only comparison, is wrong: a block's own text doesn't determine its rendering (a reference definition elsewhere, a duplicate heading slug, parse options). Offset-based keys remounted every later block on each edit. Device: compare 6.13 ms vs hash 12.24 ms for 900 blocks, and it runs only on re-render ([report](../../../bench/results/REPORT.md#device-results-preliminary-m1)).

## P1-10: Relative conversion budget

Accepted · 2026-11-04 · restated in absolute terms by [P2-10](../phase-2/decisions.md#p2-10-absolute-conversion-budget-replaces-the-relative-p1-10-budget)

- **Decision:** Conversion costs ≤ 15% of markdown-it's own parse time (97 KB, Node `--jitless`), checked by `bench/convert.mjs`.
- **Why:** The earlier absolute 5 ms came from a lighter prototype and varies by machine. Measured: 11.2% in Node, 14.8% on S25 FE (little margin; node builder is the first thing to optimize).

## P1-11: In-house strikethrough with cmark-gfm semantics

Accepted · 2026-11-04

- **Decision:** Replace markdown-it's strikethrough rules in place (`src/plugins/strikethrough.ts`, same rule names so `exclude` still works): one or two `~` can delimit, three or more is text, a closer pairs only with an opener of the same length (stack-based, linear). Same `s_open`/`s_close` tokens.
- **Why:** markdown-it requires `~~` and splits longer runs; cmark-gfm accepts `~` and keeps long runs as text (`extensions.txt` examples 17, 18). Single tildes are common in LLM output. About 100 lines we maintain.

## P1-12: GFM spec examples run with the extension on their fence only

Accepted · 2026-11-04

- **Decision:** `presetFor(suite, extension)` in `test/utils/renderToHtml.ts`: `commonmark` suite → `'commonmark'`; `gfm` suite → untagged examples as `'commonmark'`, tagged examples with only that plugin; `gfm-extensions` → `'gfm'`.
- **Why:** cmark-gfm's runner does the same; with the full preset, core "Autolinks" examples 619/620 fail. Also tests that excluding a plugin removes exactly its syntax.

## P1-13: tagfilter records filtered HTML instead of rewriting the text

Accepted · 2026-11-04

- **Decision:** A core rule (`src/plugins/tagfilter.ts`) sets `meta.filteredHtml` on `html_block`/`html_inline` tokens containing one of the 9 disallowed tags; the converter stores a sparse `filteredHtml` attr. HTML output uses `filteredHtml ?? text`; the renderer uses `text`.
- **Why:** The renderer never interprets raw HTML (D3), so on screen the filter changes nothing, and rewriting the text to `&lt;script>` would show the entity literally. Matters for the spec serializer, which outputs HTML.

## P1-14: GFM spec 0.29 vs CommonMark 0.31 emphasis

Accepted · 2026-11-04

- **Decision:** Follow CommonMark 0.31; allowlist the 9 `gfm/spec.txt` examples that differ (398, 426, 434, 435, 436, 473, 474, 475, 477), each naming its CommonMark twin.
- **Why:** The vendored GFM spec is based on CommonMark 0.29; markdown-it and our CommonMark suite follow 0.31. Remove the entries if a newer GFM spec is vendored (`test.failing` enforces it).

## P1-15: Footnote navigation through an `onFootnotePress` handler

Accepted · 2026-11-04

- **Decision:** `onFootnotePress(label, info)`, `info = { index, direction: 'reference' | 'definition', reference }` (`reference` is 1-based). Without the handler, references and back-links are plain text. `FootnoteReference` gets a `reference` prop (`subId + 1`); back-link marks become pressable with the `interactiveFootnotes` render option.
- **Why:** `BlockList` is a plain `View` inside the app's scroll container, so the renderer can't scroll. A built-in `scrollTo` would need the renderer to own the scroll view (virtualization, Phase 3) and can build on this handler later. See [04](../04-api.md#markdown), [element-props](./element-props.md).

## P1-16: Font faces for custom fonts

Accepted · 2026-11-04

- **Decision:** `fonts.body` and `fonts.heading` accept a family name or a face map `{ regular, italic?, bold?, boldItalic? }`; `fonts.mono` a name or `{ regular }`. The string form keeps using `fontWeight`/`fontStyle`. With a map, `Strong` → `bold`, `Emphasis` → `italic`, headings → `bold`, nesting picks `boldItalic` via a `{ bold, italic }` state in the inline flattener; `fontWeight`/`fontStyle` are omitted when the real face exists, and used as fallback when it doesn't. An element emits `fontFamily` only when it differs from its parent's.
- **Why:** `expo-font` `useFonts` registers one family per face, so on iOS `fontWeight: '700'` and `fontStyle: 'italic'` do nothing (Android synthesizes). Checked on iOS and Android with Inter. Open (docs only): config-plugin fonts that register several faces under one family. See [theme-resolution](./theme-resolution.md#derived-element-styles).

## P1-17: Unicode characters for superscript and subscript by default

Accepted · 2026-11-04 · amends P1-5

- **Decision:** `Superscript`/`Subscript` render plain-text content as Unicode super/subscript characters when every character has one (`src/render/scripts.ts`). Otherwise follow `scriptFallback`: `'smaller'` (default, P1-5) or `'raised'` (inline view shifted 0.4 up / 0.2 down of the block font size, re-applying the block's colour, font and inherited style).
- **Why:** Smaller text with no offset reads as `mc2`. Unicode characters render raised in the same text run on both platforms with no layout cost; inline views cost accessibility text, selection, style inheritance, line height and a native view each. Copying yields `mc²`. Option added in [04](../04-api.md#markdown).

## P1-18: Theme resolve cache semantics

Accepted · 2026-11-04

- **Decision:** Compare groups shallowly plus one level for object values (face maps, an element's `text`/`container`); `Heading` functions and plugin layers by identity. Built-in themes kept for the app's lifetime; others in an LRU of 16. A theme input merges onto the built-in theme of the current scheme; `createTheme(input, base)` merges onto an explicit base. `useMarkdownTheme()` returns `{ tokens, styles, headings }` (`styles.Heading` is empty).
- **Why:** Otherwise inline `fonts: { body: { … } }` would miss the cache every render. Inputs must not be mutated (`createTheme` freezes); an inline `Heading` function re-resolves each render ("hoist it"); plugin themes need stable layer objects.

## P1-19: No legacy entry point; v0 is removed at v1.0

Accepted · 2026-11-04

- **Decision:** No `/legacy` entry or deprecated v0 export. M5 swaps the entry to v1 and deletes v0 sources and `mdast-util-from-markdown`. v1.0 is a semver major; users pin `^0.8` (`main` keeps bug fixes via Release-it). Migration guide covers the [migration table](../04-api.md#migration-from-v0x); `extensions` become `plugins`.
- **Why:** v0 (mdast + `renderRules`) and v1 share no code; keeping both would double the parser, dependencies and the Expo Go import graph (D2).

## P1-20: No `toMdast`: mdast interop is dropped

Accepted · 2026-11-04 · dropped completely 2026-11-06 (was "deferred to Phase 3")

- **Decision:** There is no mdast export, now or later: no `/mdast` entry point, no `toMdast`, no `@types/mdast`. Users who need to read the tree use `visit()`.
- **Why:** It needs design that was never done (plugin nodes, structural footnotes, source positions, `Underline`/`Highlight`/`Kbd` with no mdast type) and would become a public compatibility promise for an ecosystem the rewrite moved away from. `filteredHtml` (P1-13) stays for the spec serializer only.

## P1-21: `images` policy semantics

Accepted · 2026-11-04

- **Decision:** Policy `'allow' | 'deny' | { allowHosts }` applies at render time (no re-parse) to block and inline images. A refused image renders as plain alt text (empty alt: nothing; a refused block image becomes a paragraph); components never see it. `allowHosts` matches the lowercased host without port, userinfo or trailing dot, as an exact host or `*.example.com` (subdomains, not the apex). Under an allowlist only `http(s)` and protocol-relative URLs can match; relative paths, `data:`, and URLs a browser would parse differently (backslashes, whitespace, control characters) are refused. Default `'allow'`; `images` is compared shallowly in `ctx`.
- **Why:** A remote image loads without a press, so on untrusted content it's a tracking beacon and a way to leak the conversation via the URL. Apps rendering untrusted content must set it. Local assets can't combine with an allowlist; use `'allow'` or `components.Image`.

## P1-22: The migration guide is its own milestone (M8)

Accepted · 2026-11-05

- **Decision:** M8 · Migration guide, last in Phase 1 (guide, v1 root README, `fromRenderRules()` decision). Example migration stays in M6. M7's exit review doesn't wait for M8. Tracked in [#23](https://github.com/amilmohd155/react-native-markdown/issues/23).
- **Why:** M5's done-when doesn't need it and a guide reads best once API and benchmarks are final. The root README keeps its "v1 pre-release" note until then.

## P1-23: No scheduled native build of the example app in CI

Accepted · 2026-11-05

- **Decision:** Drop the `example-build` job. Required set on `v1`: `lint`, `typecheck`, `unit`, `spec`, `web`, `expo-go-check`, `dts-leak`, `perf`. The example is built natively by hand (Expo Go, release builds for M7).
- **Why:** The library is pure JS (D2), so a failure would nearly always be a toolchain problem; `web` already exports the example bundle; macOS minutes are about 10× Linux. Revisit if the example gets native code. See [testing-harness](../testing-harness.md#ci-jobs), [06](../06-testing.md#platform-tests).

## P1-24: Keep the flat table (render A/B against an object tree)

Accepted on S25 FE · 2026-11-05 (re-confirm on a low-end device if one appears)

- **Decision:** Keep the flat table. The test-only object-tree renderer (`bench/objectTree/`) and its A/B card were removed once this was decided; restore them from commit `81220d3` to re-run it. The decision is final and is not re-confirmed at the v1.0 gate.
- **Why:** Rule was "keep unless >10% slower to first render and <2× memory advantage". The table was 1–5% faster to first render and used 4–16% less heap; it also gives cheap structural sharing and no per-node allocation during parse. Single run on a phone with an active call; the F5 numbers retain all 200 documents ([report](../../../bench/results/REPORT.md#table-vs-object-tree-s25-fe-5--20-medians)).

## P1-25: The ≥ 5× parse-plus-first-render exit criterion is waived for Phase 1

Accepted · 2026-11-05 · superseded in effect by [P2-9](../phase-2/decisions.md#p2-9-absolute-f3-budgets-replace-the-5-against-v0-criterion)

- **Decision:** Waive the criterion (F3, v1 vs v0.8.5 on a low-end Android) and the low-end-device measurement with it. The other Phase 1 exit criteria stand. The speed target is deferred to Phase 2, not dropped.
- **Why:** Measured 1.0× on S25 FE and 1.08× on web, the same as M3, so not noise. A low-end phone slows both libraries and wouldn't move the ratio near 5×. v0.8.5 has no GFM (v1 renders tables, task lists, etc. as elements), v1's render (243 ms) exceeds its parse (216 ms), and Hermes parse is about 2.8× Node `--jitless`. `reRenderOneBlock` bar met (6.6%, 27× faster than v0); F5 `retainedHeap` bar not met with this method (compares all parsed documents against a windowed v0) and stays open. Detail: [report](../../../bench/results/REPORT.md#device-results-m7).

## P1-26: No `fromRenderRules()` adapter

Accepted · 2026-11-05

- **Decision:** Drop the adapter; the [migration guide](../../migration-from-v0.md) is the path. Users not ready stay on `^0.8`. An adapter can still be added in a minor release if demand shows up.
- **Why:** A v0 rule receives an mdast node, `StyleMap`, rendered children and ancestors; v1 has none of them. Only rules reading one or two node fields translate, and those are one-line renames the guide shows. Everything else needs a manual rewrite anyway, and a shim means fake mdast nodes and a compatibility promise in the pure-JS entry.
