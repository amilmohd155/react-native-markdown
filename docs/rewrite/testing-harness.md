# Testing harness

How the tests in [06](./06-testing.md) are built and run. The parser, renderer and platform checks come first; the streaming tests are in their own section at the end and reuse the same fixtures, `documentToHtml` and allowlist rules.

## Fixtures

Vendored in `test/fixtures/` (not downloaded at test time), each with a pinned version, checksum and license in `test/fixtures/SOURCES.md` (the spec files are CC-BY-SA 4.0 test data, not shipped in the npm package).

| Fixture | Source | Used for |
|---|---|---|
| `commonmark/spec.txt` | commonmark-spec, tag `0.31.2` | CommonMark suite (652 examples) |
| `gfm/spec.txt` | cmark-gfm `test/spec.txt` (GFM spec 0.29), tag `0.29.0.gfm.13` | GFM suite (CommonMark plus GFM sections) |
| `gfm/extensions.txt` | cmark-gfm `test/extensions.txt`, same tag | Tables, strikethrough, autolinks, tagfilter, task lists, footnotes |
| `pathological/cases.ts` | ported by hand from cmark `test/pathological_tests.py`, tag `0.31.1` (23 of 25 cases; the other 2 test cmark internals) | Time-bounded tests |

The spec files stay as the original `.txt` and are parsed by one small reader (example blocks delimited by 32 backticks, `→` for tab), so every suite shares one runner. No generated `spec.json`: fetched scripts are never executed to build fixtures. Benchmark fixtures (F1–F5, `bench/fixtures/`) are described in the [benchmark protocol](./benchmark-protocol.md#fixtures).

## Spec runner

`test/spec/spec.test.ts`:

- One test per example, compared **exactly** with the spec's HTML (`IMPLEMENTED_SUITES` in `test/utils/renderToHtml.ts`). Allowlisted examples use `test.failing`: if one starts passing, the test fails, which forces the entry to be removed so the list only shrinks.
- **Presets:** the CommonMark suite runs with `'commonmark'`. `gfm/spec.txt` runs like cmark-gfm's runner: untagged examples with `'commonmark'`, tagged ones (`example autolink`) with only that extension's plugin ([P1-12](./phase-1/decisions.md#p1-12-gfm-spec-examples-run-with-the-extension-on-their-fence-only)). `gfm/extensions.txt` runs with `'gfm'`.
- **Case-level tests:** `test/spec/autolinkCases.test.ts` splits `extensions.txt` example 19 (32 autolink cases) into one test per case, allowlisted as `"example": "19/<case>"`.
- **HTML option:** the suites run with the public `html: 'text'` mode (every tag stays a literal node, which the serializer prints unescaped), so no test-only parse mode is needed. The other `html` modes are covered by the D3 unit tests.
- **Pathological cases** are allowlisted by name (`"suite": "pathological"`, `"example": "<case name>"`).

### Allowlist format

`test/fixtures/allowlist.json`, one entry per divergence:

```json
[
  { "backend": "markdown-it", "suite": "gfm", "example": 621, "section": "Autolinks (extension)",
    "reason": "…", "issue": "https://github.com/amilmohd155/react-native-markdown/issues/…" }
]
```

Current entries (21):

- **5 pathological** cases nesting deeper than markdown-it's cap of 100 ([P1-8](./phase-1/decisions.md#p1-8-cap-markdown-it-nesting-at-100)).
- **9 `gfm` emphasis examples** (398, 426, 434–436, 473–475, 477): GFM spec 0.29 predates CommonMark 0.31, and each has an identical-input CommonMark example whose 0.31 output we match ([P1-14](./phase-1/decisions.md#p1-14-gfm-spec-029-vs-commonmark-031-emphasis)).
- **6 GFM autolink gaps** ([P1-1](./phase-1/decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps)): `gfm` 625 and `gfm-extensions` 19 as a whole (plus five case entries `19/6`, `19/10`, `19/18`, `19/23`, `19/31`, so the other 27 cases stay enforced).

A test fails if an entry names an example that doesn't exist or doesn't run, and an allowlisted example that starts passing fails through `test.failing`, so stale entries can't accumulate. Every entry needs a reason and a link (an issue, or the decision that accepted the divergence).

## HTML serializer

`documentToHtml(table)` lives in `test/utils/`, not in the package. It walks the node table and produces HTML in cmark's conventions:

- The element → tag mapping is the reverse of [token-mapping](./phase-1/token-mapping.md) (`List` + `ORDERED` with `start ≠ 1` → `<ol start="n">`, header cells → `<th>` with `align`).
- Tight lists omit `<p>` inside `<li>`, with cmark's newline rules. Text and attributes are escaped as the spec does; literal HTML nodes print as-is.
- **Iterative**, with an explicit stack: pathological inputs nest inline containers tens of thousands deep.
- **Exact comparison.** `normalizeHtml` only normalizes line endings; exact comparison also catches whitespace differences the spec's `normalize.py` would hide.

This tests **parser + conversion** (where compliance bugs come from) without React. Rendering is covered by snapshot tests.

## Renderer tests

The test list is in [06 · Renderer tests](./06-testing.md#renderer-tests). Harness specifics:

- `@testing-library/react-native` v14 for behaviour (press links, toggle tasks). It runs on `test-renderer` because `react-test-renderer` is deprecated in React 19; it needs Node 22.13+ (`.nvmrc` is 24), is async throughout, and throws on text outside `<Text>`. Tests that inspect the tree or use made-up host names use `renderTree` from `src/__tests__/tree.tsx`; `fireEvent` works only on RNTL's own `render`.
- **Render counting:** wrap each default element in a spy component through `components` and count renders per block key; the memo test asserts the count after a one-block edit.
- **Type tests:** `expect-type` files in `test/types/`, run by `tsc --noEmit`.
- **Public `.d.ts` leak check:** after `bob build`, a script scans `lib/typescript/**/*.d.ts` for `NodeTable`, `TableBuilder` or `markdown-it` reachable from the public entry points.

## Platform tests

Details in [06 · Platform tests](./06-testing.md#platform-tests). Harness specifics:

- **Web:** a separate Jest project (`jsdom`, `react-native` → `react-native-web`) re-runs the renderer tests. Playwright serves the example's web build and checks rendered text for fixed fixtures, and streams one fixture through the Stream tab.
- **Expo Go check:** `scripts/check-no-native.mjs` (`yarn check:expo-go`) walks the import graph from the main entry and fails on `TurboModuleRegistry`, `requireNativeComponent`, `codegenNativeComponent`, `NativeModules` or `react-native-nitro-modules`, or on any imported third-party package (or its dependencies) shipping native code (`android/`, `ios/`, a podspec or codegen config). It runs on `src/index.tsx` and, after the build, on `lib/module/index.js`. `src/__tests__/expoGoCheck.test.ts` runs it against throwaway projects, so the check itself is known to fail when it should.

## CI jobs

| Job | Runs |
|---|---|
| `lint` | ESLint + Prettier |
| `typecheck` | `tsc --noEmit`, including the type tests |
| `unit` | Jest (RN preset): renderer, behaviour, memo, plugin, HTML subset, inline views, stream tests |
| `spec` | CommonMark + GFM suites + pathological |
| `web` | Jest (jsdom + RN web) + Playwright smoke |
| `expo-go-check` | Native-import scan of the main entry |
| `dts-leak` | Build, then public `.d.ts` scan |
| `perf` | `yarn perf`: parse and render time under `node --jitless` against `perf/baseline.json` (fail on > 20% regression) |

All are required on `v1`. The example app's native build is not a CI job ([P1-23](./phase-1/decisions.md#p1-23-no-scheduled-native-build-of-the-example-app-in-ci)).

---

## Streaming tests (Phase 2)

### Equivalence harness

06 says the final `document` after `done()` must equal `parse(full)`. On its own that is vacuous, because `done()` always runs a full parse. The real invariant is stricter:

> **After every flush, the streamed document equals `parse(source so far)`.**

- **Inputs:** every CommonMark and GFM spec example, the F1/F2 fixtures, the transcripts in `bench/fixtures/transcripts/text/`, and the targeted cases below.
- **Comparison:** `documentToHtml` of both documents (exact), plus a structural comparison of the table columns (`type`, `flags`, `parent`, `firstChild`, `nextSibling`, block index, `blockContext`, `context`) so differences the HTML hides, such as a wrong `blockContext` that only matters for memoization, are caught too.
- **Chunkers:** fixed sizes (1, 2, 20, 195); seeded random splits (the seed is printed on failure); awkward points: inside a UTF-16 surrogate pair, between `\r` and `\n`, inside a fence marker, and at every position of a short example.
- **Allowlist:** `test/fixtures/stream-allowlist.json`, same format and shrink-only rule as `allowlist.json` (currently empty).
- **Work counter:** the core exposes, for tests only, the characters re-parsed by each flush; the harness asserts it is bounded by the open block (plus a full-reparse flag when a trigger fired).

#### Targeted cases

Each is run at every split position:

- setext heading arriving late; list continuation after a blank line, nested lists, a list ending and a paragraph starting; table rows arriving one at a time, header without delimiter yet
- open fenced code (backticks and tildes, longer closing fence, info string), and an indented fence. The open-fence fast path ([P2-5](./phase-2/decisions.md#p2-5-open-fence-fast-path)) must produce the same document as a full parse: randomized chunking, fences split mid-marker, closing-fence candidates (indented 0 to 3 spaces), a closing fence arriving with more text, and a late info string. Fences it must not take (indented 4 or more, inside a list item or quote) fall back to the normal tail re-parse; the work counter shows which path ran
- link reference definition arriving after its use (full-reparse trigger); footnote reference before its definition, and definitions in any order
- duplicate headings (slug counters across the boundary); raw HTML subset tags split across chunks; task list items; autolinks split mid-URL

#### Pathological input

Pathological cases (`test/fixtures/pathological/cases.ts`) run streamed in 1 KB chunks without coalescing. A case that is linear as one parse can still cost flushes × open-block size when streamed, so the bound scales with flush count: streamed cost ≤ `max(500 ms, 2 × (flushes + 1) × one full parse)`; the 500 ms floor keeps timer jitter from failing cheap inputs. The default run truncates inputs to 32 KB with an absolute cap; the full inputs are opt-in (`STREAM_PATHOLOGICAL_FULL=1`, about 12 minutes). Pathological cases also get a full equivalence check every few flushes (about 16 per input). Cases with `expectedPath` assert which path ran: flushes inside an open top-level fence at column 0 must report `fence-fast-path`, and fences indented 4 or more, inside a list item or inside a quote must never report it.

Run the stream tests with `yarn test:stream`. Environment knobs:

- `STREAM_WORK=1`, `STREAM_WORK_STRICT=1`: per-flush characters-re-parsed assertions (strict also rejects full re-parses outside the declared triggers). CI runs both.
- `STREAM_NO_FENCE_FAST=1`: turn the fast path off; path expectations flip. CI runs this too.
- `STREAM_SEED=<n>`: one extra seeded chunking per input. `STREAM_FULL=1`: also chunk sizes 1 and 2 on the large fixtures (about 14 s more).
- `STREAM_PATHOLOGICAL_FULL=1`, `STREAM_PATHOLOGICAL_BUDGET_MS=<n>`: full-size pathological inputs, and the absolute cap per case (default 20000 on the truncated run).

### Hook and scheduler tests

Scheduler (`src/stream/__tests__/scheduler.test.ts`, a hand-written fake clock):

- **Both schedules:** `done()` flushes buffered text synchronously and equals a full parse; `reset()` drops the buffer and cancels pending work; empty chunks are ignored; `suspend()` keeps the buffer and `resume()` flushes it; appends while suspended are dropped; `flush()` is a no-op when empty.
- **`timeout`:** leading flush on the first append, one trailing flush per window, idle after a quiet window, `flushIntervalMs` changes the window ([P2-4](./phase-2/decisions.md#p2-4-coalescing-policy)).
- **`raf`:** no leading flush, one flush per frame, nothing requested when idle; without `requestFrame` it falls back to a 16 ms timer, cancelled on `suspend()` and `done()`.
- **Smoothing:** intermediate flushes publish the smoothed view with the real `source`; `done()` returns the exact parse; `'none'` equals no option.

Hook (`src/api/__tests__/useMarkdownStream.test.tsx`, fake timers and frame source):

- Starts empty; `append`, `reset` and `done` keep their identity; a new `document` per flush; `done()` equals `parse(source)`.
- StrictMode's double effect neither duplicates nor drops text; unmount cancels the pending flush and later appends are silent no-ops.
- Default schedule: `raf` on iOS and Android, a 16 ms `timeout` with a leading flush on web, `flushIntervalMs` selects the timer everywhere.
- Dev warning once when `plugins` change (shallow compare), and when `preset` or `smoothing` change.

### Memoization test

`src/api/__tests__/streamMemo.test.tsx`: through spy components passed via `components`, stream a multi-block message (paragraphs, a list, a code fence, a table) and assert that per flush only the open block's elements render. It also asserts the `isSameBlock` prefix fast path is taken for closed blocks; that assertion is an `it.failing`, because the fast path never fires through `<Block>` (accepted gap, [P2-2](./phase-2/decisions.md#p2-2-splice-strategy)). If it is ever fixed the test starts failing, which is the cue to make it a plain `it`.

### Performance regression tests

`perf/perf.test.tsx` has a streaming metric: total flush time for the F4 stream ([benchmark-protocol](./benchmark-protocol.md#f4)), stored as a **ratio to one full parse of the same text** and sampled alternately in the same run, with the same rules as the other metrics (20% tolerance, retry twice, `yarn perf:update` after an intended change, `node --jitless`). The streaming tests add no CI jobs; they join `unit`, `web`, `perf` and `typecheck`.
