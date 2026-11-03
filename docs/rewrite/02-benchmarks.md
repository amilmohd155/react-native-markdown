# 02 · Benchmarks

## Question

How much of the cost is the parser, and what are the realistic alternatives on a JS engine with no JIT, like Hermes?

## Method

- Script: [`bench/bench.mjs`](./bench/bench.mjs), with dependency versions pinned in [`bench/package.json`](./bench/package.json).
- Fixture: markdown-it's README plus a GFM snippet (table, task list, strikethrough, autolink literal), repeated N times.
- Each parser gets 3 warm-up runs, then the median of 11 timed runs.
- Run on Node 22 in a Linux cloud container. `--jitless` turns off V8's optimizing JIT, which is a **rough proxy** for Hermes. Hermes runs precompiled bytecode with no JIT.
- GFM is enabled wherever the parser supports it. commonmark.js has no GFM.

> ⚠️ These are not device measurements. Read the ratios between parsers, not the absolute times. Phase 1 of the [roadmap](./07-roadmap.md) includes re-running these on Hermes on a real mid-range Android device.

## Results: parse only

| Parser | 8 KB | 97 KB | 97 KB, `--jitless` |
|---|---|---|---|
| **micromark + mdast** (current) | 15.2 ms | 207 ms | **607 ms** |
| markdown-it 15 (tokens) | 2.5 ms | 14 ms | 73 ms |
| marked 18 (lexer, GFM) | 1.8 ms | 10 ms | 43 ms |
| commonmark.js 0.31 (no GFM) | 1.0 ms | 6 ms | 35 ms |

## Results: naive streaming

Re-parsing the full 8 KB buffer at each of 200 append steps, as a chat UI does today:

| Parser | JIT | `--jitless` |
|---|---|---|
| micromark + mdast | 1,172 ms | **4,608 ms** |
| marked | 88 ms | 368 ms |

## Takeaways

1. **The parser alone rules out the current design for long or streamed content.** At about 600 ms for 97 KB without a JIT, micromark drops many frames before React does any work.
2. **markdown-it and marked are both an order of magnitude faster.** markdown-it is preferred because it claims full CommonMark compliance and has a mature plugin system for GFM extras. See [03](./03-architecture.md#1-parser-layer).
3. **Even a fast parser loses if every streamed chunk re-parses the whole document.** It's still O(n²) over a message. Streaming needs to re-parse only the tail. See [05](./05-streaming.md).
4. **Native parsers exist and are faster still.** md4c and cmark-gfm are C, called over JSI. `react-native-nitro-markdown` reports about 38–57 ms p50 for a 328 KB document on Pixel 7 / iPhone simulators. Those are the project's own numbers on a different fixture, so they aren't directly comparable.

## Reproduce

```bash
cd docs/rewrite/bench
npm install
npm run bench          # 8 KB + streaming simulation
npm run bench:large    # ~97 KB
npm run bench:jitless  # ~97 KB, no JIT
```

## Not measured yet (to do in phase 1)

- Render cost (element creation + Fabric commit) for the current renderer vs. the proposed one.
- Hermes on a device: a low-end Android (Snapdragon 6xx class) and a recent iPhone.
- Memory: AST size per KB of input.
