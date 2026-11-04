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
           BlockList  (plain View, or FlashList when `virtualize`)
                     │
     memo(Block) per top-level block (skipped when its source and context are unchanged)
                     │
     Inline content → ONE <Text> per block: raw strings, nested <Text> only for styled spans
                     │
     Public API: element components with semantic props, plugins, theme tokens
```

In the benchmark, markdown-it parses 7–15× faster than the current parser (micromark). Block-level memoization keeps streaming cost close to the size of the newest chunk, not the whole document. The flat node table keeps about 5.5× less in memory than today's mdast tree.

**Platforms:** iOS, Android and web (react-native-web). The default package works in Expo Go (pure JS). The native parser is an opt-in add-on.

The rewrite is allowed to break the API, and does. Users work with **element components with semantic props** (`Heading { level }`, `Link { href }`), **plugins** that bundle syntax, element and theme, and **theme tokens**. The internal node format is private, so the JS and native backends can share it and it can change without breaking anyone. See [08](./08-model-and-api.md).

## Documents

| # | Document | What it covers |
|---|---|---|
| 01 | [Current state](./01-current-state.md) | Review of v0.8.5: what works, bugs, structural limits |
| 02 | [Benchmarks](./02-benchmarks.md) | Parser measurements, method, how to reproduce |
| 03 | [Architecture](./03-architecture.md) | The proposed pipeline, layer by layer |
| 04 | [Public API](./04-api.md) | `<Markdown>` props, element catalog, theme, plugins, migration |
| 05 | [Streaming](./05-streaming.md) | Incremental parsing and rendering for LLM/chat output |
| 06 | [Spec compliance & testing](./06-testing.md) | CommonMark/GFM spec suites, perf regression tests |
| 07 | [Roadmap & decisions](./07-roadmap.md) | Phased plan, risks, competing libraries, **decision log (D1–D8)** |
| 08 | [Data model & public API](./08-model-and-api.md) | Options and measurements behind the private node table and the components/plugins/tokens API |

Implementation detail for Phase 1 (work breakdown, token mapping, element props, theme resolution, test harness, device benchmark protocol, implementation decisions) is in [`phase-1/`](./phase-1/README.md).

The benchmark scripts are in [`bench/`](../../bench) (a private workspace at the repo root).
