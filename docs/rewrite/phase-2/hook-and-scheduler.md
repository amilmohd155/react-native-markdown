# Phase 2 · Hook & scheduler

How `useMarkdownStream` ([05 · API](../05-streaming.md#api), [04](../04-api.md#streaming)) is layered, and how updates are batched.

## Layers

```
useMarkdownStream  (React: state, effects, StrictMode, platform default)
       │
     pacer         (only with streamingConfig.smooth: backlog, releases per frame)
       │
   scheduler       (buffers appends, decides when to flush; injectable clock)
       │
 stream core       (pure: append / reset / done, no timers, no React)
```

The two lower layers have no React import. That keeps them testable and benchmarkable in plain Node (`bench/stream.mjs` uses the core directly, `bench/scheduler.mjs` the scheduler) and keeps the main entry pure JS ([D2](../07-roadmap.md#decisions)). The hook imports only `Platform` from `react-native`, which `check:expo-go` allows.

## Core: `createMarkdownStreamCore(options)`

`src/stream/createMarkdownStream.ts`; types in `src/stream/types.ts`. Takes the parse options and an internal `smoothing` (default `'none'`; the hook always passes `'hide-incomplete'`, [P2b-2](../phase-2b/decisions.md#p2b-2-hide-incomplete-is-always-on-the-smoothing-option-is-removed), [smoothing](./smoothing.md)).

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

`createMarkdownScheduler(options)` in `src/stream/scheduler.ts`, on top of the core. Policy: [P2-4](./decisions.md#p2-4-coalescing-policy). Results: [02-benchmarks](../../../bench/results/REPORT.md#phase-2-scheduler-s2).

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

## Pacer

`src/stream/pacer.ts`, used by the hook only with `streamingConfig.smooth` ([P2b-4](../phase-2b/decisions.md#p2b-4-smooth-paces-text-before-it-reaches-the-core)). Same contract as the scheduler (`append`, `done`, `reset`, `suspend`, `resume`), plus `released` and `backlog` for tests. Appends go into a backlog; the pacer owns the scheduler (inert clock) and flushes it once per release, so the core only sees a prefix of the source and `flushIntervalMs` has no effect.

- **Cadence:** one tick per frame (`raf`; the 16 ms timer on web and where frames are missing), only while text is releasable. Held text sleeps on one timer until the stall or the lag cap.
- **Amount:** each tick adds `ceil(backlog / framesLeft)` to a credit; `framesLeft` counts frames to the earliest of the next expected chunk (moving average of chunk gaps, 250 ms before the first gap, clamped to 16–1000 ms), the oldest unreleased text's arrival plus 1000 ms, and `done()` plus 200 ms. The first release after the view caught up is at least one word.
- **Bounds:** a slice ends after whitespace; a trailing line of only markers (`-`, `*`, `+`, `1.`, `1)`, `#`…`######`, `>`, `[ ]`, nested) is held. After 500 ms without input, or after `done()`, both rules are lifted. Text that would pass the 1000 ms cap goes out even mid-word (up to the next whitespace if there is one, never inside a surrogate pair).
- **`done()`:** with an empty backlog, the scheduler's `done()` at once; otherwise drains (text appended meanwhile joins), then the exact parse. **`reset()`** drops the backlog, timers and gap history. **`suspend()`** cancels the tick and keeps the backlog.

## Hook

```ts
function useMarkdownStream(options?: UseMarkdownStreamOptions): {
  append(chunk: string): void;
  reset(source?: string): void;
  done(): void;
  document: MarkdownDocument;
};
```

- **Default schedule (P2-4):** on iOS and Android, `raf`. On web, `timeout` with a 16 ms window. The window is internal: the hook has no `flushIntervalMs` option ([P2b-7](../phase-2b/decisions.md#p2b-7-flushintervalms-becomes-internal)); only the scheduler takes it. With `streamingConfig.smooth` the [pacer](#pacer) sets the cadence instead. The choice is made once, at creation, from `Platform.OS`.
- `append`, `reset` and `done` have **stable identity** for the life of the component, so they are safe in effect dependency lists.
- `document` is state: it changes once per flush. The initial value is an empty document, so `<Markdown document>` always has something to render.
- Options (`preset`, `html`, `plugins`, `streamingConfig`) are **read at creation**. Changing them afterwards has no effect. In development a warning fires once if `plugins` (compared by content, shallowly), `preset`, `streamingConfig.smooth` or `streamingConfig.animation` (by resolved duration) change, so an inline `plugins={[a]}` or `{ type: 'fade' }` that stays equal does not warn, as with `<Markdown>`. There is no `backend` option yet: the stream core is markdown-it only.
- **`onStreamingEnd`** is the exception: the latest function is called, without a warning. It fires once per stream from an effect after the `done()` document commits; documents carry the stream's epoch and end state for this and for the [fade](../phase-2b/decisions.md#p2b-5-animation-is-a-block-level-fade-none--fade) ([P2b-6](../phase-2b/decisions.md#p2b-6-one-streamingconfig-object-and-onstreamingend)).
- **StrictMode:** effects run twice in development. The scheduler is created lazily once, in the first render, and the effect calls `resume()` on mount and `suspend()` on cleanup. Cleanup does not discard the buffered text: the re-run effect flushes it.
- **Unmount:** the cleanup suspends, which cancels the pending timer or frame. Later `append`, `reset` and `done` calls do nothing, without a warning.
- **Concurrent rendering:** the stream lives outside React state, and the hook publishes `document` with a state update. A render that is thrown away does not lose appended text.
- **`done()`** publishes the exact parse (`parse(source)`); the documents published between flushes are the smoothed view, which the hook always uses.

## Usage (unchanged from 05)

```tsx
const stream = useMarkdownStream({ plugins });
useEffect(() => llm.onToken(stream.append), [stream.append]);
return <Markdown document={stream.document} components={components} />;
```

There is no separate streaming component: `<Markdown document>` already memoizes per block.

## Tests

See [testing-harness.md](../testing-harness.md#hook-and-scheduler-tests).
