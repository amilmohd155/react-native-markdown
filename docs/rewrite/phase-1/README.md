# Phase 1 · Core (pure JS)

This folder holds the **implementation detail** for Phase 1 of the rewrite: how it is built, in what order, and how "done" is checked.

> **Rule: this folder says *how/when*, the design docs say *what*.**
> The API, architecture and decisions live in [`../03-architecture.md`](../03-architecture.md), [`../04-api.md`](../04-api.md), [`../08-model-and-api.md`](../08-model-and-api.md) and the [decision log](../07-roadmap.md#decisions). Files here link to them instead of restating them. If implementation changes the design, update the design doc first, then reference it from here.

## Scope

Phase 1 delivers everything needed to ship a usable v1 core, except streaming (phase 2), virtualization and polish (phase 3), and the native backend (phase 4). The full list is in [07 · Phase 1](../07-roadmap.md#phase-1-core-pure-js). In summary:

- markdown-it backend, with CommonMark and the full GFM set as built-in plugins
- Private flat node table, token → table conversion, block index and hashing
- Renderer: `BlockList`, memoized `Block`, inline flattener, all default elements, declared inline views
- Public API: `<Markdown>`, `components`, `definePlugin`, theme tokens, `parse`/`visit`, events, URL and image policy, safe HTML subset
- Spec suites, renderer and API-contract tests, platform CI (iOS, Android, web, Expo Go check), perf CI job
- Device benchmark against v0.8.5

## Exit criteria

Defined in [07](../07-roadmap.md#phase-1-core-pure-js). Restated here only as a checklist to track:

- [ ] CommonMark spec suite passes (documented allowlist only)
- [ ] GFM spec suite passes (documented allowlist only)
- [ ] Runs unchanged in Expo Go and on the web
- [ ] Parse plus first render of the 100 KB fixture is ≥ 5× faster than v0.8.5 on the low-end Android device ([benchmark protocol](./benchmark-protocol.md))
- [ ] Device measurement done for the flat table vs. object tree render cost (the remaining open item)

## Documents

| Document | Contents |
|---|---|
| [work-breakdown.md](./work-breakdown.md) | Milestones M0–M7 in order, with dependencies and done criteria for each |
| [token-mapping.md](./token-mapping.md) | Every markdown-it token → node table row, including the HTML subset, task lists, footnotes and plugin tokens |
| [element-props.md](./element-props.md) | How each element's public props are derived from the node table |
| [theme-resolution.md](./theme-resolution.md) | How tokens become element styles, merge order, caching |
| [testing-harness.md](./testing-harness.md) | Spec runner, HTML serializer, allowlist format, platform CI jobs |
| [benchmark-protocol.md](./benchmark-protocol.md) | Devices, fixtures, metrics, method and pass bars |
| [decisions.md](./decisions.md) | Implementation-level decisions P1-1 to P1-6 (all accepted 2026-11-03), separate from the design decisions D1–D8 |

## Reading order

1. [work-breakdown.md](./work-breakdown.md), for the plan.
2. [token-mapping.md](./token-mapping.md), which is needed to start M1.
3. The rest as each milestone starts.

## Status

Day-to-day tracking belongs in GitHub issues under a **Phase 1** milestone, not in these files. Once issues exist, [work-breakdown.md](./work-breakdown.md) links each milestone to them.

| Milestone | Status |
|---|---|
| M0 Groundwork | Not started |
| M1 Parser & node table | Not started |
| M2 GFM plugins | Not started |
| M3 Renderer | Not started |
| M4 Theme | Not started |
| M5 Public API | Not started |
| M6 Tests & platforms | Not started |
| M7 Benchmark & exit review | Not started |
