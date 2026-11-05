# Phase 1 · Implementation decisions

These are decisions made while building Phase 1, numbered `P1-n`. Design-level decisions (`D1`–`D8`) live in the [roadmap decision log](../07-roadmap.md#decisions). A P1 decision that changes the design must also update the design doc it affects.

**Status values:** `Proposed` (awaiting agreement), `Accepted`, `Superseded by P1-n`.

## Template

```md
## P1-n: Title
- **Status:** Proposed | Accepted | Superseded by P1-x
- **Date:** YYYY-MM-DD
- **Context:** what forced the decision (link evidence)
- **Decision:** what we do
- **Consequences:** what changes, what it costs, which docs were updated
```

---

## P1-1: GFM autolinks: linkify-it + thin wrapper, custom code only for proven gaps

- **Status:** Accepted (2026-11-03)
- **Date:** 2026-11-03 (revised the same day, replacing "write our own rule")
- **Context:**
  - An earlier check found that markdown-it doesn't link `www.x.com` with `linkify: true`. That turned out to be a **default setting, not a linkify-it limitation**: markdown-it ships linkify-it with `fuzzyLink: false`.
  - Before deciding to write our own matcher, we ran the GFM spec's autolink examples through markdown-it + linkify-it in four configurations. These are the 11 "Autolinks (extension)" examples from cmark-gfm `test/spec.txt` and the 3 "Autolinks" examples from `test/extensions.txt`, one of which bundles 32 cases.
  - Script: [`bench/autolink.cjs`](../../../bench/autolink.cjs) (`yarn workspace @docren/react-native-markdown-bench autolink`). It reads the pinned GFM spec files in `test/fixtures/gfm/`.

  | Configuration | Examples | Cases |
  |---|---|---|
  | 1. markdown-it default `linkify` (`fuzzyLink: false`) | 5/14 | 30/55 |
  | 2. `fuzzyLink` + `fuzzyEmail` on | 10/14 | 41/55 |
  | 3. (2) + thin filter: keep only matches with a scheme, `www.` or an email | 9/14 | 40/55 |
  | **4. linkify-it + thin wrapper** (see below) | **12/14** | **49/55** |

  - (3) lost one case to (2) only because its filter forgot `ftp://`. The wrapper (4) includes it.
  - The filter is still essential outside the spec: without it, fuzzy mode links **`README.md`, `file.js` and `example.com`** (`.md` and `.js` are real TLDs). That's very common in LLM output, and GFM doesn't link these. With the wrapper, none of the three is linked.

- **Decision:** Use linkify-it with a thin wrapper, and add custom matching code only where the spec examples show linkify-it can't match. The wrapper is a markdown-it core rule after `linkify`, about 40 lines in the prototype:
  1. **Config:** `fuzzyLink: true`, `fuzzyEmail: true`, `fuzzyIP: false`, plus an `xmpp:` schema (GFM's extended protocol autolink).
  2. **Filter:** keep a match only if it starts with `http://`, `https://`, `ftp://`, `www.`, `mailto:` or `xmpp:`, or is an email. Unwrap everything else back to text.
  3. **Reject:** a `+` in an email's domain; an `_` in the last labels of a `www.` host.
  4. **Trim (GFM rules):** trailing `?!.,:*_~`, an unbalanced trailing `)`, and a trailing entity reference (`&hl;`). The trimmed characters become text after the link.

- **Remaining gaps** (6 of 55 cases) and how each is handled:

  | Gap | Cases | Why linkify-it can't | Plan |
  |---|---|---|---|
  | Email not preceded by a word boundary (`at:a@b.com`, `x.com/b@c.com`, `mmmmailto:a@b.com`) | 3 | linkify-it requires a boundary before an email | **Allowlist** in phase 1. A custom email scanner only if real transcripts show it matters. |
  | Unbalanced `)` *inside* a URL (`q=(business))+ok`) | 1 | linkify-it ends the match at the unbalanced `)`, while GFM continues to whitespace | **Allowlist.** Extending a match would need a custom URL scanner. |
  | Host label starting with `_` (`www._xxx.yyy.zzz`) | 1 | linkify-it doesn't match it | **Allowlist** (rare). |
  | IDN hosts: href is punycode (`xn--ei8h.ga`), cmark-gfm percent-encodes | 1 | markdown-it's `normalizeLink` policy | **Allowlist as equivalent.** Both URLs resolve. `Linking.openURL` accepts punycode. |

- **Consequences:**
  - A small wrapper instead of a full autolink matcher. Spec coverage is 49/55 cases, with 6 documented allowlist entries ([testing-harness](./testing-harness.md#allowlist-format)).
  - [token-mapping](./token-mapping.md) is updated: `linkify` is **enabled** with the wrapper, and links from it carry `markup === 'linkify'` → `AUTOLINK` flag.
  - If phase 1 transcripts or user reports hit an allowlisted gap, the follow-up is a targeted scanner for that case only, not a rewrite of the wrapper.
- **Implementation (M2, 2026-11-04):** `src/plugins/autolinks.ts`. The wrapper rules are the prototype's, but they run **inside** replacements for markdown-it's two `linkify` rules (same names, `ruler.at`) instead of a post-pass, because the post-pass couldn't fix two interop failures (`extensions.txt` example 26):
  - markdown-it's core rule pre-tests the raw paragraph text, and linkify-it rejects `~` right before `www.`, so `~~www.google.com~~` was never linked. Ours tests each text token.
  - markdown-it's inline rule (`scheme://` during inline parsing) consumed trailing `~~`, so the strikethrough never closed. Ours trims with the GFM rules before consuming, and only for `http`, `https` and `ftp`.
  - The `href` of a trimmed link is rebuilt from linkify-it's `url` minus the trimmed characters (`normalizeLink`), not by slicing the old `href`.
  - Result: the predicted 49/55 cases (`yarn workspace @docren/react-native-markdown-bench autolink`). The 6 gaps are allowlisted: `gfm` 625, and `gfm-extensions` 19 as a whole plus cases `19/6`, `19/10`, `19/18`, `19/23`, `19/31` in the case-level test `test/spec/autolinkCases.test.ts`.
  - Cost: fuzzy linkify adds about 18% to markdown-it's parse of the 97 KB fixture in Node `--jitless` (56.1 → 66.4 ms), the same as markdown-it's own linkify with fuzzy matching (66.6 ms). It's parse time, not conversion, so the P1-10 budget is unaffected; `preset: { base: 'gfm', exclude: ['autolinks'] }` removes it.

## P1-2: Soft line breaks

- **Status:** Accepted (2026-11-03)
- **Date:** 2026-11-03
- **Context:** In HTML, a soft line break is rendered as whitespace (a space). React Native `<Text>` renders `"\n"` as a real line break. Rendering soft breaks as newlines would break normally wrapped markdown paragraphs into short lines.
- **Decision:** Soft breaks render as a **space** by default, matching browsers and GitHub. Add a `softBreak: 'space' | 'newline'` option, because some chat apps want newlines kept.
- **Consequences:**
  - `softBreak` added to the `<Markdown>` props in [04](../04-api.md#markdown).
  - The converter stores soft breaks as `"\n"` in text runs. The renderer replaces them according to the option, so no re-parse is needed when the option changes.

## P1-3: URL sanitization layers

- **Status:** Accepted (2026-11-03)
- **Date:** 2026-11-03
- **Context:** markdown-it's default `validateLink` already rejects `javascript:`, `vbscript:`, `file:` and non-image `data:` URLs at parse time. Those links stay as literal text. That covers the main risk, but the renderer also opens URLs with `Linking.openURL`, which can launch arbitrary app schemes.
- **Decision:** Two layers:
  1. Keep markdown-it's `validateLink` (parse time).
  2. At press time, open only `http`, `https`, `mailto`, `tel` and relative URLs by default. `onLinkPress` always receives the `href` first and can handle other schemes.
- **Consequences:** Custom-scheme deep links need an `onLinkPress` handler. Documented in [04](../04-api.md#markdown) (`onLinkPress` row).

## P1-4: Footnote section identity

- **Status:** Accepted (2026-11-03)
- **Date:** 2026-11-03
- **Context:** `markdown-it-footnote` appends the footnote block with `map === null`, so it has no source range ([token-mapping](./token-mapping.md#footnotes)).
- **Decision:** The footnote section gets a synthesized block entry:
  - `blockStart = blockEnd = source.length`;
  - key: its index, like every block;
  - block context: its definitions' text, since its source range is empty (updated by P1-9, which replaced block hashes).
- **Consequences:**
  - Memoization still works.
  - Streaming (phase 2) must treat the footnote section as always open while streaming, and re-render it on `done()`.

## P1-5: Superscript and subscript rendering

- **Status:** Accepted (2026-11-03)
- **Date:** 2026-11-03
- **Context:** React Native `<Text>` has no `baselineOffset` style that works on all platforms, and `textAlignVertical` is Android-only. Nested `<Text>` can't use `transform`.
- **Decision:**
  - Render `Superscript` and `Subscript` as smaller text (`fontSize * 0.75`) with no vertical offset by default.
  - Projects that need true raised or lowered text can override them as declared inline views ([D8](../07-roadmap.md#decisions)) that apply a `translateY`.
- **Consequences:** The default looks slightly different from browsers, in exchange for consistent behaviour across platforms. To be revisited with a device check in M3.
- **Device check (M3, 2026-11-04, Android only):** Samsung Galaxy S25 FE, Expo Go (SDK 58), example app "v1 preview" with "inline views" on.
  - The default (smaller text, no offset) is readable: `H<sub>2</sub>O`, `mc<sup>2</sup>`.
  - The override works as described: `inlineView()` components with `translateY: -fontSize * 0.4` (superscript) and `+fontSize * 0.2` (subscript), sized from the `baseline` prop, render as raised and lowered inline attachments. The line containing them grows slightly taller.
  - **iOS (2026-11-04):** iPhone 18 Pro simulator, iOS 27, Expo Go 58. The default reads as on Android; the inline-view override renders true raised/lowered text (`mc²`, `H₂O`) and the line height grows less than on Android.
  - Decision unchanged.

## P1-6: Peer dependency ranges

- **Status:** Accepted (2026-11-03)
- **Date:** 2026-11-03
- **Context:** v0.x declares `react: "*"` and `react-native: "*"` ([01](../01-current-state.md)). v1 relies on Fabric text behaviour for nested Text and inline views, and on React 18+ features.
- **Decision:** `react >= 18.2`, `react-native >= 0.76` (the New Architecture default). The old architecture is not tested.
- **Consequences:** Projects on React Native below 0.76 stay on v0.x. To be confirmed against the Expo SDK versions that Expo Go supports at release time (D2).

## P1-7: Keep release-it `skipChecks`; gate releases in the release workflow

- **Status:** Accepted (2026-11-03, during M0; replaces the M0 item "remove `skipChecks`")
- **Context:**
  - The plan said to remove `npm.skipChecks: true`, reading it as "releases skip quality checks".
  - It actually skips release-it's **npm prerequisite checks**: registry ping, `npm whoami` and collaborator access.
  - The release workflow publishes with npm **Trusted Publishing** (OIDC, `id-token: write`, no npm token). release-it's docs state that with Trusted Publishing you *must* set `skipChecks: true` ([release-it docs · npm · Trusted publishing](https://github.com/release-it/release-it/blob/main/docs/npm.md)), because there's no token for `whoami` to validate. Removing it would break the next release.
- **Decision:**
  - Keep `skipChecks: true`.
  - Meet the original goal (no release without passing checks) by adding a **Verify** step to `.github/workflows/release.yml`, before the build and `release-it`: lint, typecheck, unit tests, spec suites and the Expo Go check.
- **Consequences:**
  - Releases can't publish code that fails the repo's checks.
  - npm authentication problems surface at publish time instead of in release-it's pre-checks. With OIDC that's the only place they can surface anyway.

## P1-8: Cap markdown-it nesting at 100

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:**
  - markdown-it parses nested containers recursively. With no cap, 25,000 nested `>` throws `RangeError: Maximum call stack size exceeded` (checked in Node; the Hermes stack is smaller).
  - Its `maxNesting` option stops nesting at a depth and keeps the rest as text. The `commonmark` preset uses 20, the `default` preset 100.
  - Our own conversion pass is iterative, so the cap is only needed for markdown-it.
- **Decision:** Set `maxNesting: 100` for every preset (`src/parse/markdownIt.ts`). 20 is low enough for real documents with deep lists to hit.
- **Consequences:**
  - Deep input never crashes; nesting beyond 100 levels renders as text.
  - Pathological spec cases deeper than 100 (e.g. "nested block quotes", 25,000 levels) cannot match the spec's output. They're allowlisted in M1 triage, with this decision as the reason.

## P1-9: Block identity by source text plus context, and index keys

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:**
  - The plan identified unchanged blocks (for `memo`) by an FNV-1a hash of each block's source. Hashing reads every character in interpreted JS: ~4 ms of the 97 KB conversion without a JIT. A native string compare of all 900 blocks costs 0.10 ms instead (`bench/identity.mjs`).
  - Investigating that switch showed both approaches shared a correctness bug: **a block's own source text doesn't determine its rendering**. Checked with the real parser (`bench/identity-pitfalls.mjs`): a reference definition changed in another block, a duplicate heading added earlier (slug `intro-1` → `intro-2`), and different parse options all give the same block text but a different tree. With either approach the renderer would have shown stale output. Footnote numbers (M2) are the same class, and the synthetic footnote section has an empty source range.
  - Keys `${index}:${blockStart}` remounted every later block on each edit, because editing moves all later offsets.
- **Decision:**
  - No block hashes. A block is unchanged (`isSameBlock`) only if all three match:
    1. **Document context** (`NodeTable.context`): preset, html mode, plugins (M2) and the link reference definitions. Backends must fill it.
    2. **Block context** (`NodeTable.blockContext`): values the block renders that come from outside its source text. Heading slugs now; footnote numbers and the footnote section's content in M2.
    3. **Source text**: lengths first, then a native string compare. The table keeps a reference to the source (no copy).
  - React key = the block index.
- **Consequences:**
  - Parse no longer pays for hashing; comparisons are exact (no collisions) and only happen on re-render.
  - Editing a block keeps every later block mounted and skips re-rendering it. Inserting a block shifts later keys: those blocks re-render but don't remount.
  - Hermes copies substrings, so each comparison allocates. **Measured on device** (Samsung S25 FE, Hermes release build, 97 KB / 900 blocks): `isSameBlock` on every block 6.13 ms vs hashing every block 12.24 ms. B is still 2× cheaper, and it runs only on re-render instead of every parse ([02 · Device results](../02-benchmarks.md#device-results-preliminary-m1)). M7 re-measures on a low-end device.
  - Docs 03, 05, 07, 08 and the phase-1 plan updated.

## P1-10: Relative conversion budget

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:** M1's done check said conversion must cost ≤ 5 ms on top of markdown-it's parse (97 KB, Node `--jitless`). That number came from an early prototype that did much less work, and absolute times depend on the machine: markdown-it alone takes 54 ms on one machine and 77 ms on another.
- **Decision:** Conversion must cost **≤ 15% of markdown-it's own parse time**, for the 97 KB fixture, in Node `--jitless`. Checked by `bench/convert.mjs` (`yarn workspace @docren/react-native-markdown-bench convert:jitless`), which exits non-zero on failure.
- **Consequences:**
  - After the line-offset fast path, the inline-pass allocation fixes and P1-9: 6.0 ms = **11.2%** in Node `--jitless` (13.3% with JIT).
  - **On device** (Samsung S25 FE, Hermes release build): 15.95 ms = **14.8%** of markdown-it's 107.95 ms. Passes, with little margin: the jitless proxy underestimates Hermes by about a third. If M7's low-end device fails it, the node builder is the first thing to optimize ([02 · Device results](../02-benchmarks.md#device-results-preliminary-m1)).

## P1-11: In-house strikethrough with cmark-gfm semantics

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:**
  - The plan used markdown-it's core `strikethrough` rule ("mapping only"). It differs from GFM in two ways, which fail `extensions.txt` examples 17 and 18:
    1. It needs `~~`; GFM (cmark-gfm) also accepts a single `~`. Single tildes are common in LLM output.
    2. It splits longer runs into pairs (`~~~~~one~~~~~` → nested strikethrough), while cmark-gfm keeps runs of three or more as text.
  - cmark-gfm's `strikethrough` extension also pairs a closer only with an opener of the **same length**, and drops the closer otherwise (`No ~mismatch~~` stays text).
- **Decision:** Replace markdown-it's rule functions in place (`ruler.at('strikethrough', …)` in `inline.ruler` and `inline.ruler2`, `src/plugins/strikethrough.ts`), keeping the rule names so excluding the plugin still disables them:
  - A run of one or two `~` is a delimiter if it is left-flanking (can open) or right-flanking (can close); three or more is text.
  - A separate `strikethrough_pairs` rule runs before `balance_pairs`: a closer pairs with the nearest open `~` delimiter if both runs have the same length, otherwise the closer is dropped. It uses a stack, so it stays linear on input with many unmatched tildes. Afterwards `~` delimiters are neither open nor close, so emphasis pairing ignores them.
  - Tokens are the same `s_open`/`s_close` as before; `markup` is the run (`~` or `~~`).
- **Consequences:**
  - Both examples pass; no allowlist entry needed. The token mapping is unchanged.
  - About 100 lines we maintain instead of markdown-it's. Interaction with emphasis delimiters follows markdown-it (pairs are found per marker), not cmark's single delimiter stack; no spec example depends on the difference.

## P1-12: GFM spec examples run with the extension on their fence only

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:**
  - The harness ran every `gfm/spec.txt` example with the full `gfm` preset ([testing-harness](./testing-harness.md)). With autolinks on, 4 examples in the core "Autolinks" section failed, e.g. example 619 expects `http://example.com` to stay **text** and example 620 the same for an email.
  - Those expectations only hold without the autolink extension. cmark-gfm's spec runner enables, per example, only the extension named on its fence (`example autolink`, `example table`, …); untagged examples run as plain CommonMark. `extensions.txt` runs with every extension.
- **Decision:** `presetFor(suite, extension)` in `test/utils/renderToHtml.ts`:
  - `commonmark` suite: `'commonmark'`.
  - `gfm` suite: untagged examples run with `'commonmark'`; a tagged example runs with `{ base: 'gfm', exclude: [every other built-in plugin] }`. Fence names map to plugins: `table` → `tables`, `strikethrough`, `autolink` → `autolinks`, `tagfilter`, `tasklist` → `taskLists`.
  - `gfm-extensions` suite: `'gfm'`.
- **Consequences:** The GFM spec tests each plugin on its own, which also covers "excluding a plugin removes exactly its syntax" from the spec side. testing-harness.md updated.

## P1-13: tagfilter records filtered HTML instead of rewriting the text

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:**
  - GFM's tagfilter neutralizes 9 tags (`title`, `textarea`, `style`, `xmp`, `iframe`, `noembed`, `noframes`, `script`, `plaintext`) by replacing their leading `<` with `&lt;` in the HTML output.
  - Our renderer never interprets raw HTML (D3): `HtmlBlock` and `HtmlInline` show their source as literal text, and none of the 9 tags is in the safe subset (nor can `{ allow }` add it). So on screen the filter changes nothing.
  - It does matter for consumers that produce HTML: the spec serializer, and mdast interop (`toMdast`, Phase 3, [P1-20](#p1-20-tomdast-is-deferred-to-phase-3)), whose `html` nodes someone may render as real HTML.
  - Rewriting the node text to `&lt;script>` would make the renderer show the entity literally.
- **Decision:**
  - The tagfilter plugin is a core rule after `inline` (`src/plugins/tagfilter.ts`). For each `html_block` and `html_inline` token that contains a disallowed tag (opening or closing, any case, name followed by whitespace, `>` or `/>`, as in cmark-gfm), it sets `meta.filteredHtml`: the token's HTML with each such `<` replaced by `&lt;`.
  - The converter stores it as a sparse `filteredHtml` attr on the `HtmlBlock` / `HtmlInline` node. The row text stays the source.
  - Anything that outputs HTML uses `filteredHtml ?? text`; the renderer uses `text`.
- **Consequences:**
  - No cost for documents without disallowed tags (no attr rows).
  - `gfm` example 652 and `extensions.txt` example 22 pass.
  - `toMdast` (Phase 3) must emit `filteredHtml` for `html` nodes when it is present. token-mapping.md and element-props.md updated.

## P1-14: GFM spec 0.29 vs CommonMark 0.31 emphasis

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:**
  - The pinned GFM spec (cmark-gfm `0.29.0.gfm.13`) is based on CommonMark 0.29. CommonMark 0.30/0.31 changed some emphasis results, e.g. `__foo, __bar__, baz__` is now `<strong>foo, <strong>bar</strong>, baz</strong>` (nested) instead of one `<strong>`.
  - markdown-it follows CommonMark 0.31, and so does our CommonMark suite. 9 `gfm/spec.txt` examples (398, 426, 434, 435, 436, 473, 474, 475, 477) fail only for this reason. Checked mechanically: each has a CommonMark 0.31 example with the **same input** (389, 417, 425, 426, 427, 464, 465, 466, 468), and our output matches that example's expected HTML.
- **Decision:** Follow CommonMark 0.31. Allowlist the 9 GFM examples, each entry naming its CommonMark twin.
- **Consequences:** The GFM suite passes apart from these 9 and the autolink gaps (P1-1). If a newer GFM spec is vendored, these entries should start passing and must be removed (`test.failing` enforces it).

## P1-15: Footnote navigation through an `onFootnotePress` handler

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:**
  - M3 renders footnote references (`[1]`) and one back-link mark per reference in each definition (`↩ ↩²`). On the web these are anchors that jump between reference and definition.
  - The renderer can't scroll: `BlockList` is a plain `View` inside the app's own `ScrollView` or `FlatList` (virtualization is off by default, [03 · BlockList](../03-architecture.md#blocklist)), so it has no handle on the scroll position.
  - Options considered:
    1. An `onFootnotePress` handler: the renderer reports the press and the app scrolls (or shows a popover, or ignores it).
    2. A built-in `scrollTo` that measures element positions, which needs the renderer to own the scroll view. Only possible once virtualization (phase 3) does.
- **Decision:** Option 1, added in M5 with the other events: `onFootnotePress(label, info) => void`, `info = { index, direction: 'reference' | 'definition', reference }`.
  - Pressing a reference calls it with `direction: 'definition'` (go to the definition) and `reference` = which reference of that footnote was pressed (1-based, matching the back-link marks).
  - Pressing a back-link calls it with `direction: 'reference'` and `reference` = which back-link was pressed.
  - Without the handler, references and back-links stay plain text (not pressable), as in M3.
  - Elements get the information they need to measure positions themselves (`onLayout`); the renderer does not track positions.
- **Consequences:**
  - `onFootnotePress` added to the `<Markdown>` props in [04](../04-api.md#markdown) and to M5's events in the [work breakdown](./work-breakdown.md#m5--public-api).
  - `FootnoteReference` needs to know which reference it is (the converter's `subId`, today an internal attr) to fill `reference`. M5 adds it as a prop (`subId + 1`), updating [element-props](./element-props.md).
  - Back-link marks become one pressable `<Text>` each when the handler is set (`interactiveFootnotes` render option, like `interactiveTasks`).
  - A built-in scroll helper can still come in phase 3, built on this handler.

## P1-16: Font faces for custom fonts

- **Status:** Accepted (2026-11-04), with the refinements below
- **Date:** 2026-11-04
- **Context:**
  - The theme styles `Strong` with `fontWeight: '700'` and `Emphasis` with `fontStyle: 'italic'` only ([theme-resolution](./theme-resolution.md#derived-element-styles)), relying on the platform to pick the bold or italic face.
  - Fonts loaded with `expo-font`'s `useFonts` (the only way in Expo Go, D2) register **one family per face** (`Inter_400Regular`, `Inter_400Regular_Italic`, …). Checked in M3 on devices with Inter (example app, "fonts" tab):

    | `fontFamily: 'Inter_400Regular'` plus | iOS (iPhone 18 Pro sim, iOS 27) | Android (Galaxy S25 FE) |
    |---|---|---|
    | `fontStyle: 'italic'` | **upright** | slanted (synthesized) |
    | `fontWeight: '700'` | **regular weight** | emboldened (synthesized) |
    | explicit face (`Inter_400Regular_Italic`, `Inter_700Bold`, …) | correct | correct |

  - So with a custom body font, `Strong` and `Emphasis` render as plain text on iOS, and as synthesized faces on Android. The system font works on both (except the S25 FE's system font, which has no italic and isn't synthesized).
  - Not checked yet: fonts embedded through the `expo-font` config plugin in a dev build, which can register several faces under one family name, so `fontWeight`/`fontStyle` may select real faces there.
- **Decision:** `fonts.body` and `fonts.heading` accept either a family name (as now) or a face map `{ regular, italic?, bold?, boldItalic? }`. `fonts.mono` accepts a family name or `{ regular }`.
  - The string form stays the default and behaves as before: `fontWeight`/`fontStyle` select the face. It is right for the system font and, probably, for config-plugin fonts that register several faces under one family.
  - With a face map, styles switch `fontFamily` instead of setting `fontWeight`/`fontStyle`: `Strong` → `bold`, `Emphasis` → `italic`, all headings → `bold`. The map has no semibold slot, so `h3`–`h6` use `bold` rather than `'600'`.
  - When the needed face exists, `fontWeight`/`fontStyle` are **not** also set, because Android would synthesize bold or italic on top of a real face. When it is missing, the style falls back to `fontWeight`/`fontStyle` on the nearest face, so partial maps work where the platform synthesizes.
  - Nesting needs the combined face (`***x***`, or `Emphasis` inside a `Heading`). The inline flattener tracks a `{ bold, italic }` state, seeded by the container (`Heading` starts bold), and picks `boldItalic` when both apply. The rule lives in one function that every inline element uses, and its output is a pure function of its input so block memoization is unaffected.
  - An element emits `fontFamily` only when it differs from its parent's, which keeps "inline styles carry only what they change" from [theme-resolution](./theme-resolution.md#derived-element-styles).
- **Consequences:**
  - `theme-resolution.md` and 04 · Theme updated (done with this decision).
  - The flattener gains a font-state parameter (M4 implementation), with a test that equal input gives equal output.
  - Checked on the Galaxy S25 FE in Expo Go (example app, "theme" tab, Inter face map): italic and bold-italic now render, which the string form did not give there.
  - Open, docs only: a device check on a dev build with config-plugin fonts decides whether the string form needs a note in the docs.

## P1-17: Unicode characters for superscript and subscript by default

- **Status:** Accepted (2026-11-04), amends P1-5
- **Date:** 2026-11-04
- **Context:**
  - P1-5's default (smaller text, no vertical offset) doesn't read as raised or lowered text: on the Galaxy S25 FE and the iOS simulator, `mc<sup>2</sup>` shows as "mc2" with a small 2 on the baseline.
  - Unicode superscript and subscript characters (`²`, `₂`, `ⁿ⁺¹`, `ᵢ₋₁`) render raised and lowered inside the same text run on both platforms (example app, "fonts" tab), with no layout cost.
  - Inline views (D8) also look right, but as a default they cost more (seen on both devices with the example's "inline views" switch): the accessibility text of the paragraph becomes `H￼O … mc￼` (an object-replacement placeholder per view) and copy/selection skips their content; text styles don't cross the View, so colour, font and surrounding link/bold styles are lost unless re-applied; the line grows taller on Android; the offset is a font-dependent approximation; and each one adds a native view and a second text layout to the paragraph.
- **Decision:**
  - The default `Superscript` and `Subscript` render their content as Unicode superscript/subscript characters when it is plain text and **every** character has a Unicode form (digits, `+ - − = ( )`, space, and most lowercase letters; `src/render/scripts.ts`).
  - Other content follows the `scriptFallback` option: `'smaller'` (default) keeps P1-5's smaller text; `'raised'` renders an inline view shifted by `0.4` (up) or `0.2` (down) of the block font size, re-applying the block's text colour, font and inherited style inside it. Apps opt in to the inline-view costs for that content only.
  - The two defaults are declared inline views, so they receive `baseline`; they only render a View for the `'raised'` fallback.
- **Consequences:**
  - `scriptFallback` added to the `<Markdown>` props in [04](../04-api.md#markdown) (a render option in M3, `RenderCtxInput.scriptFallback`).
  - The common cases (exponents, chemical formulas, ordinals like `x<sup>n</sup>`) look right with no inline view.
  - Copying the text yields the Unicode characters (`mc²`), not `mc2`. Screen readers read them as superscript/subscript digits.
  - The theme's `fontSize` for these elements applies only to the fallback (the characters are already small).
  - Uppercase, `q`, most letters in subscripts, brackets and other symbols fall back.

## P1-18: Theme resolve cache semantics

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:** [theme-resolution](./theme-resolution.md#caching) fixed the cache key and left open how deep "shallow per group" goes, how many user themes to keep, and what a theme input merges onto.
- **Decision:**
  - Groups are compared shallowly, plus one level where values are objects (face maps, an element's `text` and `container`). Otherwise an inline `fonts: { body: { regular, bold } }` or `elements: { Link: { text: { … } } }` would miss on every render. `Heading` functions and plugin layers compare by identity.
  - Built-in themes are kept for the app's lifetime. Other themes use a least-recently-used cache of 16 entries.
  - A theme input merges onto the built-in theme of the current color scheme. `createTheme(input, base)` merges onto an explicit base and keeps that base's colors in every scheme.
  - `useMarkdownTheme()` returns `{ tokens, styles, headings }`. `styles.Heading` is empty because heading styles depend on the level.
- **Consequences:**
  - Inputs must not be mutated after use. `createTheme` returns frozen objects.
  - An inline `Heading` function re-resolves the theme every render, so it is documented as "hoist it".
  - Plugin themes (M5) must keep stable layer objects, or they bypass the cache.


## P1-19: No legacy entry point; v0 is removed at v1.0

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:** The v0 implementation (`components/`, `libs/`, `types/`, `utils/`) is built on `mdast-util-from-markdown` and `renderRules` that read mdast nodes. v1 never exposes mdast nodes ([08](../08-model-and-api.md)), so v0 and v1 share no code. Keeping v0 reachable (a `/legacy` entry, or a deprecated export) would keep a second parser and dependency tree in the package, and a second implementation in the Expo Go import graph (D2).
- **Decision:**
  - No `/legacy` entry and no deprecated v0 export. M5 swaps the entry point to v1 and deletes the v0 sources and `mdast-util-from-markdown`.
  - v1.0 is a semver major. Users who aren't ready pin `^0.8`; `main` keeps receiving bug fixes through the Release-it workflow.
  - A migration guide covers the [migration table](../04-api.md#migration-from-v0x). The deprecated `fromRenderRules()` adapter stays optional, for the simple cases only. `extensions` (mdast-util extensions) have no adapter: they become `plugins`.
- **Consequences:**
  - Package size and the dependency tree shrink; `check:expo-go` guards a single implementation.
  - Custom `renderRules` that read mdast `node.*` must be rewritten against element props.
  - The migration guide is written in its own milestone, M8 ([P1-22](#p1-22-the-migration-guide-is-its-own-milestone-m8)).

## P1-20: `toMdast` is deferred to Phase 3

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:** The roadmap puts the `/mdast` interop entry point in Phase 3, but P1-13 and the `src/mdast` stub's header named M5. M5's done-when (API-contract type tests, no internal type in the public `.d.ts`) doesn't depend on it, and its only users are people who want the unified/remark ecosystem. It needs design that M5 doesn't cover: how plugin nodes map to mdast types, footnotes (our `FootnoteSection` is structural), source positions, and the safe-HTML elements with no mdast equivalent (`Underline`, `Highlight`, `Kbd`). It also adds `@types/mdast` and a public output shape that becomes a compatibility promise.
- **Decision:**
  - `toMdast` is not part of Phase 1. The empty `src/mdast` stub is removed; the entry point is created in Phase 3.
  - Until then the docs mark it as Phase 3 ([04](../04-api.md#lower-level-api), [03](../03-architecture.md)).
- **Consequences:**
  - P1-13's requirement moves with it: `toMdast` must emit `filteredHtml` for `html` nodes. The GFM spec serializer already consumes `filteredHtml`, so the data stays tested.
  - Users who need mdast in v1.0 can walk the tree with `visit()`.

## P1-21: `images` policy semantics

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Context:** [P1-3](#p1-3-url-sanitization-layers) covers links. Images are the other URL the renderer acts on: a remote image loads without a press, so on untrusted content (LLM output, user comments) it is a tracking beacon and a way to leak the conversation through the URL. The `images` prop (`'allow' | 'deny' | { allowHosts }`) was specified but not its details.
- **Decision:**
  - The policy applies at render time, to block and inline images alike, so changing it never re-parses.
  - A refused image renders as its alt text, plain, in the surrounding text; an empty alt renders nothing. A block image that is refused becomes an ordinary paragraph. Components never see a refused image.
  - `{ allowHosts }` matches the URL's host, lowercased, without port, userinfo or a trailing dot. An entry is an exact host or `*.example.com` (any subdomain, not the apex).
  - Under an allowlist only `http(s)` and protocol-relative URLs can match. Relative paths and `data:` images have no host, so they are refused. A URL the check can't read the way a browser would (backslashes, whitespace, control characters) is refused too, rather than guessed.
  - The default stays `'allow'`: this is a safe-by-opt-in prop, like `html` is safe-by-default only because it cannot execute anything.
- **Consequences:**
  - Apps that render untrusted content must set `images`; the docs say so on the prop.
  - Local images (`require`d assets, `file:`) can't be combined with an allowlist. Use `'allow'`, or render them through `components.Image`.
  - `images` is part of `ctx` identity, compared shallowly (an inline `{ allowHosts: [...] }` with equal entries keeps the context).

## P1-22: The migration guide is its own milestone (M8)

- **Status:** Accepted (2026-11-05)
- **Date:** 2026-11-05
- **Context:** P1-19 removed v0 and promised a migration guide, first as an M5 task. M5's done-when (API-contract type tests, no internal type in the public `.d.ts`) doesn't need it, and a guide reads best once the API and the benchmark results are final. Migrating the example app to the v1 API was already an M6 deliverable, so it needs no milestone of its own.
- **Decision:**
  - Add M8 · Migration guide, last in Phase 1 (after M7). It holds the guide, the v1 root README and the `fromRenderRules()` ship-or-drop decision.
  - The example migration stays in M6, as planned.
  - M7's exit review doesn't wait for M8. Phase 1 is complete when M8 is too.
- **Consequences:**
  - [work-breakdown](./work-breakdown.md#m8--migration-guide) gets the M8 section; the [README](./README.md), [roadmap](../07-roadmap.md) and [04](../04-api.md#migration-from-v0x) point to it. The roadmap's Phase 3 list no longer carries the guide.
  - Until M8, the root README keeps its "v1 pre-release" note over the v0 text.
  - M8 is tracked in [#23](https://github.com/amilmohd155/react-native-markdown/issues/23), a sub-issue of #7.

## P1-23: No scheduled native build of the example app in CI

- **Status:** Accepted (2026-11-05)
- **Date:** 2026-11-05
- **Context:** The harness listed an `example-build` job (iOS and Android builds of the example app, nightly) and M6's done-when required every listed job. The library is pure JS (D2): nothing in it can break a native build, so a failing job would nearly always be a toolchain problem (Expo, Xcode, Gradle, Java versions), not ours. The `web` job already exports and runs the example's JS bundle, and `expo-go-check` guards against native code in the main entry. macOS runners cost about ten times Linux minutes, and a native workflow adds upkeep.
- **Decision:**
  - Drop the `example-build` job. There is no scheduled native build.
  - The example is built natively where it matters: by hand in Expo Go during development, and as a release build on devices for the M7 benchmark (`expo run:android --variant release`).
- **Consequences:**
  - The CI table in [testing-harness](./testing-harness.md#ci-jobs) loses the row. The required set on `v1` is `lint`, `typecheck`, `unit`, `spec`, `web`, `expo-go-check`, `dts-leak` and `perf`.
  - [06 · Platform tests](../06-testing.md#platform-tests) no longer promises a native example build in CI.
  - If the example ever gets native code of its own, or a toolchain break goes unnoticed, revisit this with an on-demand workflow before a scheduled one.

## P1-24: Keep the flat table (render A/B against an object tree)

- **Status:** Accepted on the Galaxy S25 FE (2026-11-05); to be re-confirmed on the low-end Android device with the M7 run
- **Date:** 2026-11-05
- **Context:** [08](../08-model-and-api.md) left one item open: the render cost of the flat table vs. an object tree (option B). M7 measures it with the test-only object-tree renderer in `bench/objectTree/` (`<ObjectTreeMarkdown>`, the `objectTreeModel` flag; nothing under `src/` changed), following the [benchmark protocol](./benchmark-protocol.md#table-vs-object-tree-ab-the-remaining-open-item). The decision rule: keep the table unless its `firstRender` is more than 10% slower **and** its memory advantage is under 2×.
- **Measured** (Samsung S25 FE, release build, Hermes, 120 Hz; medians; table / tree):
  - `firstRender`, 5 warm-up + 20 interleaved runs: F2 74.2 / 77.8 ms (tree +5%), F3 260.5 / 263.0 ms (tree +1%).
  - `reRenderOneBlock`: F2 3.5 / 4.4 ms, F3 17.6 / 17.9 ms.
  - Tree conversion from the parsed table (`convert`): 0.9 ms (F2), 6.7 ms (F3), not included above.
  - `retainedHeap`, `gc()` forced, one model per app launch: F3 11.64 / 12.14 MB (tree +4%), F5 1.87 / 2.16 MB (tree +16%).
  - F5 scroll, 5 s at 1500 px/s: dropped frames (JS-side proxy) 47/551 / 44/560, no meaningful difference.
- **Decision:** Keep the flat table. The table is not slower than the tree (it is 1–5% faster to first render) and uses less memory (4–16%), so the rule never fires; there's no case for the object tree. The table's advantages the A/B doesn't measure (cheap structural sharing, `isSameBlock` without deep walks, no per-node allocation during parse) stay as designed.
- **Consequences:**
  - `bench/objectTree/` stays as bench-only code for re-running the A/B; it is not exported and not part of the package.
  - The Phase 1 exit item "device measurement done for the flat table vs. object tree" is met once the low-end device run (M7) confirms the same ordering.
  - **Caveats:** the S25 FE is not the pass/fail device. The A/B was a single run with the phone showing an active call, and p90 wasn't saved. The tree is converted from the parsed table (not built from tokens), keeps a node `id` (overstates its heap slightly) and shares attribute objects with the table (understates it slightly). The F5 numbers retain the parsed documents (table) or trees (tree) for all 200 messages, not just the mounted window.

## P1-25: The ≥ 5× parse-plus-first-render exit criterion is waived for Phase 1

- **Status:** Accepted (2026-11-05)
- **Date:** 2026-11-05
- **Context:** The Phase 1 exit criteria ([roadmap](../07-roadmap.md#phase-1-core-pure-js)) require parse plus first render of the 100 KB fixture (F3) to be at least 5× faster than v0.8.5 on a low-end Android device. M7 ran the [benchmark protocol](./benchmark-protocol.md) on the hardware available: a Samsung S25 FE (release build, Hermes) and Chrome 156 at 4× CPU throttle. There is no low-end Android or iPhone, so the pass/fail device was never measured.
- **Measured** (medians, v1 against v0.8.5; raw data in `bench/results/sm-s731b-2026-11-05.json` and `web-chrome156-4x-2026-11-05.json`):
  - S25 FE `parse+firstRender`: F1 25.2 / 24.6 ms (1.0×), F2 107.3 / 75.1 ms (0.7×), F3 458.6 / 447.5 ms (1.0×).
  - Web, 4× throttle: F1 1.0×, F2 1.06×, F3 1.08× (384 / 417 ms).
  - Same picture as the M3 measurement (2026-11-04), so it is not run-to-run noise.
  - On F3, v1 spends 216 ms in `parse()` and 243 ms in `firstRender` on the S25 FE.
  - The other protocol bars on F3: `reRenderOneBlock` is 15.9 ms, 6.6% of v1's own `firstRender` (bar ≤ 10%: **met**; 27× faster than v0). F5 `retainedHeap` is 1.87 MB for v1 against 0.57 MB for v0 (bar v1 ≤ v0 / 3: **not met** with this method, which keeps all 200 parsed documents for v1 but only the mounted window for v0). F5 `droppedFrames` is reported only.
- **Decision:**
  - Waive the criterion for Phase 1. It fails on the S25 FE (1.0×), a faster device than the one it names; a low-end phone slows both libraries and would not be expected to move the ratio near 5×.
  - The low-end device measurement is waived with it: no such device is available, and the result would not change the outcome.
  - The rest of Phase 1's exit criteria stand: the spec suites, Expo Go and web, and the table vs. object tree measurement ([P1-24](#p1-24-keep-the-flat-table-render-ab-against-an-object-tree)).
- **Consequences:**
  - The speed target is not dropped, only deferred. It carries into Phase 2 as an open performance item. The [roadmap](../07-roadmap.md) text keeps the 5× target.
  - Why it isn't met, from the [M3 analysis](../02-benchmarks.md#device-results-preliminary-m3) and these runs:
    - The comparison isn't like for like. v0.8.5 has no GFM, so F2/F3's tables, task lists, strikethrough, autolinks and footnotes are plain text there, and v1 renders them as elements.
    - v1's render dominates (243 ms against 216 ms of parse on F3 on device; about 90% on web).
    - Parse on Hermes (216 ms) is about 2.8× the Node `--jitless` figure (78 ms).
  - First steps for Phase 2: a CommonMark-only baseline where v0 does the same work; profile `firstRender` against element count (tables and their measuring pass, the `ScrollView` per code block, prop and element creation); profile parse on Hermes (markdown-it against the node builder); then re-measure on a low-end Android if one becomes available.
  - The F5 `retainedHeap` bar and its method (pre-parsed documents against a windowed v0) also stay open for Phase 2. This waiver doesn't cover it, because it isn't an exit criterion.
  - M7 is complete once the "Device results" section ([02](../02-benchmarks.md#device-results-m7)) records these numbers.
