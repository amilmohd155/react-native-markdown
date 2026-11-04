# 05 · Streaming

LLM and chat output arrives as many small appends. A naive design re-parses and re-renders the whole buffer each time, which is O(n²) over a message. The [benchmark](./02-benchmarks.md) shows 4.6 s of parse work for one 8 KB message on the current parser with no JIT.

## Goal

Cost per append should be proportional to the **last block**, not the whole document.

## Algorithm: tail re-parse

Keep state `{ source, blocks, stableCount }`, where `blocks[0 .. stableCount)` are closed blocks that later text cannot change.

On `append(chunk)`:

1. `source += chunk`. Chunks arriving within one frame are coalesced first.
2. Let `offset = blocks[stableCount]?.start ?? source.length`. This is the start of the first block that isn't closed yet.
3. Re-parse `source.slice(offset)` → `tail`.
4. `blocks = blocks.slice(0, stableCount).concat(rebase(tail, offset))`.
5. Mark as stable every tail block except the last. Then check the conditions below.

### When to fall back to a full re-parse

A block that looks closed can still change, or affect earlier blocks, in a few cases:

| Case | Example | Handling |
|---|---|---|
| New link reference definition | `[x]: http://…` arrives after `[x]` was used | Full re-parse, which is rare in LLM output |
| List or blockquote continuation | A list item followed by a blank line, then more items | Treat a top-level `list`/`blockquote` as open until a non-matching block starts |
| Open fenced code | ```` ``` ```` not yet closed | The fence block stays open, and its content takes a fast path (append text only, no re-parse) |
| Setext heading | `Title` followed by `===` | The previous paragraph stays open until the next block starts |
| Table | Rows still arriving | The table stays open, and only that block re-renders |

The safe default is that **only the last top-level block is ever re-parsed**. Everything earlier is frozen, unless one of the rare global cases fires.

### Hiding unfinished syntax

Partial syntax such as `**bold` or `[link](htt` looks broken while it streams in. Optional `smoothing: 'hide-incomplete'` buffers trailing unclosed inline markers. Default off.

## Rendering

- Frozen blocks keep their source text and context, so `isSameBlock` lets their `memo(Block)` bail out (P1-9).
- Only the last block re-renders.
- Updates are batched to **at most one per animation frame** (`requestAnimationFrame`). Tokens that arrive within a frame are combined into one append.

## API

```ts
function useMarkdownStream(options?: {
  preset?: 'gfm' | 'commonmark';
  plugins?: MarkdownPlugin[];
  backend?: ParserBackend;
  smoothing?: 'none' | 'hide-incomplete';
}): {
  append(chunk: string): void;
  reset(source?: string): void;
  done(): void;                 // final full re-parse for exactness
  document: MarkdownDocument;   // new opaque handle per frame, sharing the unchanged prefix of the node table
};
```

```tsx
const stream = useMarkdownStream({ plugins });
useEffect(() => llm.onToken(stream.append), []);
return <Markdown document={stream.document} components={components} />;
```

There is no separate streaming component. `<Markdown document>` already memoizes per block, so a streamed document renders through the same path as a static one.

`done()` runs one full parse, so the final rendering matches a non-streamed parse exactly, even if a tail heuristic was approximate.

## Expected cost

For a message of n characters arriving in k chunks, with a last block of size b:

- Naive: about k · O(n) parse work, plus k full re-renders.
- Tail re-parse: about k · O(b) parse work, plus k single-block re-renders, plus one O(n) parse at `done()`.

In typical LLM output, paragraphs are a few hundred characters, so b ≪ n. Phase 2 must confirm this with a device measurement.
