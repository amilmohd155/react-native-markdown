import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { HtmlMode, Preset } from '../parse';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import { createMarkdownScheduler } from '../stream/scheduler';
import type { SmoothingMode } from '../stream/types';
import { createDocument, type MarkdownDocument } from './document';
import { parse } from './parse';
import { shallowEqualArray } from './stable';

export interface UseMarkdownStreamOptions {
  /** As for `parse()`. Read once, when the hook is created. */
  readonly preset?: Preset;
  /** As for `parse()`. Read once, when the hook is created. */
  readonly html?: HtmlMode;
  /** As for `parse()`. Read once, when the hook is created. */
  readonly plugins?: readonly MarkdownPlugin[];
  /**
   * `'hide-incomplete'` hides the dangling syntax fragment of the open block
   * while it streams (view only; `done()` is always exact). Default `'none'`.
   * Read once, when the hook is created.
   */
  readonly smoothing?: SmoothingMode;
  /**
   * Batches updates in a fixed window of this many milliseconds: a flush on
   * the first chunk, then at most one per window. Giving it selects this
   * timer schedule on every platform.
   *
   * Default (P2-4): on web a 16 ms window; on iOS and Android one flush per
   * animation frame. Read once, when the hook is created.
   */
  readonly flushIntervalMs?: number;
}

export interface UseMarkdownStreamResult {
  /** Adds text. Batched: the document changes at most once per flush. */
  append(chunk: string): void;
  /** Starts over, optionally with initial text. Flushes at once. */
  reset(source?: string): void;
  /** Ends the stream: flushes at once and parses the whole text. */
  done(): void;
  /** Changes once per flush. Never null: starts out empty. */
  readonly document: MarkdownDocument;
}

function presetEqual(a: Preset | undefined, b: Preset | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return a.base === b.base && shallowEqualArray(a.exclude, b.exclude);
}

/**
 * P2-4. An explicit window selects the timer on every platform. Otherwise web
 * uses a short timer (a hidden tab throttles animation frames, which stalled a
 * stream 3.5x in the web run) and iOS and Android flush once per frame.
 */
function defaultStrategy(
  flushIntervalMs: number | undefined
): 'timeout' | 'raf' {
  if (flushIntervalMs !== undefined) return 'timeout';
  return Platform.OS === 'web' ? 'timeout' : 'raf';
}

/** `__DEV__` as React Native and Jest define it; false when absent. */
function isDev(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}

/**
 * Streams markdown into a `MarkdownDocument` for `<Markdown document>`.
 * Spec: docs/rewrite/05-streaming.md#api,
 * docs/rewrite/phase-2/hook-and-scheduler.md
 *
 * `append`, `reset` and `done` keep their identity for the life of the
 * component. Options are read when the hook is created; changing `plugins`
 * `preset` or `smoothing` later has no effect (call `reset()` on a new hook instead) and
 * warns in development.
 */
export function useMarkdownStream(
  options: UseMarkdownStreamOptions = {}
): UseMarkdownStreamResult {
  const [document, setDocument] = useState<MarkdownDocument>(() =>
    parse('', {
      preset: options.preset,
      html: options.html,
      plugins: options.plugins,
    })
  );

  // Created once, in the first render (lazy state, not a ref: a ref read in
  // render is not allowed). Holds the mutable pieces that outlive renders.
  const [state] = useState(() => {
    const { preset, html, plugins, smoothing, flushIntervalMs } = options;
    const scheduler = createMarkdownScheduler({
      preset,
      html,
      plugins,
      smoothing,
      flushIntervalMs,
      strategy: defaultStrategy(flushIntervalMs),
      onFlush: (table) => setDocument(createDocument(table)),
    });
    const holder = {
      options,
      scheduler,
      /** Cleanup: cancels the pending flush, keeps the text, ignores later calls. */
      suspend() {
        holder.suspended = true;
        scheduler.suspend();
      },
      /** Effect: undoes `suspend`. */
      resume() {
        holder.suspended = false;
        scheduler.resume();
      },
      /** True between cleanup and the next effect run (and after unmount). */
      suspended: false,
      api: {
        append: (chunk: string) => scheduler.append(chunk),
        reset: (source?: string) => {
          if (!holder.suspended) scheduler.reset(source);
        },
        done: () => {
          if (!holder.suspended) scheduler.done();
        },
      } satisfies Pick<UseMarkdownStreamResult, 'append' | 'reset' | 'done'>,
    };
    return holder;
  });

  // The scheduler drops `append` while suspended; the buffer survives a
  // StrictMode cleanup and is flushed again by `resume`.
  useEffect(() => {
    state.resume();
    return () => state.suspend();
  }, [state]);

  const warned = useRef(false);
  useEffect(() => {
    if (!isDev() || warned.current) return;
    const first = state.options;
    if (
      !shallowEqualArray(first.plugins, options.plugins) ||
      !presetEqual(first.preset, options.preset) ||
      first.smoothing !== options.smoothing
    ) {
      warned.current = true;
      console.warn(
        '[react-native-markdown] useMarkdownStream reads `plugins`, `preset` and `smoothing` ' +
          'once, when the hook is created. The new values are ignored.'
      );
    }
  });

  const { append, reset, done } = state.api;
  return useMemo(
    () => ({ append, reset, done, document }),
    [append, reset, done, document]
  );
}
