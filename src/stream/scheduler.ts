/**
 * Stream scheduler (phase 2, S2.1). React-free, pure JS.
 * Design: docs/rewrite/phase-2/hook-and-scheduler.md, decision P2-4.
 *
 * Sits on top of the stream core. The core parses on every `append`, so the
 * scheduler buffers chunks and hands the core one combined append per flush.
 *
 * Two strategies share one contract (P2-4; `useMarkdownStream` picks one per
 * platform, the scheduler itself is neutral):
 * - `done()` and `reset()` flush synchronously and cancel pending work;
 * - `suspend()` cancels pending work but keeps the buffered text, and
 *   `resume()` schedules it again (StrictMode: cleanup, then effect re-run);
 * - while suspended, `append` is dropped.
 *
 * `timeout`: a leading flush on the first append, then at most one flush per
 * `flushIntervalMs` window, with a trailing flush at the end of a window that
 * buffered anything. Not paused by a hidden browser tab.
 *
 * `raf`: appends are combined and flushed once per animation frame. The first
 * append after an idle period waits for the next frame (no leading flush).
 * Lowest latency on a device (about 15 ms against 34 to 43 ms for a 33 to
 * 50 ms window on the S25 FE) at about 1.5x the flush cost, and its rate
 * follows the display's refresh rate. A hidden web tab throttles animation
 * frames: a stream took 27 s instead of 7.8 s. Where `requestAnimationFrame`
 * is missing (Node, SSR) a 16 ms timeout stands in for the frame.
 */
import type { NodeTable } from '../model';
import { createMarkdownStreamCoreWith } from './createMarkdownStream';
import type { StreamOptions } from './types';

export type SchedulerStrategy = 'timeout' | 'raf';

/** Default `flushIntervalMs` for the `timeout` strategy: the web default (P2-4). */
export const DEFAULT_FLUSH_INTERVAL_MS = 16;

/** Stand-in frame length where `requestAnimationFrame` is missing. */
export const FRAME_MS = 16;

/** Timers the scheduler uses. Injectable so tests can drive a fake clock. */
export interface SchedulerClock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Optional. Without it the `raf` strategy falls back to `setTimeout(FRAME_MS)`. */
  requestFrame?(callback: () => void): unknown;
  cancelFrame?(handle: unknown): void;
}

export interface SchedulerOptions extends StreamOptions {
  /** Default 'timeout'. */
  readonly strategy?: SchedulerStrategy;
  /** Window of the `timeout` strategy. Default 16. */
  readonly flushIntervalMs?: number;
  /** Called with the new table after every flush, `done()` and `reset()`. */
  readonly onFlush: (table: NodeTable) => void;
  /** Default: the global timers and `requestAnimationFrame`, looked up at creation. */
  readonly clock?: SchedulerClock;
}

export interface MarkdownScheduler {
  /** Buffers `chunk` and schedules a flush per the strategy. */
  append(chunk: string): void;
  /** Flushes everything now, then a final full parse. Result equals `parse(source)`. */
  done(): NodeTable;
  /** Drops buffered text, starts a new stream with `source`. */
  reset(source?: string): NodeTable;
  /** Cancels pending work, keeps buffered text. Later `append`s are dropped. */
  suspend(): void;
  /** Undoes `suspend`; schedules a flush if text is buffered. */
  resume(): void;
  /** Flushes buffered text now, without the final full parse. No-op when empty. */
  flush(): void;
  readonly table: NodeTable;
  /** Text buffered and not yet flushed. */
  readonly pending: string;
  /** Number of flushes that appended text to the core (not done/reset). Test aid. */
  readonly flushCount: number;
}

/** The global timers, looked up now. */
export function defaultClock(): SchedulerClock {
  const g = globalThis as {
    requestAnimationFrame?: (cb: () => void) => unknown;
    cancelAnimationFrame?: (handle: never) => void;
  };
  const clock: SchedulerClock = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  if (
    typeof g.requestAnimationFrame === 'function' &&
    typeof g.cancelAnimationFrame === 'function'
  ) {
    const raf = g.requestAnimationFrame.bind(globalThis);
    const caf = g.cancelAnimationFrame.bind(globalThis);
    return {
      ...clock,
      requestFrame: (cb) => raf(cb),
      cancelFrame: (handle) => caf(handle as never),
    };
  }
  return clock;
}

export function createMarkdownScheduler(
  options: SchedulerOptions
): MarkdownScheduler {
  const {
    strategy = 'timeout',
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    onFlush,
    clock = defaultClock(),
    ...streamOptions
  } = options;

  // `smoothing` rides along in `streamOptions`. With it on, `append` returns a
  // view table (intermediate flushes); `done()` and `reset()` return the exact parse.
  const core = createMarkdownStreamCoreWith(streamOptions);
  let pending = '';
  let suspended = false;
  let flushCount = 0;
  /** Cancels whatever timer or frame is outstanding; null when idle. */
  let cancelOutstanding: (() => void) | null = null;

  const cancel = () => {
    cancelOutstanding?.();
    cancelOutstanding = null;
  };

  const flush = () => {
    if (pending.length === 0) return;
    const chunk = pending;
    pending = '';
    flushCount++;
    onFlush(core.append(chunk));
  };

  // --- timeout strategy -------------------------------------------------
  const startWindow = () => {
    const handle = clock.setTimeout(() => {
      cancelOutstanding = null;
      if (pending.length > 0) {
        flush();
        startWindow();
      }
    }, flushIntervalMs);
    cancelOutstanding = () => clock.clearTimeout(handle);
  };

  const scheduleTimeout = () => {
    if (cancelOutstanding) return; // inside a window: the trailing flush will take it
    flush(); // leading flush
    startWindow();
  };

  // --- raf strategy -----------------------------------------------------
  const scheduleFrame = () => {
    if (cancelOutstanding) return;
    const onFrame = () => {
      cancelOutstanding = null;
      flush();
    };
    if (clock.requestFrame && clock.cancelFrame) {
      const handle = clock.requestFrame(onFrame);
      const cancelFrame = clock.cancelFrame;
      cancelOutstanding = () => cancelFrame(handle);
    } else {
      const handle = clock.setTimeout(onFrame, FRAME_MS);
      cancelOutstanding = () => clock.clearTimeout(handle);
    }
  };

  const schedule = strategy === 'raf' ? scheduleFrame : scheduleTimeout;

  return {
    append(chunk) {
      if (suspended || chunk.length === 0) return;
      pending += chunk;
      schedule();
    },
    done() {
      cancel();
      const text = pending;
      pending = '';
      const table = text ? core.reset(core.source + text) : core.done();
      onFlush(table);
      return table;
    },
    reset(source) {
      cancel();
      pending = '';
      const table = core.reset(source);
      onFlush(table);
      return table;
    },
    suspend() {
      suspended = true;
      cancel();
    },
    resume() {
      suspended = false;
      if (pending.length > 0) schedule();
    },
    flush() {
      cancel();
      flush();
    },
    get table() {
      return core.table;
    },
    get pending() {
      return pending;
    },
    get flushCount() {
      return flushCount;
    },
  };
}
