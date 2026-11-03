# Phase 1 · Testing harness

This file covers how the tests in [06](../06-testing.md) are built and run during Phase 1.

## Fixtures

These are vendored in `test/fixtures/` (not downloaded at test time), each with a pinned version and source recorded in `test/fixtures/SOURCES.md`.

| Fixture | Source | Pinned version | Used for |
|---|---|---|---|
| `commonmark/spec.json` | commonmark/commonmark-spec, generated with `test/spec_tests.py --dump-tests` | 0.31.2 | CommonMark suite |
| `gfm/spec.txt` | github/cmark-gfm `test/spec.txt` | latest tag at M0 | GFM suite (CommonMark plus GFM sections) |
| `gfm/extensions.txt` | github/cmark-gfm `test/extensions.txt` | same tag | Tables, strikethrough, autolinks, tagfilter, task lists, footnotes |
| `pathological/` | patterns from commonmark-spec `test/pathological_tests.py` | 0.31.2 | Time-bounded tests |
| `docs/` | markdown-it README ×5 / ×60, plus real LLM transcripts (to be collected) | — | Benchmarks and snapshots |

The `.txt` spec files are parsed with a small reader for the spec format (example blocks delimited by 32 backticks, with `→` standing for tab), so the parser examples and the GFM examples share one runner.

## Spec runner

```ts
describe.each(examples)('$section #$example', ({ markdown, html, example, section }) => {
  const known = allowlist.get(backend, example);
  const actual = normalizeHtml(documentToHtml(parse(markdown, { preset })));
  if (known) test.failing(known.reason, () => expect(actual).toBe(normalizeHtml(html)));
  else test('matches spec', () => expect(actual).toBe(normalizeHtml(html)));
});
```

- **Allowlisted examples use `test.failing`.** If an allowlisted example starts passing, the test fails, which forces the allowlist entry to be removed so the list only shrinks.
- **Presets:** the CommonMark suite runs with `preset: 'commonmark'`. The GFM suite runs with `preset: 'gfm'`.
- **HTML option:** the spec suites run with `html: 'render'`, a **test-only** mode in which HTML passes through `documentToHtml` unchanged, because the spec expects raw HTML output. The public `html` modes are covered by the D3 tests instead.

### Allowlist format

`test/fixtures/allowlist.json`:

```json
[
  { "backend": "markdown-it", "suite": "gfm", "example": 621, "section": "Autolinks (extension)",
    "reason": "…", "issue": "https://github.com/amilmohd155/react-native-markdown/issues/…" }
]
```

Known entries expected from the start: the 6 GFM autolink cases listed in [P1-1](./decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps). Because one `extensions.txt` example bundles 32 cases (5 of the 6 gaps are in it), that example is allowlisted as a whole, and a **case-level** test split from it keeps the other 27 cases enforced.

Every entry needs a reason and a linked issue. Reviewing the allowlist is part of the M1 and M2 done checks ([work-breakdown](./work-breakdown.md)).

## HTML serializer

`documentToHtml(doc)` lives in `test/utils/`, not in the published package. It walks the node table and produces the HTML the spec expects:

- Element → tag mapping is the reverse of [token-mapping.md](./token-mapping.md). For example, `List` + `ORDERED` with `start ≠ 1` → `<ol start="n">`, `TableCell` `align` → `style="text-align: …"` as cmark-gfm emits it.
- Tight lists omit `<p>` inside `<li>`, as in the spec.
- Text is escaped as the spec does (`&`, `<`, `>`, `"`).
- `normalizeHtml` ports the spec's `normalize.py`: collapse whitespace between tags, normalize attribute order and self-closing tags. This keeps the comparison semantic, not byte-exact.

This tests **parser + conversion** (where compliance bugs come from) without involving React. Rendering is covered by snapshot tests.

## Renderer tests

The test list is in [06 · Renderer tests](../06-testing.md#renderer-tests). Harness specifics:

- `@testing-library/react-native` for behaviour (press links, toggle tasks).
- **Render counting:** wrap each default element in a spy component through `components` and count renders per block key. The memo test asserts the count after a one-block edit.
- **Type tests:** `expect-type` files in `test/types/`, run by `tsc --noEmit`.
- **Public `.d.ts` leak check:** after `bob build`, a script scans `lib/typescript/**/*.d.ts` for `NodeTable`, `TableBuilder` or `markdown-it`, and fails if any of them is reachable from the public entry points.

## Platform tests

Details are in [06 · Platform tests](../06-testing.md#platform-tests). Harness specifics:

- **Web:** a separate Jest project with `testEnvironment: 'jsdom'` and the `react-native` → `react-native-web` module mapper. It runs the renderer tests again. The Playwright smoke test serves the example app's web build and checks rendered text for a fixed set of fixtures.
- **Expo Go check:** run `madge` (or esbuild's metafile) over `src/index.ts` and fail if the graph includes any module that references `TurboModuleRegistry`, `requireNativeComponent`, `NativeModules` or `react-native-nitro-modules`.

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
| `perf` | `bench` with `node --jitless` against stored baselines (fail on > 20% regression) | ✅ (after M6) |
| `example-build` | Example app iOS/Android build | Nightly |
