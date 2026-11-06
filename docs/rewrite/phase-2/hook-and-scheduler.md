# Phase 2 · Hook & scheduler

How `useMarkdownStream` ([05 · API](../05-streaming.md#api), [04](../04-api.md#streaming)) is layered, and how updates are batched.

## Layers

```
useMarkdownStream  (React: state, effects, StrictMode, platform default)
       │
   scheduler       (buffers appends, decides when to flush; injectable clock)
       │
 stream core       (pure: append / reset / done, no timers, no React)
```

The two lower layers have no React import. That keeps them testable and benchmarkable in plain Node (`bench/stream.mjs` uses the core directly, `bench/scheduler.mjs` the scheduler) and keeps the main entry pure JS ([D2](../07-roadmap.md#decisions)). The hook imports only `Platform` from `react-native`, which `check:expo-go` allows.

## Core: `createMarkdownStreamCore(options)`

`src/stream/createMarkdownStream.ts`; types in `src/stream/types.ts`. Takes the parse options and `smoothing` ([smoothing](./smoothing.md)).

```ts
interface MarkdownStreamCore {
  append(chunk: string): NodeTable; // parses now: tail re-parse, spliced onto the closed prefix
  done(): NodeTable;                // full parse of the source: equals parse(source)
  reset(source?: string): NodeTable;
  readonly table: NodeTable;
  readonly source: string;
}
```

The core has no timers: **every `append` parses now**. With smoothing on, `append` returns the smoothed view and the core keeps its exact state; `done()` and `reset()` return the exact parse ([P2-6](./decisions.md#p2-6-hide-incomplete-semantics)). The scheduler therefore does the buffering: it hands the core one combined `append` per flush.

## Scheduler

`createMarkdownScheduler(options)` in `src/stream/scheduler.ts`, on top of the core. Policy: [P2-4](./decisions.md#p2-4-coalescing-policy). Results: [02-benchmarks](../02-benchmarks.md#phase-2-scheduler-s2).

```ts
interface MarkdownScheduler {
  append(chunk: string): void;   // buffers, schedules a flush
  done(): NodeTable;             // flush buffered text, then a full parse
  reset(source?: string): NodeTable;
  suspend(): void;               // cancel pending work, keep the buffer
  resume(): void;                // schedule the buffer again
  flush(): void;                 // flush the buffer now (no final parse)
  readonly table: NodeTable;
  readonly pending: string;
}
```

Options: the core's, plus `strategy` (`'timeout'` or `'raf'`), `flushIntervalMs` (default 16), `onFlush(table)` (called after every flush, `done()` and `reset()`) and `clock` (injectable).

- **`timeout`:** a leading flush on the first append, then at most one flush per `flushIntervalMs` window, and a trailing flush at the end of any window that buffered anything. Appends inside a window are combined. A hidden browser tab does not pause it.
- **`raf`:** appends are combined and flushed once per animation frame. No leading flush: the first append after an idle period waits for the next frame. Where `requestAnimationFrame` does not exist (Node, SSR, some test environments) a 16 ms timer stands in for the frame.
- **`done()` and `reset()`** flush synchronously and cancel pending work. `done()` with text still buffered parses everything once (it does not flush and then parse again).
- **`suspend()` and `resume()`:** `suspend()` cancels the pending timer or frame but keeps the buffered text, and drops later `append` calls; `resume()` schedules the buffer again if it is not empty. This is what lets StrictMode's cleanup-then-effect-again run neither lose nor duplicate text.
- **Clock and timer are injected** (`setTimeout`/`clearTimeout`, optional `requestFrame`/`cancelFrame`), so tests drive a fake clock and the scheduler never needs a global.
- **Adaptive coalescing: deferred.** Deriving the interval from recent flush cost did nothing in S0, and on the S25 FE the flush p90 stayed under a frame for every window up to 50 ms. Revisit if S5 shows otherwise.

## Hook

```ts
function useMarkdownStream(options?: UseMarkdownStreamOptions): {
  append(chunk: string): void;
  reset(source?: string): void;
  done(): void;
  document: MarkdownDocument;
};
```

- **Default schedule (P2-4):** on iOS and Android, `raf`. On web, `timeout` with a 16 ms window. If `flushIntervalMs` is given, `timeout` with that window on every platform. The choice is made once, at creation, from `Platform.OS` and the option.
- `append`, `reset` and `done` have **stable identity** for the life of the component, so they are safe in effect dependency lists.
- `document` is state: it changes once per flush. The initial value is an empty document, so `<Markdown document>` always has something to render.
- Options (`preset`, `html`, `plugins`, `smoothing`, `flushIntervalMs`) are **read at creation**. Changing them afterwards has no effect. In development a warning fires once if `plugins` (compared by content, shallowly), `preset` or `smoothing` change, so an inline `plugins={[a]}` that stays equal does not warn, as with `<Markdown>`. There is no `backend` option yet: the stream core is markdown-it only.
- **StrictMode:** effects run twice in development. The scheduler is created lazily once, in the first render, and the effect calls `resume()` on mount and `suspend()` on cleanup. Cleanup does not discard the buffered text: the re-run effect flushes it.
- **Unmount:** the cleanup suspends, which cancels the pending timer or frame. Later `append`, `reset` and `done` calls do nothing, without a warning.
- **Concurrent rendering:** the stream lives outside React state, and the hook publishes `document` with a state update. A render that is thrown away does not lose appended text.
- **`done()`** publishes the exact parse (`parse(source)`), also when smoothing is on; the documents published between flushes are the smoothed view.

## Usage (unchanged from 05)

```tsx
const stream = useMarkdownStream({ plugins });
useEffect(() => llm.onToken(stream.append), [stream.append]);
return <Markdown document={stream.document} components={components} />;
```

There is no separate streaming component: `<Markdown document>` already memoizes per block.

## Tests

See [testing-harness.md](./testing-harness.md#hook-and-scheduler-tests).
