# Phase 1 · Testing harness

This file covers how the tests in [06](../06-testing.md) are built and run during Phase 1.

## Fixtures

These are vendored in `test/fixtures/` (not downloaded at test time), each with a pinned version and source recorded in `test/fixtures/SOURCES.md`.

| Fixture | Source | Pinned version | Used for |
|---|---|---|---|
| `commonmark/spec.txt` | commonmark/commonmark-spec `spec.txt` | tag `0.31.2` | CommonMark suite (652 examples) |
| `gfm/spec.txt` | github/cmark-gfm `test/spec.txt` (GFM spec 0.29) | tag `0.29.0.gfm.13` | GFM suite (CommonMark plus GFM sections) |
| `gfm/extensions.txt` | github/cmark-gfm `test/extensions.txt` | tag `0.29.0.gfm.13` | Tables, strikethrough, autolinks, tagfilter, task lists, footnotes |
| `pathological/cases.ts` | ported by hand from commonmark/cmark `test/pathological_tests.py` (23 of 25 cases; the other 2 test cmark internals) | tag `0.31.1` | Time-bounded tests |
| `docs/` | markdown-it README ×5 / ×60, plus real LLM transcripts (to be collected) | — | Benchmarks and snapshots |

All three spec files are kept as the original `.txt` and parsed by one small reader for the spec format (example blocks delimited by 32 backticks, with `→` standing for tab), so both suites share one runner. No generated `spec.json`: fetched scripts are never executed to build fixtures.

Checksums and licenses (the spec files are CC-BY-SA 4.0 test data, not shipped in the npm package) are in `test/fixtures/SOURCES.md`.

## Spec runner

`test/spec/spec.test.ts` (as built in M1):

