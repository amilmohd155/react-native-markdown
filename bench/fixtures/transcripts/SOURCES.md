# F4c transcripts: sources

**These are NOT recorded LLM streams. They are synthetic placeholders.** No API key, local LLM tool, or existing recording was available when they were made (S0.2), so no real token stream or real timing was captured.

| File | Text | Chunking and timing |
|---|---|---|
| `t1-debug-flatlist.json`, `t2-explain-streaming.json`, `t3-setup-guide.json` | Markdown replies in assistant style, written by Claude (an LLM) for this repo. Source in `text/*.md`. | **Synthetic.** `make-synthetic.mjs` splits the text into BPE-like pseudo-tokens, groups 1 to 3 per event (70/22/8%), and draws inter-arrival gaps from a seeded PRNG (median about 25 ms, rare 150 to 400 ms stalls, 400 ms first-token latency). Deterministic and reproducible. |

Format: JSON array of `{ "t": <ms since stream start>, "text": <chunk> }`. Concatenating `text` gives the exact source file (the script checks this). Chunks split on UTF-16 code units, inside tokens. `stats.json` has per-file stats.

Size: about 4.2 KB total, below the ~10 KB F4c target.

## Do not use for the P2-1 bar

Chunk sizes (median 4, p90 8 to 9, max 16 UTF-16 units) and timing are modelled, not measured. Real APIs often batch more, and provider, model, and SSE framing all change the distribution. Treat as a harness smoke input only. To close S0.2 with evidence, replace with real captures.

## What a real capture needs

An API key for a provider (set in the environment, never committed), or a local model server. Record each SSE or token event as `{ t: performance.now() - start, text: delta }` for 3 markdown-heavy prompts, roughly 10 KB total, and note provider, model, date, and prompts here. Do not use downloaded scripts to generate them.
