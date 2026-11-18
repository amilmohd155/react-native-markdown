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
| Open fenced code | ```` ``` ```` not yet closed | The fence block stays open. The fast path appends the chunk's text to the open code block with no re-parse, and falls back to the tail re-parse when a line could close the fence. Proposed, pending device confirmation ([P2-5](./phase-2/decisions.md#p2-5-open-fence-fast-path)) |
| Setext heading | `Title` followed by `===` | The previous paragraph stays open until the next block starts |
| Table | Rows still arriving | The table stays open, and only that block re-renders |

The safe default is that **only the last top-level block is ever re-parsed**. Everything earlier is frozen, unless one of the rare global cases fires.

### Hiding unfinished syntax

Partial syntax such as `**bold` or `[link](htt` looks broken while it streams in. The hook always hides the open block's unfinished syntax: trailing unclosed inline markers, and for a table everything until its delimiter row ends, then any partial trailing row ([smoothing](./phase-2/smoothing.md), [P2b-2](./phase-2b/decisions.md#p2b-2-hide-incomplete-is-always-on-the-smoothing-option-is-removed), [P2b-3](./phase-2b/decisions.md#p2b-3-tables-wait-for-header-and-delimiter-drop-a-partial-trailing-row)). There is no option. This changes the view only; `done()` is the exact parse.

### Pacing

`streamingConfig.smooth` (off by default) releases appended text a little per frame, so a burst of tokens grows the view steadily. A slice ends after whitespace, and a line that is only a list, heading or quote marker waits for its first word; a stall of 0.5 s releases what waits. The backlog drains over about the gap between chunks, never more than 1 s behind, and `done()` drains the rest within 0.2 s, then publishes the exact parse. The pacer sits in front of the core, which stays append-only, so what is shown is always the view of a prefix of the source ([P2b-4](./phase-2b/decisions.md#p2b-4-smooth-paces-text-before-it-reaches-the-core), [rules](./phase-2/hook-and-scheduler.md#pacer)).

### Animation and end signal

- `streamingConfig.animation: 'fade'` (or `{ type: 'fade', duration }`, 200 ms by default) fades in, once, each block that first appears while the stream is live. Blocks shown before, blocks a list mounts later on scroll, and everything after `done()` do not fade; Reduce Motion turns it off. `<Markdown document>`, `scroll`, `virtualize` and `useMarkdownBlocks()` apply it with no extra prop. Per-word fade and a gradient are not planned ([P2b-5](./phase-2b/decisions.md#p2b-5-animation-is-a-block-level-fade-none--fade)).
- `onStreamingEnd` fires once per stream, from an effect after the exact `done()` document is committed (with `smooth`, after the drain). `reset()` starts a new stream; unmount never fires it ([P2b-6](./phase-2b/decisions.md#p2b-6-one-streamingconfig-object-and-onstreamingend)).
- While a stream runs, the footnote section is not rendered and footnote references are plain text (no `onFootnotePress`, no jump); `done()` shows both, and `reset()` hides them again. A stream that never calls `done()` never shows footnotes ([P3-12](./phase-3/decisions.md#p3-12-the-footnote-section-and-its-links-wait-for-done)).

## Rendering

- Frozen blocks keep their source text and context, so `isSameBlock` lets their `memo(Block)` bail out (P1-9).
- Only the last block re-renders.
- Updates are batched, and tokens that arrive between two flushes are combined into one append ([P2-4](./phase-2/decisions.md#p2-4-coalescing-policy)). The default depends on the platform: on iOS and Android one flush per animation frame; on web a 16 ms window, with a leading flush on the first chunk, at most one flush per window, and a trailing flush so the last chunk always lands (a hidden browser tab throttles animation frames, which stalled a stream in the web run). The window is internal, not an option ([P2b-7](./phase-2b/decisions.md#p2b-7-flushintervalms-becomes-internal)); with `streamingConfig.smooth` the pacer sets the cadence. Per-frame batching does not reduce the parse count at one chunk per frame; it was chosen on native for its latency (about 15 ms against 34 to 43 ms for a 33 to 50 ms window on the S25 FE), at about 1.5× the flush cost ([results](../../bench/results/REPORT.md#phase-2-scheduler-s2)).

## API

```ts
function useMarkdownStream(options?: {
  preset?: 'gfm' | 'commonmark';
  html?: HtmlMode;
  plugins?: MarkdownPlugin[];
  backend?: ParserBackend;      // not implemented yet: the stream core is markdown-it only
  streamingConfig?: {
    smooth?: boolean;                                                   // P2b-4
    animation?: 'none' | 'fade' | { type: 'fade'; duration?: number }; // P2b-5
  };
  onStreamingEnd?: () => void;  // P2b-6: the latest one is called
}): {
  append(chunk: string): void;
  reset(source?: string): void;
  done(): void;                 // final full re-parse for exactness
  document: MarkdownDocument;   // new opaque handle per flush, sharing the unchanged prefix of the node table
};
```

Options are read when the hook is created, except `onStreamingEnd`.

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
