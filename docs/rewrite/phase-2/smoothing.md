# Phase 2 · Smoothing (`hide-incomplete`)

Partial syntax such as `**bold`, `[link](htt` or an unclosed `` ` `` looks broken while it streams in ([05 · Hiding unfinished syntax](../05-streaming.md#hiding-unfinished-syntax)). `hide-incomplete` improves how the **open block** looks. `useMarkdownStream` always uses it and has no option ([P2b-2](../phase-2b/decisions.md#p2b-2-hide-incomplete-is-always-on-the-smoothing-option-is-removed)). The stream core keeps an internal `smoothing` option, default `'none'`, for tests and benches.

## Principles

- Applies to the **open (last) block only**. Closed blocks are never touched.
- Changes the **view**, never `source`. The text stored and later given to `done()` is exactly what was appended, so the final document is unaffected.
- With the core's `'none'`, output is byte-identical to a build without smoothing.
- `done()` and `reset()` return the exact parse.

## Semantics

Decision: [P2-6](./decisions.md#p2-6-hide-incomplete-semantics). **Hide the dangling marker**, do not auto-close it. Hiding shows less than the model has written, and never shows text that later turns out to be wrong; auto-closing can show formatting that later changes.

The smoother runs on the open block's source before it is parsed for display, and removes a trailing fragment that has not completed:

| Trailing text in the open block | Shown |
|---|---|
| `text **bold` / `*it` / `~~del` | `text` (marker and unclosed run removed) |
| `` `code `` (unclosed backtick) | text before the backtick |
| `[label` / `[label](http` / `[label](http://x` | `label` for a link in progress; the bare `[` is dropped |
| `![alt](` | nothing for the image |
| a lone trailing `*`, `_`, `~`, `` ` `` | removed |
| `<b` / `<br` (incomplete tag) | removed |
| a table without its finished delimiter row | nothing for the table ([Tables](#tables)) |
| a table row in progress | the table up to its last finished row |

Not smoothed: an unclosed fenced code block (it already renders as an open code block), list markers.

- **No extra lag.** The visible tail is the true tail minus the dangling fragment, never a word less. When a marker completes the run appears formatted in one step.
- **Nested runs.** Cut at the earliest opener that is still unclosed at the end of the text. `**a *b` shows nothing of the run (cut at `**`); `*a **b` cuts at `*`; `**a** *b` cuts at the second `*`.
- **Openers.** A `*`, `_` or `~~` opens a run only when the next character is not whitespace (and, for `_`, the previous one is not alphanumeric). So `2 * 3` and `snake_case` are untouched. A lone trailing marker is removed.
- **Whitespace.** The space before a cut stays: `text **bold` shows `text `.
- **Links and images.** `[label]` alone stays (a valid shortcut reference). `[label` and `[label](...` without `)` show `label`. An unclosed `![alt` or `![alt](` shows nothing for the image.
- **Tags.** `<` followed by a letter, `/`, `!` or `?` with no `>` yet is hidden, as is a lone trailing `<`; `a < b` is untouched. Limitation: a bare `x<y` in prose stays hidden until a `>` arrives or `done()` runs.
- **Scope.** The scanner starts at the open block's start, and restarts at each blank line and at each line that begins with a block marker (list item, quote, heading), because inline runs do not cross those.

## Tables

Decision: [P2b-3](../phase-2b/decisions.md#p2b-3-tables-wait-for-header-and-delimiter-drop-a-partial-trailing-row). A header streams as a paragraph of literal pipes until its delimiter row arrives, and a partial row renders padded with empty cells. So, for a line that starts with `|` (after any list or quote marker):

- **Header.** It shows nothing until the next line is its delimiter row *and that row has ended with a newline*. Before the newline the delimiter can still change, and the header alone parses as a paragraph of pipes. A delimiter row is cells of `:?-+:?` split by `|` with exactly the header's column count, as in markdown-it; with any other count the lines are a paragraph and show as one.
- **Rows.** Once the table exists it shows up to its last `\n`: a row appears when its line ends. Cells are not smoothed (a finished row is final).
- **After a paragraph.** A table can interrupt a paragraph, so any such line in a paragraph waits for the next line. A prose line that starts with `|` therefore shows one line late.
- **Where.** Tables are tracked over a run of lines that blank lines, fences, list items and headings end; quote markers do not, so a quoted table works.
- **Limitation.** Rows that do not start with `|` (`a | b`) are not detected and stream as parsed.

## Implementation notes

- One forward pass over the open block's text (`src/stream/smoothing.ts`), tracking open backticks, brackets, emphasis runs and the table state; no regex backtracking. Linear in the open block.
- The open block is parsed from the smoothed text, closed blocks from the real text (`smoothed()` in `createMarkdownStream.ts`). The view falls back to the exact table when the smoothed parse would change document context.

## Test cases

Every row above split at every position, tables streamed one character at a time against an oracle, nested cases, `done()` equal to `parse(source)`, and the core's `'none'` equal to the S2 output ([harness](../testing-harness.md#hook-and-scheduler-tests)).
