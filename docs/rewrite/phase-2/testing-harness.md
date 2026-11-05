# Phase 2 · Testing harness

How the streaming rows of [06 · Spec compliance & testing](../06-testing.md) are built and run. Phase 1's harness ([phase-1/testing-harness.md](../phase-1/testing-harness.md)) is reused: same fixtures, same `documentToHtml`, same allowlist rules.

## Equivalence harness

06 says: "for random chunkings of every spec example, the final `document` after `done()` must equal `parse(full)`". On its own that is vacuous, because `done()` always runs a full parse. The real invariant is stricter:

> **After every flush, the streamed document equals `parse(source so far)`.**

(`done()` is checked as well, but only as a guard.)

- **Inputs:** every CommonMark and GFM spec example (`test/fixtures`), the F1/F2 bench fixtures, the transcripts collected in S0, and the targeted cases below.
- **Comparison:** `documentToHtml` of both documents (exact string equality, as in the spec runner), and a structural comparison of the table columns (`type`, `flags`, `parent`, `firstChild`, `nextSibling`, block index, `blockContext`, `context`) so differences the HTML hides are caught too. A pure-HTML pass would miss, for example, a wrong `blockContext` that only matters for memoization.
- **Chunkers:** fixed sizes (1, 2, 20, 195); seeded random splits (the seed is printed on failure so a failure reproduces); splits at awkward points: inside a UTF-16 surrogate pair, between `\r` and `\n`, inside a fence marker, and at every position of a short example.
- **Allowlist:** `test/fixtures/stream-allowlist.json`, same format and same shrink-only rule as `allowlist.json` (an entry that starts passing fails through `test.failing`, every entry needs a reason and a link). Divergences are documented, not hidden.
- **Work counter:** the stream core exposes, for tests only, the number of characters re-parsed by each flush. The harness asserts it is bounded by the open block (plus a full-reparse flag when a trigger fired).

### Targeted cases

Each is run at every split position:

- setext heading arriving late (`Title`, then `===`, then `-`)
- list continuation after a blank line; nested lists; a list ending and a paragraph starting
- table rows arriving one at a time; header without delimiter yet
- open fenced code (backticks and tildes, longer closing fence, info string), and an indented fence
- link reference definition arriving after its use (full-reparse trigger)
- footnote reference before its definition, and definitions arriving in any order
- duplicate headings (slug counters across the boundary)
- raw HTML subset tags split across chunks
- task list items, autolinks split mid-URL

### Pathological input

The pathological cases (`test/fixtures/pathological/cases.ts`) run streamed in 1 KB chunks and must stay time-bounded, so a case that is linear as a single parse is not quadratic when streamed.

## Hook and scheduler tests

- Fake clock and `requestAnimationFrame`: N appends within a frame produce one flush; appends across frames produce one flush each (or per the adaptive policy).
- `append`, `reset`, `done` keep their identity across renders.
- StrictMode: double effect run neither duplicates nor drops text.
- Unmount cancels the pending frame; a later `append` is a no-op without warning.
- `done()` flushes synchronously and the result equals `parse(source)`.
- Changing `plugins`/`preset` identity warns in dev.

## Memoization test

As in 06, through spy components passed via `components`: stream a multi-block message and assert that, per flush, only the open block's elements render. Also asserts the `isSameBlock` fast path is taken for closed blocks (no source-text comparison) using a spy counter.

## Platform tests

- **Web:** the hook and equivalence tests run again in the jsdom + `react-native-web` Jest project. The Playwright smoke test streams one fixture and checks the final text.
- **Expo Go:** unchanged, `yarn check:expo-go` must still pass: the stream core and hook add no native imports.

## Performance regression tests

`perf/perf.test.tsx` gains the streaming metric 06 reserved ("streaming time for a 10 KB message in 500 chunks: phase 2"):

- The metric is the total flush time for the F4 stream ([benchmark-protocol.md](./benchmark-protocol.md#f4)), stored as a **ratio to one full parse of the same text**, sampled alternately in the same run, like the existing metrics. Same rules: 20% regression tolerance, retry twice, `yarn perf:update` after an intended change.
- Runs under `node --jitless`, as the others do.

## CI jobs

No new jobs: the streaming tests join `unit`, `web`, `perf` and `typecheck` (the hook's public types are covered by the type tests and `dts-leak`). All stay required on `v1`.
