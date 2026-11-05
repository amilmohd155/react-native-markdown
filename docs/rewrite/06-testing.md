# 06 · Spec compliance & testing

"Full CommonMark + GFM" has to be verified, not just claimed.

## Spec suites

| Suite | Source | How to run |
|---|---|---|
| CommonMark spec (652 examples) | `spec.txt` from the commonmark/commonmark-spec repo, tag 0.31.2 | Jest `each` over the examples |
| GFM spec (CommonMark + extension examples) | github/cmark-gfm `test/spec.txt` and `test/extensions.txt` | same |
| Pathological inputs | commonmark/cmark `test/pathological_tests.py` patterns, ported to `test/fixtures/pathological/cases.ts` | Time-bounded Jest tests (e.g. < 100 ms each) |

### How the renderer is tested against HTML

The spec cases define expected **HTML**. The test harness includes a small `documentToHtml(doc)` serializer that walks our block model. Comparing its output with the spec's (after normalizing it the way the spec runner does) checks:

1. The parser backend, and
2. Our token → node table conversion, which is where most compliance bugs would come from.

Every backend (markdown-it, native) runs the same suite. A documented, per-backend allowlist covers known divergences (e.g. linkify vs. GFM autolinks), and it has to shrink over time.

## Renderer tests

- **Snapshot tests** of the React element tree, rendered with `@testing-library/react-native` v14 (its `test-renderer`), for every element in light and dark themes, plus each built-in plugin.
- **Behaviour tests:**
  - `onLinkPress` returning `false` cancels the default.
  - Task toggle.
  - URL sanitization.
  - Image allowlist.
- **Memoization tests:** Change one block and assert that only that block's elements rendered (spy components passed through `components`). Assert that a user `memo` component bails out when its block is unchanged.
- **API contract tests:** type-level tests (`tsd`/`expect-type`) checking element props, plugin-registered elements and theme keys. They ensure the internal node table never leaks into public types.
- **Plugin tests:** a plugin's syntax, element and theme work together, and plugin order and override rules hold.
- **Streaming tests:** For random chunkings of every spec example, the final `document` after `done()` must equal `parse(full)`.

## Platform tests

- **iOS and Android:** Jest with the `react-native` preset, plus the example app built in CI.
- **Web (decision D1):** run the renderer tests again under `react-native-web` with jsdom. A smoke test in a real browser (Playwright) renders the spec fixtures and checks text and links.
- **Expo Go (decision D2):** a CI check fails if the main entry point's dependency graph imports a native module (`TurboModuleRegistry`, `requireNativeComponent`, `NativeModules`, Nitro). The example app also runs in Expo Go before each release.
- **Raw HTML safe subset (D3):** each allowlisted tag, nesting, unmatched tags, unknown tags (must stay as literal text), and `'text'`/`'strip'`/`{ allow }` modes.
- **Inline views (D8):** declared views render inside the paragraph's `<Text>`. Undeclared Views trigger the dev warning.

## Performance regression tests

- `yarn perf` (`perf/perf.test.tsx`, a Jest project) is the CI job. It measures:
  - parse time for 1 KB / 10 KB / 100 KB / 1 MB fixtures,
  - first render (`<Markdown document>` mounted with the test renderer) for the same fixtures,
  - the re-render after editing the last block of the 100 KB fixture, and
  - streaming time for a 10 KB message in 500 chunks: phase 2, nothing to measure yet.
- Run with `node --jitless`, the closest CI proxy for Hermes. Fail on more than a 20% regression from the baseline stored in the repo (`perf/baseline.json`).
- Runners differ in speed, so each metric is stored as a ratio to markdown-it parsing the same text, sampled alternately in the same run (best of N each); a failing metric is retried twice, so only a regression that repeats fails. After an intended change, run `yarn perf:update` and commit the new baseline. `bench/` stays the research workspace (parser comparisons, evidence scripts).
- Manual, per release: a Hermes profile on a low-end Android device using the example app's benchmark screen.

## Release gating

- Keep release-it's `skipChecks: true`: it only skips npm auth/registry pre-checks, which npm Trusted Publishing requires skipping ([P1-7](./phase-1/decisions.md#p1-7-keep-release-it-skipchecks-gate-releases-in-the-release-workflow)).
- The release workflow runs lint, typecheck, unit tests, spec suites and the Expo Go check before building and publishing.
- CI must pass the spec suites, unit tests, `tsc`, lint and the perf job before `release-it` runs.
