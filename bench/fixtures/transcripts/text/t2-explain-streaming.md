## How incremental parsing works

When a model streams text, you receive *fragments*, not sentences. A naive renderer re-parses the whole string on every fragment, which is **O(n²)** over the length of the reply.

### The core idea

Split the document into top-level blocks. Everything before the last open block is *stable*: later input can never change it. Only the tail needs to be parsed again.

```ts
type Stream = {
  stable: Block[];
  tail: string;
};

function push(s: Stream, chunk: string): Stream {
  const text = s.tail + chunk;
  const { closed, rest } = splitAtLastOpenBlock(text);
  return { stable: [...s.stable, ...parse(closed)], tail: rest };
}
```

### Where it gets tricky

- A fenced code block stays open until the closing fence arrives
- A table row can turn a paragraph into a table retroactively
- A line like `Setext heading` is only a heading once the `---` line follows
- Lazy continuation can pull a line into an earlier blockquote

| Situation | Safe to freeze? | Why |
|:--|:-:|:--|
| Blank line after paragraph | yes | Paragraph is closed |
| Inside a code fence | no | Closing fence may follow |
| Last line of a list | no | Next line may continue it |

### Practical advice

Use `done()` at the end to run one final full parse, so any rare edge case that the fast path got wrong is corrected. See the [CommonMark spec](https://spec.commonmark.org/0.31.2/#blocks-and-inlines) for the exact rules.

Hope that helps! Tell me if you want a worked example with a table that arrives one cell at a time.
