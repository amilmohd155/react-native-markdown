# Phase 2 · Smoothing (`hide-incomplete`)

Partial syntax such as `**bold`, `[link](htt` or an unclosed `` ` `` looks broken while it streams in ([05 · Hiding unfinished syntax](../05-streaming.md#hiding-unfinished-syntax)). `smoothing: 'hide-incomplete'` improves how the **open block** looks. Default `'none'`.

## Principles

- Applies to the **open (last) block only**. Closed blocks are never touched.
- Changes the **view**, never `source`. The text stored and later given to `done()` is exactly what was appended, so the final document is unaffected.
- With `'none'`, output is byte-identical to a build without smoothing.
- `done()` turns smoothing off for the final document: the last render is the exact parse.

## Semantics

Decision: [P2-6](./decisions.md#p2-6-hide-incomplete-semantics). Proposed: **hide the dangling marker**, not auto-close it. Hiding shows less than the model has written, and never shows text that later turns out to be wrong; auto-closing can show formatting that later changes.

The smoother runs on the open block's source before it is parsed for display, and removes a trailing fragment that has not completed:

| Trailing text in the open block | Shown |
|---|---|
| `text **bold` / `*it` / `~~del` | `text` (marker and unclosed run removed) |
| `` `code `` (unclosed backtick) | text before the backtick |
| `[label` / `[label](http` / `[label](http://x` | `label` for a link in progress; the bare `[` is dropped |
| `![alt](` | nothing for the image |
| a lone trailing `*`, `_`, `~`, `` ` `` | removed |
| `<b` / `<br` (incomplete tag) | removed |

Not smoothed: an unclosed fenced code block (it already renders as an open code block), table rows in progress, list markers.

Details settled in S3 ([P2-6](./decisions.md#p2-6-hide-incomplete-semantics)):
- **No extra lag.** The visible tail is the true tail minus the dangling fragment, never a word less. When a marker completes the run appears formatted in one step; there is no intermediate state to flicker through.
- **Nested runs.** Cut at the earliest opener that is still unclosed at the end of the text. `**a *b` shows nothing of the run (cut at `**`); `*a **b` cuts at `*`; `**a** *b` cuts at the second `*`. The result is the longest prefix with no open construct.
- **Openers.** A `*`, `_` or `~~` opens a run only when the next character is not whitespace (and, for `_`, the previous one is not alphanumeric). So `2 * 3` and `snake_case` are untouched. A marker with no next character yet (a lone trailing `*`) is removed.
- **Whitespace.** The space before a cut stays: `text **bold` shows `text ` (the visible tail is the true tail).
- **Links and images.** `[label]` alone stays (a valid shortcut reference). `[label` and `[label](...` without `)` show `label`. An unclosed `![alt` or `![alt](` shows nothing for the image.
- **Tags.** `<` followed by a letter, `/`, `!` or `?` with no `>` yet is hidden, as is a lone trailing `<`; `a < b` is untouched. Limitation: a bare `x<y` in prose stays hidden until a `>` arrives or `done()` runs.
- **Tables.** A scope whose first line starts with `|` is treated as a table and left unchanged; rows without a leading pipe are not detected.
- **Scope.** The scanner starts at the open block's start, and restarts at each blank line and at each line that begins with a block marker (list item, quote, heading), because inline runs do not cross those.

## Implementation notes

- A small scanner over the last block's text, tracking open backticks, brackets, and emphasis runs; no regex backtracking. Linear in the open block.
- Runs after the tail re-parse is scheduled and before the parse of the open block: the open block is parsed from the smoothed text, closed blocks from the real text. For equivalence tests smoothing is off.

## Test cases

- Each row of the table above, split at every position.
- Nested and mixed cases (`**a [b](c`, `` `x **y ``).
- `done()` after any partial input equals `parse(source)`.
- Smoothing `'none'` equals the S2 output exactly.
