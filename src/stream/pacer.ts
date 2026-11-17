/**
 * Stream pacer (phase 2b, P2b-4: `streamingConfig.smooth`). React-free, pure JS.
 * Design: docs/rewrite/phase-2b/decisions.md#p2b-4-smooth-paces-text-before-it-reaches-the-core,
 * docs/rewrite/phase-2/hook-and-scheduler.md#pacer
 *
 * Sits IN FRONT of the scheduler and core. Appended text goes into a backlog;
 * once per frame the pacer releases a slice of it to the scheduler and flushes
 * at once. The core only ever sees appends of a prefix of the source, so tail
 * re-parse, splicing, hide-incomplete and the equivalence guarantee are
 * unchanged: what is shown is the core's view of exactly the released prefix.
 *
 * Cadence: the pacer owns it. The inner scheduler gets an inert clock and is
 * flushed synchronously after each release, so it never schedules anything
 * itself.
 *
 * Per frame:
 * - Amount: the first release after the view caught up is at least one word
 *   (no added latency for a trickle). Then `ceil(backlog / framesLeft)` is added to a credit, where
 *   `framesLeft` counts frames to the deadline: the next chunk's expected
 *   arrival (moving average of chunk gaps), the lag cap of the oldest
 *   unreleased text, and after `done()` the drain deadline. A burst is spread,
 *   a trickle goes out as it arrives.
 * - Word bounds: the slice ends after whitespace, never inside a word; a line
 *   that is only list, heading or quote markers (`- `, `1. `, `## `, `> `)
 *   waits for its first word. The rule is lifted when input stalls
 *   (`STALL_MS`) and after `done()`.
 * - Lag cap: text older than `MAX_LAG_MS` is released even mid-word (a long
 *   URL or text without spaces), so the guarantee holds while input continues.
 */
import type { NodeTable } from '../model';
import {
  createMarkdownScheduler,
  defaultClock,
  FRAME_MS,
  type FlushKind,
  type SchedulerClock,
  type SchedulerStrategy,
} from './scheduler';
import type { StreamOptions } from './types';

// --- constants (P2b-4) -------------------------------------------------

/** The oldest unreleased character is never more than this behind its arrival. */
const MAX_LAG_MS = 1000;
/** With no new input for this long, a held word or marker is released. */
const STALL_MS = 500;
/** `done()` drains what is left within this long, paced, then publishes the exact parse. */
const DONE_DRAIN_MS = 200;
/**
 * Expected gap before the first measured one: a burst with no history spreads
 * over about 15 frames (a 2 KB burst lands in about 140-character slices).
 */
const INITIAL_GAP_MS = 250;
/** Weight of the newest gap in the moving average: follows a rate change within a few chunks. */
const GAP_SMOOTHING = 0.3;
/**
 * Appends closer together than this count as one chunk (a network read split
 * into tokens in one task). Half a frame: a 120 Hz trickle still counts.
 */
const MIN_GAP_MS = FRAME_MS / 2;
/** Longest tail of the last released line kept for the marker check; a marker line is short. */
const MAX_LINE_HEAD = 64;

/**
 * A line holding only block markers and the whitespace after them: list
 * bullets and ordinals, heading hashes, quote markers, a task box, nested.
 */