- **Implemented suites** (`IMPLEMENTED_SUITES` in `test/utils/renderToHtml.ts`) register one test per example, compared **exactly** with the spec's HTML. Allowlisted examples use `test.failing` instead.
- **Suites not required yet** (none since M2; the GFM suites until then) register a single informational test that reports how many examples already pass. Per-example `test.failing` doesn't work there: once the core parser exists, the CommonMark examples inside the GFM spec pass, and `test.failing` rejects a pass.
- **Allowlisted examples use `test.failing`.** If an allowlisted example starts passing, the test fails, which forces the allowlist entry to be removed so the list only shrinks.
- **Presets:** the CommonMark suite runs with `preset: 'commonmark'`. `gfm/spec.txt` examples run like cmark-gfm's runner: untagged ones with `'commonmark'`, tagged ones (`example autolink`) with only that extension's plugin ([P1-12](./decisions.md#p1-12-gfm-spec-examples-run-with-the-extension-on-their-fence-only)). `gfm/extensions.txt` runs with `preset: 'gfm'`.
- **Case-level tests:** `test/spec/autolinkCases.test.ts` splits `extensions.txt` example 19 (32 autolink cases) into one test per case; cases are allowlisted as `"example": "19/<case>"`.
- **HTML option:** the spec expects raw HTML passed through. The suites run with the public `html: 'text'` mode, where every tag stays a literal node, and the serializer prints literal HTML nodes unescaped. No test-only parse mode is needed. The other `html` modes are covered by the D3 unit tests.
- **Pathological cases** are matched by name in the allowlist (`"suite": "pathological"`, `"example": "<case name>"`).

### Allowlist format

`test/fixtures/allowlist.json`:

```json
[
  { "backend": "markdown-it", "suite": "gfm", "example": 621, "section": "Autolinks (extension)",
    "reason": "…", "issue": "https://github.com/amilmohd155/react-native-markdown/issues/…" }
]
```

Entries after M2 (21):
- **5 pathological** cases that nest deeper than markdown-it's cap of 100 levels ([P1-8](./decisions.md#p1-8-cap-markdown-it-nesting-at-100)).
- **9 `gfm` emphasis examples** (398, 426, 434–436, 473–475, 477) where GFM spec 0.29 predates CommonMark 0.31. Each has an identical-input CommonMark example whose 0.31 output we match ([P1-14](./decisions.md#p1-14-gfm-spec-029-vs-commonmark-031-emphasis)).
- **The 6 GFM autolink gaps** from [P1-1](./decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps): `gfm` 625, and 5 cases of `gfm-extensions` 19. That example bundles 32 cases, so it is allowlisted as a whole (one more entry), and the case-level test `test/spec/autolinkCases.test.ts` keeps the other 27 enforced; its 5 gaps are entries `"19/6"`, `"19/10"`, `"19/18"`, `"19/23"`, `"19/31"`.

A test fails if an entry names an example or case that doesn't exist or doesn't run (disabled), and an allowlisted example that starts passing fails through `test.failing`, so stale entries can't accumulate.

Every entry needs a reason and a link: an issue, or the decision that accepted the divergence. Reviewing the allowlist is part of the M1 and M2 done checks ([work-breakdown](./work-breakdown.md)).

## HTML serializer

`documentToHtml(table)` lives in `test/utils/`, not in the published package. It walks the node table and produces HTML in the spec's (cmark's) conventions:

- Element → tag mapping is the reverse of [token-mapping.md](./token-mapping.md). For example, `List` + `ORDERED` with `start ≠ 1` → `<ol start="n">`; header cells → `<th>`, alignment as `align="…"` as cmark-gfm emits it.
- Tight lists omit `<p>` inside `<li>`. A block that opens right after a tight paragraph starts on a new line, and `<li>` stays on its line when empty or when it starts with a tight paragraph, as in cmark's output.
- Text and attributes are escaped as the spec does (`&`, `<`, `>`, `"`). Literal HTML nodes are printed as-is.
- **Iterative**, with an explicit stack: pathological inputs nest inline containers tens of thousands deep.
- **Exact comparison.** `normalizeHtml` only normalizes line endings. Because the serializer matches the spec's conventions, porting the spec's `normalize.py` wasn't needed, and exact comparison also catches whitespace differences that `normalize.py` would hide.

This tests **parser + conversion** (where compliance bugs come from) without involving React. Rendering is covered by snapshot tests.

## Renderer tests

The test list is in [06 · Renderer tests](../06-testing.md#renderer-tests). Harness specifics:

- `@testing-library/react-native` for behaviour (press links, toggle tasks).
- `react-test-renderer` is deprecated in React 19 ([react.dev](https://react.dev/warnings/react-test-renderer)), so tests use `@testing-library/react-native` v14, which runs on `test-renderer` (needs Node 22.13+; `.nvmrc` is 24). Everything is async (`await render`, `await rerender`, `await act`). It queries host elements only and throws on text outside `<Text>`, so tests that inspect the tree or use made-up host names (`hostComponents()`) use `renderTree` from `src/__tests__/tree.tsx`, a thin helper on `test-renderer`'s `createRoot` that has no text rule. `fireEvent` works only on trees rendered by RNTL's own `render`.
- **Render counting:** wrap each default element in a spy component through `components` and count renders per block key. The memo test asserts the count after a one-block edit.
- **Type tests:** `expect-type` files in `test/types/`, run by `tsc --noEmit`.
- **Public `.d.ts` leak check:** after `bob build`, a script scans `lib/typescript/**/*.d.ts` for `NodeTable`, `TableBuilder` or `markdown-it`, and fails if any of them is reachable from the public entry points.

## Platform tests

Details are in [06 · Platform tests](../06-testing.md#platform-tests). Harness specifics:

- **Web:** a separate Jest project with `testEnvironment: 'jsdom'` and the `react-native` → `react-native-web` module mapper. It runs the renderer tests again. The Playwright smoke test serves the example app's web build and checks rendered text for a fixed set of fixtures.
- **Expo Go check:** `scripts/check-no-native.mjs` (`yarn check:expo-go`) walks the import graph from the main entry and fails if any module references `TurboModuleRegistry`, `requireNativeComponent`, `codegenNativeComponent`, `NativeModules` or `react-native-nitro-modules`, or if a third-party package it imports, or any package that one depends on, ships native code (an `android/` or `ios/` directory, a podspec, or a codegen config). It runs on `src/index.tsx` (`expo-go-check` job and the release workflow) and, with `yarn check:expo-go lib/module/index.js`, on the built entry that apps load (`dts-leak` job, after the build). `src/__tests__/expoGoCheck.test.ts` runs the script against throwaway projects, so the check itself is known to fail when it should.

## CI jobs

| Job | Runs | Required on `v1` |
|---|---|---|
| `lint` | ESLint + Prettier | ✅ |
| `typecheck` | `tsc --noEmit`, including the type tests | ✅ |
| `unit` | Jest (RN preset): renderer, behaviour, memo, plugin, HTML subset, inline views | ✅ |
| `spec` | CommonMark + GFM suites + pathological | ✅ |
| `web` | Jest (jsdom + RN web) + Playwright smoke | ✅ |
| `expo-go-check` | Native-import scan of the main entry | ✅ |
| `dts-leak` | Build, then public `.d.ts` scan | ✅ |
| `perf` | `yarn perf`: parse and render time under `node --jitless` against `perf/baseline.json` (fail on > 20% regression) | ✅ (after M6) |

The example app's native build is not a CI job ([P1-23](./decisions.md#p1-23-no-scheduled-native-build-of-the-example-app-in-ci)).
