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
  - key `fn`;
  - hash computed over its definitions' text.
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
