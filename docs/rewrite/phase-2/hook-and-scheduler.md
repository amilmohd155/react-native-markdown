# Phase 2 · Hook & scheduler

How `useMarkdownStream` ([05 · API](../05-streaming.md#api), [04](../04-api.md#streaming)) is layered, and how updates are batched.

## Layers

```
useMarkdownStream  (React: state, effects, StrictMode)
       │
   scheduler       (coalesces appends, decides when to flush; injectable clock/raf)
       │
 createMarkdownStream  (pure: append / reset / done, no timers, no React)
```

The two lower layers have no React import. That keeps them testable and benchmarkable in plain Node (`bench/stream.mjs` uses the core directly) and keeps the main entry pure JS ([D2](../07-roadmap.md#decisions)).

## Core: `createMarkdownStream(options)`

```ts
interface MarkdownStream {
  append(chunk: string): void;   // buffers; no parse
  flush(): MarkdownDocument;     // tail re-parse of everything buffered; returns the new handle
  reset(source?: string): void;
  done(): MarkdownDocument;      // buffered text + final full parse
  readonly document: MarkdownDocument;
}
```

`append` only buffers; `flush` parses. This is what lets the scheduler coalesce.

## Scheduler

- **Default:** at most one `flush` per animation frame (`requestAnimationFrame`). Appends within a frame are combined.
- **Adaptive (if S0 says so, [P2-4](./decisions.md#p2-4-coalescing-policy)):** the parse cost of recent flushes sets a minimum interval, so a slow device or a large open block flushes less often instead of falling behind. The interval is capped so text never lags by more than a few frames.
- **`done()` and `reset()`** flush synchronously and cancel any pending frame.
- **Clock/raf are injected**, so tests use a fake clock. Where `requestAnimationFrame` is missing (SSR, some test environments) fall back to `setTimeout(16)`.

## Hook

```ts
function useMarkdownStream(options?: UseMarkdownStreamOptions): {
  append(chunk: string): void;
  reset(source?: string): void;
  done(): void;
  document: MarkdownDocument;
};
```

- `append`, `reset` and `done` have **stable identity** for the life of the component, so they are safe in effect dependency lists.
- `document` is state: it changes once per flush. The initial value is an empty document, so `<Markdown document>` always has something to render.
- Options (`preset`, `plugins`, `backend`, `smoothing`) are read at creation. Changing them after creation requires `reset()`. A dev warning fires if they change identity between renders, as `plugins` already does for `<Markdown>`.
- **StrictMode:** effects run twice in development. The core is created lazily once (a ref), and cleanup only cancels the pending frame; it does not discard the buffered text.
- **Unmount:** cancel the pending frame; later `append` calls are ignored.
- **Concurrent rendering:** the stream lives outside React state, and the hook publishes `document` with a state update. A render that is thrown away does not lose appended text.

## Usage (unchanged from 05)

```tsx
const stream = useMarkdownStream({ plugins });
useEffect(() => llm.onToken(stream.append), [stream.append]);
return <Markdown document={stream.document} components={components} />;
```

There is no separate streaming component: `<Markdown document>` already memoizes per block.

## Tests

See [testing-harness.md](./testing-harness.md#hook-and-scheduler-tests).
