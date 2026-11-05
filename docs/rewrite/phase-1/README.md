# Phase 1 · Core (pure JS)

This folder holds the **implementation detail** for Phase 1 of the rewrite: how it is built, in what order, and how "done" is checked.

> **Rule: this folder says *how/when*, the design docs say *what*.**
> The API, architecture and decisions live in [`../03-architecture.md`](../03-architecture.md), [`../04-api.md`](../04-api.md), [`../08-model-and-api.md`](../08-model-and-api.md) and the [decision log](../07-roadmap.md#decisions). Files here link to them instead of restating them. If implementation changes the design, update the design doc first, then reference it from here.

## Scope

Phase 1 delivers everything needed to ship a usable v1 core, except streaming (phase 2), virtualization and polish (phase 3), and the native backend (phase 4). The full list is in [07 · Phase 1](../07-roadmap.md#phase-1-core-pure-js). In summary:

- markdown-it backend, with CommonMark and the full GFM set as built-in plugins
- Private flat node table, token → table conversion, block index and block identity (P1-9)
- Renderer: `BlockList`, memoized `Block`, inline flattener, all default elements, declared inline views
- Public API: `<Markdown>`, `components`, `definePlugin`, theme tokens, `parse`/`visit`, events, URL and image policy, safe HTML subset
- Spec suites, renderer and API-contract tests, platform CI (iOS, Android, web, Expo Go check), perf CI job
- Device benchmark against v0.8.5
- Migration guide and v1 README, last (M8)

## Exit criteria

Defined in [07](../07-roadmap.md#phase-1-core-pure-js). Restated here only as a checklist to track:

- [x] CommonMark spec suite passes (documented allowlist only)
- [x] GFM spec suite passes (documented allowlist only)
- [x] Runs unchanged in Expo Go and on the web
- [ ] ~~Parse plus first render of the 100 KB fixture is ≥ 5× faster than v0.8.5 on the low-end Android device~~ **Waived**, not met (1.0× on the S25 FE; no low-end device): [P1-25](./decisions.md#p1-25-the--5-parse-plus-first-render-exit-criterion-is-waived-for-phase-1) ([benchmark protocol](./benchmark-protocol.md))
- [x] Device measurement done for the flat table vs. object tree render cost (the remaining open item): [P1-24](./decisions.md#p1-24-keep-the-flat-table-render-ab-against-an-object-tree)

## Documents

| Document | Contents |
|---|---|
| [work-breakdown.md](./work-breakdown.md) | Milestones M0–M8 in order, with dependencies and done criteria for each |
| [token-mapping.md](./token-mapping.md) | Every markdown-it token → node table row, including the HTML subset, task lists, footnotes and plugin tokens |
| [element-props.md](./element-props.md) | How each element's public props are derived from the node table |
| [theme-resolution.md](./theme-resolution.md) | How tokens become element styles, merge order, caching |
| [testing-harness.md](./testing-harness.md) | Spec runner, HTML serializer, allowlist format, platform CI jobs |
| [benchmark-protocol.md](./benchmark-protocol.md) | Devices, fixtures, metrics, method and pass bars |
| [decisions.md](./decisions.md) | Implementation-level decisions P1-1 to P1-26 (all accepted), separate from the design decisions D1–D8 |

## Reading order

1. [work-breakdown.md](./work-breakdown.md), for the plan.
2. [token-mapping.md](./token-mapping.md), which is needed to start M1.
3. The rest as each milestone starts.

## Status

Status is tracked in GitHub issues, not in these files: tracking issue [#7](https://github.com/amilmohd155/react-native-markdown/issues/7) with one sub-issue per milestone. The docs change only when the design or plan changes.

| Milestone | Issue |
|---|---|
| M0 Groundwork | [#8](https://github.com/amilmohd155/react-native-markdown/issues/8) |
| M1 Parser & node table | [#9](https://github.com/amilmohd155/react-native-markdown/issues/9) |
| M2 GFM plugins | [#10](https://github.com/amilmohd155/react-native-markdown/issues/10) |
| M3 Renderer | [#11](https://github.com/amilmohd155/react-native-markdown/issues/11) |
| M4 Theme | [#12](https://github.com/amilmohd155/react-native-markdown/issues/12) |
| M5 Public API | [#13](https://github.com/amilmohd155/react-native-markdown/issues/13) |
| M6 Tests & platforms | [#14](https://github.com/amilmohd155/react-native-markdown/issues/14) |
| M7 Benchmark & exit review | [#15](https://github.com/amilmohd155/react-native-markdown/issues/15) |
| M8 Migration guide | [#23](https://github.com/amilmohd155/react-native-markdown/issues/23) |
