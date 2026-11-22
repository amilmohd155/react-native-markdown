# Rewrite proposal: `@docren/react-native-markdown` v1

**Status:** Draft for discussion · **Date:** 2026-11-03 · **Applies to:** v0.8.5

This folder is a design proposal for rewriting the package with three goals:

1. **Performance.** Smooth on mid-range Android, including long documents and LLM streaming.
2. **Efficiency.** Do no repeated work: parse once, render only what changed, mount only what's visible.
3. **Full CommonMark + GFM by default**, verified against the official spec test suites.

## TL;DR

Replace today's *parse whole document with micromark → walk mdast recursively → rebuild the whole element tree on every render* with a **block-oriented, memoized pipeline**:

```
markdown ──► Parser backend (pluggable)
              ├─ JS: markdown-it + GFM plugins     (default, runs everywhere incl. Expo Go / web)
              └─ Native: md4c / cmark-gfm via JSI  (optional, later)
                     │
                     ▼
         Private flat node table + block index  {type[], parent[], …, blockStart[]}
                     │                                  (same layout from both backends)
           BlockList  (plain View; ScrollView with `scroll`; FlatList with `virtualize`)
                     │
     memo(Block) per top-level block (skipped when its source and context are unchanged)
                     │
     Inline content → ONE <Text> per block: raw strings, nested <Text> only for styled spans
                     │
     Public API: element components with semantic props, plugins, flat theme
```

In the benchmark, markdown-it parses 7–15× faster than the current parser (micromark). Block-level memoization keeps streaming cost close to the size of the newest chunk, not the whole document. The flat node table keeps about 5.5× less in memory than today's mdast tree.

**Platforms:** iOS, Android and web (react-native-web). The default package works in Expo Go (pure JS). The native parser is an opt-in add-on.

The rewrite is allowed to break the API, and does. Users work with **element components with semantic props** (`Heading { level }`, `Link { href }`), **plugins** that bundle syntax, element and theme, and a **flat theme**. The internal node format is private, so the JS and native backends can share it and it can change without breaking anyone. See [08](./08-model-and-api.md).

## Documents

| # | Document | What it covers |
|---|---|---|
| 01 | [Current state](./01-current-state.md) | Review of v0.8.5: what works, bugs, structural limits |
| 02 | [Benchmarks](./02-benchmarks.md) | Conclusions from the measurements (full log: [`bench/results/REPORT.md`](../../bench/results/REPORT.md)) |
| 03 | [Architecture](./03-architecture.md) | The proposed pipeline, layer by layer |
| 04 | [Public API](./04-api.md) | `<Markdown>` props, element catalog, theme, plugins, migration |
| 05 | [Streaming](./05-streaming.md) | Incremental parsing and rendering for LLM/chat output |
| 06 | [Spec compliance & testing](./06-testing.md) | CommonMark/GFM spec suites, perf regression tests |
| 07 | [Roadmap & decisions](./07-roadmap.md) | Phased plan, risks, competing libraries, **decision log (D1–D8)** |
| 08 | [Data model & public API](./08-model-and-api.md) | Options and measurements behind the private node table and the components/plugins/theme API |

Implementation detail is in [`phase-1/`](./phase-1/README.md), [`phase-2/`](./phase-2/README.md) and [`phase-2b/`](./phase-2b/README.md) (work breakdown, decisions, and design notes; Phase 2b runs before the rest of Phase 3). [`phase-3a/`](./phase-3a/README.md) holds the API refinement phase planned after Phase 3. Shared: the [testing harness](./testing-harness.md) and [benchmark protocol](./benchmark-protocol.md).

The benchmark scripts are in [`bench/`](../../bench) (a private workspace at the repo root).
