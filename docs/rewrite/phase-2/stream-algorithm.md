# Phase 2 · Stream algorithm

Implementation detail for the tail re-parse in [05](../05-streaming.md). This file adds what 05 leaves open: the exact state, what crosses the prefix/tail boundary, and when to fall back.

## State

```ts
interface StreamState {
  source: string;          // everything appended so far
  table: NodeTable;        // current table, covering `source`
  stableCount: number;     // blocks [0, stableCount) are closed
  prefixId: object;        // identity token of the stable prefix (see table-splicing.md)
}
```

`stableCount = blockCount - 1` after each parse: every block except the last is closed. Closed blocks are never re-parsed unless a full-reparse trigger fires.

## Why closed blocks stay closed

Appending text can only change the **last** top-level block, or start a new one. A block that has a successor cannot be reopened by later text, with these exceptions, which are the full-reparse triggers below:

- a link reference definition that other blocks use
- footnote definitions (numbering and the synthetic footnote section)

Cases that look like exceptions but aren't, because the affected block is still the last one when the text arrives:

| Input | Why it's safe |
|---|---|
| `a\n-` becomes a setext `<h2>`, then `a\n- b` becomes paragraph + list | `a` is the last block throughout, so it is re-parsed |
| A list followed by a blank line and an indented continuation | The list is the last block, and is re-parsed whole |
| Table rows arriving one by one | The table is the last block |
| A lazy continuation (`> a\nb`) | No new block is created, the quote is still last |

The randomized equivalence tests are the safety net for anything missed here ([testing-harness.md](./testing-harness.md#equivalence-harness)).

## Append

1. `source += chunk` (the scheduler has already coalesced chunks).
2. `offset = blockStart[stableCount]`, or `source.length` when there is no open block.
3. Check the **full-reparse triggers**. If one fires, go to *Full re-parse*.
4. `tail = parseFrom(source, offset, context, options)` ([table-splicing.md](./table-splicing.md#parsefrom)).
5. Splice `tail` onto the stable prefix to build a new table.
6. `stableCount = newTable.blockCount - 1`.

## Carried context

A parse of `source.slice(offset)` alone would render the tail differently from a full parse. `parseFrom` takes, and the splice step merges, everything the prefix contributes:

| Context | Source of the problem | Handling |
|---|---|---|
| Link reference definitions (`env.references`, part of `NodeTable.context`) | A tail `[x]` resolves against definitions in the prefix | Seed the tail's `env.references` from the prefix. The merged references go into the new table's `context`. |
| Heading slugs | Duplicate headings get `intro-1`, `intro-2` | Seed the slug counters from the prefix. `blockContext` of tail blocks then equals a full parse. |
| Footnote numbers and the footnote section | Numbering follows first reference in document order; the section is synthetic with an empty source range | The footnote section is **always open** while streaming ([P1-4](../phase-1/decisions.md)): it is rebuilt each flush. Numbers are seeded from the prefix. Definitions are a full-reparse trigger. |
| Parse options, plugins, preset, html mode | Part of `NodeTable.context` | Unchanged for the life of a stream. Changing them is `reset()`. |

`NodeTable.context` must stay **equal** between consecutive flushes when nothing relevant changed. If it changed spuriously (for example a re-ordered reference map serialized differently), `isSameBlock` would report every block as changed and every block would re-render.

## Full-reparse triggers

| Trigger | Detection | Why |
|---|---|---|
| New link reference definition appears in the tail | The tail's references are not a subset of the seeded ones | Earlier blocks may now contain links they rendered as text |
| Footnote definition appears in the tail | Footnote plugin enabled and the tail has a `footnote_open` | Numbering and section content change |
| `done()` | Always | Guarantees the final document is exactly `parse(source)` |
| `reset(source?)` | Always | New stream |

A full re-parse resets `stableCount` to `blockCount - 1`. It is rare in LLM output, so it need not be fast, but it must be correct.

## Open fenced code: fast path

Proposed ([P2-5](./decisions.md#p2-5-open-fence-fast-path)), pending device confirmation. On F2 fenced code is 4.6 to 13% of flush cost, but on a code-heavy stream it is 86 to 89% and the fast path cuts `streamCost` from 56.9× to 7.24× at 20-character chunks ([results](../02-benchmarks.md#code-heavy-fixture)).

A top-level, unindented fenced block that has not been closed would otherwise be re-parsed in full on every chunk, which is quadratic in the block. The fast path appends the chunk's text to the open `CodeBlock` node's text and extends `blockEnd`, with no re-parse. It applies only when all of the following hold, otherwise the normal tail re-parse runs:

- the open block is a top-level fenced `CodeBlock` (not inside a list or quote)
- the chunk contains no line that could close the fence (a line of at least as many fence characters, optionally indented up to 3 spaces)
- the previous parse ended inside the fence

It ships only if the equivalence harness covers it and shows it matches a full parse ([testing-harness](./testing-harness.md#targeted-cases)).

## Hiding unfinished syntax

Separate from the algorithm: see [smoothing.md](./smoothing.md). Smoothing changes only what the open block shows, never `source`.