const MARKER_LINE =
  /^[ \t]*(?:(?:[-*+>]|\d{1,9}[.)]|#{1,6}|\[[ xX]\])[ \t]+)+$/;

const isSpace = (code: number) =>
  code === 32 || code === 9 || code === 10 || code === 13;

/** Timers and frames the pacer uses, plus a clock. Injectable for tests. */
export interface PacerClock extends SchedulerClock {
  /** Milliseconds, monotonic enough for gaps. Default `Date.now()` (faked by jest timers). */
  now?(): number;
}

export interface PacerOptions extends StreamOptions {
  /**
   * The frame source: `raf` uses `requestFrame` when the clock has it, else a
   * 16 ms timer; `timeout` (web, where a hidden tab throttles frames) always
   * uses the 16 ms timer. Default `raf`.
   */
  readonly strategy?: SchedulerStrategy;
  /** Called with the new table after every release, `done()` and `reset()` (the kind says which). */
  readonly onFlush: (table: NodeTable, kind: FlushKind) => void;
  /** Default: the global timers, `requestAnimationFrame` and `Date.now`. */
  readonly clock?: PacerClock;
}

export interface MarkdownPacer {
  /** Adds text to the backlog. Dropped while suspended. */
  append(chunk: string): void;
  /**
   * Ends the stream: with an empty backlog publishes the exact parse now,
   * otherwise drains the backlog within `DONE_DRAIN_MS`, then publishes it.
   * Text appended during the drain joins it.
   */
  done(): void;
  /** Drops the backlog and pending work, starts a new stream with `source`. */
  reset(source?: string): void;
  /** Cancels pending work, keeps the backlog. Later `append`s are dropped. */
  suspend(): void;
  /** Undoes `suspend`; resumes releasing if text is waiting. */
  resume(): void;
  /** The table last published. */
  readonly table: NodeTable;
  /** The source the core has seen: the released prefix. */
  readonly released: string;
  /** Text appended and not yet released. */
  readonly backlog: string;
}

/** Arrival of a chunk: it ends at `end` in the appended text, at time `at`. */
interface Arrival {
  readonly end: number;
  readonly at: number;
}

/** A scheduler clock that never fires: the pacer flushes the scheduler itself. */
const inertClock: SchedulerClock = {
  setTimeout: () => null,
  clearTimeout: () => {},
};

/**
 * End (exclusive) of the longest word-bounded prefix of `text` within `upTo`:
 * after the last whitespace, and before a trailing marker-only line. `head` is
 * the released part of the current line.
 */
function wordCut(text: string, upTo: number, head: string): number {
  let cut = upTo;
  while (cut > 0 && !isSpace(text.charCodeAt(cut - 1))) cut--;
  if (cut === 0 || text.charCodeAt(cut - 1) === 10) return cut;
  const nl = text.lastIndexOf('\n', cut - 1);
  const line = nl === -1 ? head + text.slice(0, cut) : text.slice(nl + 1, cut);
  return MARKER_LINE.test(line) ? nl + 1 : cut;
}

/** End of the first word-bounded slice of `text` (0 when there is none yet). */
function firstWordCut(text: string, head: string): number {
  for (let i = 0; i < text.length; i++) {
    if (isSpace(text.charCodeAt(i)) && wordCut(text, i + 1, head) === i + 1) {
      return i + 1;
    }
  }
  return 0;
}

/** End of a forced slice reaching at least `min`: the next word end, else `min` (never inside a surrogate pair). */
function forcedCut(text: string, min: number): number {
  for (let i = min - 1; i < text.length; i++) {
    if (isSpace(text.charCodeAt(i))) return i + 1;
  }
  const c = text.charCodeAt(min - 1);
  return c >= 0xd800 && c <= 0xdbff && min < text.length ? min + 1 : min;
}

export function createMarkdownPacer(options: PacerOptions): MarkdownPacer {
  const { strategy = 'raf', onFlush, clock: given, ...streamOptions } = options;
  const clock: PacerClock = given ?? defaultClock();
  // Looked up per call: jest's fake timers replace `Date.now` after creation.
  const now = (): number => (clock.now ? clock.now() : Date.now());
  // `raf` without frames, and `timeout`, tick on a 16 ms timer.
  const frames =
    strategy === 'raf' && clock.requestFrame && clock.cancelFrame
      ? { request: clock.requestFrame, cancel: clock.cancelFrame }
      : null;

  const scheduler = createMarkdownScheduler({
    ...streamOptions,
    strategy: 'raf',
    clock: inertClock,
    onFlush,
  });

  let backlog = '';
  /** Characters appended and released since the last reset (arrival offsets). */
  let appended = 0;
  let releasedCount = 0;
  let arrivals: Arrival[] = [];
  /** Characters owed by the rate but not yet released (held at a word bound). */
  let credit = 0;
  /** Moving average of chunk gaps; null until the first gap. */
  let gapAverage: number | null = null;
  /** Start of the latest chunk (appends within `MIN_GAP_MS` belong to it). */
  let chunkAt = 0;
  let lastInputAt = 0;
  /** Set by `done()` while the backlog drains. */
  let doneAt: number | null = null;
  /** Released text after the last line break (capped), for the marker check. */
  let lineHead = '';
  /** Set when text arrives on an empty backlog; cleared by the next release. */
  let leading = false;
  let suspended = false;
  /** Cancels the outstanding frame or timer; null when idle. */
  let cancelWake: (() => void) | null = null;
  /** True when the outstanding wake is a frame (not the held-text timer). */
  let wakeIsFrame = false;

  const cancel = () => {
    cancelWake?.();
    cancelWake = null;
  };

  const requestFrame = () => {
    if (cancelWake && wakeIsFrame) return;
    cancel();
    wakeIsFrame = true;
    const run = () => {
      cancelWake = null;
      tick();
    };
    if (frames) {
      const handle = frames.request(run);
      const cancelFrame = frames.cancel;
      cancelWake = () => cancelFrame(handle);
    } else {
      const handle = clock.setTimeout(run, FRAME_MS);
      cancelWake = () => clock.clearTimeout(handle);
    }
  };

  /** Wakes at `at` (absolute) for held text: a stall or the lag cap. */
  const requestTimer = (at: number) => {
    cancel();
    wakeIsFrame = false;
    const handle = clock.setTimeout(
      () => {
        cancelWake = null;
        tick();
      },
      Math.max(0, at - now())
    );
    cancelWake = () => clock.clearTimeout(handle);
  };

  /** Arrival time of the oldest unreleased character. */
  const oldestAt = (): number => {
    while (arrivals.length > 0 && arrivals[0]!.end <= releasedCount) {
      arrivals.shift();
    }
    return arrivals.length > 0 ? arrivals[0]!.at : now();
  };

  /** Characters (from the backlog start) that would exceed the lag cap by the next frame. */
  const overdue = (t: number): number => {
    let end = releasedCount;
    for (const a of arrivals) {
      if (a.at + MAX_LAG_MS - FRAME_MS > t) break;
      end = a.end;
    }
    return Math.max(0, end - releasedCount);
  };

  const release = (count: number) => {
    const slice = backlog.slice(0, count);
    backlog = backlog.slice(count);
    releasedCount += count;
    credit = Math.max(0, credit - count);
    const nl = slice.lastIndexOf('\n');
    const head = nl === -1 ? lineHead + slice : slice.slice(nl + 1);
    lineHead = head.length > MAX_LINE_HEAD ? '\u0000' : head;
    scheduler.append(slice);
  };

  const finish = () => {
    doneAt = null;
    credit = 0;
    scheduler.done();
  };

  function tick() {
    if (suspended) return;
    if (backlog.length === 0) {
      if (doneAt !== null) finish();
      return;
    }
    const t = now();
    // No more input expected (ended or stalled): words and markers may end a slice.
    const free = doneAt !== null || t - lastInputAt >= STALL_MS;
    const window = Math.min(
      Math.max(gapAverage ?? INITIAL_GAP_MS, FRAME_MS),
      MAX_LAG_MS
    );
    let deadline = Math.min(chunkAt + window, oldestAt() + MAX_LAG_MS);
    if (doneAt !== null) deadline = Math.min(deadline, doneAt + DONE_DRAIN_MS);
    const framesLeft = Math.max(1, Math.floor((deadline - t) / FRAME_MS));
    credit = Math.min(
      backlog.length,
      credit + Math.ceil(backlog.length / framesLeft)
    );
    let cut =
      free && credit === backlog.length
        ? credit
        : wordCut(backlog, credit, lineHead);
    if (leading && cut === 0) cut = firstWordCut(backlog, lineHead);
    const must = overdue(t);
    if (must > cut) cut = forcedCut(backlog, must);
    if (cut > 0) {
      leading = false;
      release(cut);
    }

    if (backlog.length === 0) {
      credit = 0;
      if (doneAt !== null) finish();
      else scheduler.flush();
      return;
    }
    if (cut > 0) scheduler.flush();
    if (free || wordCut(backlog, backlog.length, lineHead) > 0) {
      requestFrame();
    } else {
      // Only held text is left: sleep until the stall or the lag cap.
      credit = 0;
      requestTimer(
        Math.min(lastInputAt + STALL_MS, oldestAt() + MAX_LAG_MS - FRAME_MS)
      );
    }
  }

  return {
    append(chunk) {
      if (suspended || chunk.length === 0) return;
      const t = now();
      // The first release after the view caught up is at least one word, so
      // a new chunk is never slowed down by the rate (time to first word).
      if (backlog.length === 0) leading = true;
      if (gapAverage === null && appended === 0) {
        chunkAt = t;
      } else if (t - chunkAt >= MIN_GAP_MS) {
        const gap = Math.min(t - chunkAt, MAX_LAG_MS);
        gapAverage =
          gapAverage === null
            ? gap
            : gapAverage + GAP_SMOOTHING * (gap - gapAverage);
        chunkAt = t;
      }
      lastInputAt = t;
      backlog += chunk;
      appended += chunk.length;
      arrivals.push({ end: appended, at: t });
      requestFrame();
    },
    done() {
      if (suspended) return;
      if (backlog.length === 0) {
        cancel();
        finish();
        return;
      }
      if (doneAt === null) doneAt = now();
      requestFrame();
    },
    reset(source = '') {
      cancel();
      backlog = '';
      appended = 0;
      releasedCount = 0;
      arrivals = [];
      credit = 0;
      gapAverage = null;
      chunkAt = 0;
      doneAt = null;
      leading = false;
      const nl = source.lastIndexOf('\n');
      const head = source.slice(nl + 1);
      lineHead = head.length > MAX_LINE_HEAD ? '\u0000' : head;
      scheduler.reset(source);
    },
    suspend() {
      suspended = true;
      cancel();
      scheduler.suspend();
    },
    resume() {
      suspended = false;
      scheduler.resume();
      if (backlog.length > 0) requestFrame();
    },
    get table() {
      return scheduler.table;
    },
    get released() {
      return scheduler.table.source;
    },
    get backlog() {
      return backlog;
    },
  };
}
