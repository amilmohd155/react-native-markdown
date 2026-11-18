# Phase 2 · Streaming

Implementation detail for Phase 2: how it is built, in what order, and how "done" was checked. The design lives in [`../05-streaming.md`](../05-streaming.md), [`../03-architecture.md`](../03-architecture.md), [`../04-api.md`](../04-api.md), [`../08-model-and-api.md`](../08-model-and-api.md) and the [decision log](../07-roadmap.md#decisions). Files here link to them instead of restating them; if implementation changes the design, update the design doc first.

## Scope

Streaming on the Phase 1 core ([07 · Phase 2](../07-roadmap.md#phase-2-streaming)): `useMarkdownStream` feeding `<Markdown document>` on a React-free stream core; tail re-parse with node-table splicing (`parseFrom`); batching (a per-frame flush on native, a 16 ms window on web, [P2-4](./decisions.md#p2-4-coalescing-policy)); optional `smoothing: 'hide-incomplete'` (always on since [P2b-2](../phase-2b/decisions.md#p2b-2-hide-incomplete-is-always-on-the-smoothing-option-is-removed)); randomized-chunking equivalence tests, perf CI additions and the F4 device benchmark. Out of scope: virtualization and polish (Phase 3), the native backend (Phase 4).

## Exit criteria

Defined in [07](../07-roadmap.md#phase-2-streaming); all met or waived by name.

- [x] **Streaming cost bars** (2× on 195-character chunks, 5× on 20-character chunks, at the 50 ms window; `F4d` at most 20 ms): met with a waiver for documents ending in a footnote definition, as accepted in [P2-1](./decisions.md#p2-1-exit-criterion-wording-and-the-f4-fixture). [Results](../../../bench/results/REPORT.md#phase-2-device-results-summary).
- [x] **Equivalence:** after every append the streamed document equals `parse(source so far)`, with an empty allowlist ([testing-harness](../testing-harness.md#equivalence-harness)).
- [x] **Only the open block re-renders per update:** memo test passes; the `isSameBlock` prefix fast path never fires through `<Block>`, accepted with measured cost ([P2-2](./decisions.md#p2-2-splice-strategy)).
- [x] **Runs unchanged in Expo Go and on the web** (`check:expo-go`, `web` job).
- [x] **Device measurement of F4 on the S25 FE and web**, in [`bench/results/REPORT.md`](../../../bench/results/REPORT.md). iPhone and `F4c` are waived by [P2-8](./decisions.md#p2-8-iphone-run-and-f4c-deferred).

## Phase 1 carry-over (accepted, [P2-7](./decisions.md#p2-7-where-the-phase-1-carry-over-lives))

The items carried out of [P1-25](../phase-1/decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) are not Phase 2 work. They are tracked in #36 and #37, and the optimization-only ones are deferred to the [optimization pass](../07-roadmap.md#optimization-pass-after-the-last-feature-phase) (D9).

## Documents

| Document | Contents |
|---|---|
| [work-breakdown.md](./work-breakdown.md) | Milestones S0–S5, dependencies and done criteria |
| [stream-algorithm.md](./stream-algorithm.md) | Tail boundary, carried context, full-reparse triggers, open-fence fast path |
| [table-splicing.md](./table-splicing.md) | `parseFrom`, splicing into a new table, the `isSameBlock` prefix fast path |
| [hook-and-scheduler.md](./hook-and-scheduler.md) | The stream core, the scheduler, `useMarkdownStream`, lifecycle |
| [smoothing.md](./smoothing.md) | `hide-incomplete` semantics |
| [testing-harness.md](../testing-harness.md), [benchmark-protocol.md](../benchmark-protocol.md) | Shared harness and protocol, with Phase 2 sections |
| [decisions.md](./decisions.md) | Decisions P2-1 onward |

Reading order: the work breakdown (and why S0 comes first), then the stream algorithm, then the rest as each milestone starts.

## Status

Tracked in GitHub issues, not in these files: tracking issue [#28](https://github.com/amilmohd155/react-native-markdown/issues/28) with sub-issues #29 (S0) to #34 (S5), on the Phase 1 pattern (#7). PRs target `v1`, and "Closes #n" doesn't auto-close from `v1`, so close milestone issues by hand.

## Exit review (2026-11-06)

**Phase 2 exit criteria satisfied.** Every criterion and every S0–S5 deliverable is met, or waived by name, with no blockers. Checked on the worktree: lint, typecheck, unit (839), stream (1407), spec (1413), web (380), `check:expo-go`, build and `check:public-types` all green.

### Waivers

- **P2-1, footnote-ending documents:** the 2× / 5× bars apply to steady-state flush cost and are waived for documents that end in a footnote definition (F2 does); the measured S25 FE figures (`F4a` 6.30× / 7.11×, `F4b` 2.46× / 2.51×) are the accepted ones. The footnote-free variant passes the original bars.
- **P2-2, `isSameBlock` gap:** accepted with measured cost, no code fix.
- **P2-8, iPhone and `F4c`:** unmeasured, joined to the [v1.0 gate](../07-roadmap.md#v10-release-gate) as measured or waived by name.

### Follow-ups (none blocks Phase 2)

- #36 perf hardening (before Phase 3, now deferred to the optimization pass where it is tuning) and #37 v1.0 gate (low-end Android, plus the iPhone and `F4c` per P2-8).
- The footnote-seeding route was tried and dropped ([P2-3](./decisions.md#p2-3-parsefrom-contract)); reopen only if footnote-ending streams matter.
- Fixtures over 6000 characters run chunk sizes 1 and 2 in the equivalence harness only with `STREAM_FULL=1` ([testing-harness](../testing-harness.md)).
