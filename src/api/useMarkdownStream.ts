import {
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import type { NodeTable } from '../model';
import type { HtmlMode, Preset } from '../parse';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import { createMarkdownPacer } from '../stream/pacer';
import { createMarkdownScheduler, type FlushKind } from '../stream/scheduler';
import {
  createDocument,
  streamInfoOf,
  tableOf,
  type MarkdownDocument,
  type StreamInfo,
} from './document';
import { parse } from './parse';
import { presetEqual, shallowEqualArray } from './stable';

/**
 * How new blocks appear while a stream is live (P2b-5): `'none'`, or a fade
 * from transparent, 200 ms unless `duration` (ms) says otherwise.
 */
export type StreamAnimation =
  | 'none'
  | 'fade'
  | { readonly type: 'fade'; readonly duration?: number };

/**
 * How a stream is presented while it is live. Read once, when the hook is
 * created. Spec: docs/rewrite/05-streaming.md#api
 */
export interface StreamingConfig {
  /**
   * Paces the text: appended text is released a little per frame, at word
   * boundaries, instead of in bursts. A list or heading marker waits for its
   * first word. The view stays at most about 1 s behind, a stall of 0.5 s
   * releases a held word, and `done()` drains the rest within 0.2 s, then
   * publishes the exact parse. Default `false`.
   */
  readonly smooth?: boolean;
  /**
   * A block that appears while the stream is live fades in once. Blocks
   * shown before, blocks a list mounts later on scroll, and everything after
   * `done()` do not. Off with Reduce Motion. Default `'none'`.
   */
  readonly animation?: StreamAnimation;
}

export interface UseMarkdownStreamOptions {
  /** As for `parse()`. Read once, when the hook is created. */
  readonly preset?: Preset;
  /** As for `parse()`. Read once, when the hook is created. */
  readonly html?: HtmlMode;
  /** As for `parse()`. Read once, when the hook is created. */
  readonly plugins?: readonly MarkdownPlugin[];
  /** Presentation while streaming. Read once, when the hook is created. */
  readonly streamingConfig?: StreamingConfig;
  /**
   * Called once per stream, after the exact document that `done()`
   * publishes has been committed (with `smooth`, after the paced text), so
   * it can scroll or measure. `reset()` starts a new stream. Not called on
   * unmount. The latest function is called; it may change on every render.
   */
  readonly onStreamingEnd?: () => void;
}

export interface UseMarkdownStreamResult {
  /** Adds text. Batched: the document changes at most once per flush (per frame with `smooth`). */
  append(chunk: string): void;
  /** Starts over, optionally with initial text. Flushes at once. */
  reset(source?: string): void;
  /**
   * Ends the stream: flushes at once and parses the whole text. With
   * `streamingConfig.smooth`, the paced text drains first (within 0.2 s).
   */
  done(): void;
  /** Changes once per flush. Never null: starts out empty. */
  readonly document: MarkdownDocument;
}

/**
 * P2-4. Web uses a short timer (a hidden tab throttles animation frames, which
 * stalled a stream 3.5x in the web run); iOS and Android flush once per frame.
 */
function defaultStrategy(): 'timeout' | 'raf' {
  return Platform.OS === 'web' ? 'timeout' : 'raf';
}

/** Start, end and stop of the stream behind the hook: the scheduler, or the pacer in front of it. */
interface StreamDriver {
  append(chunk: string): void;
  done(): void;
  reset(source?: string): void;
  suspend(): void;
  resume(): void;
}

/** `__DEV__` as React Native and Jest define it; false when absent. */
function isDev(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}

/** P2b-5: the default fade length. */
const FADE_DURATION_MS = 200;

/** The fade length `animation` asks for, in ms, or null for none. */
function fadeDuration(animation: StreamAnimation | undefined): number | null {
  if (animation === undefined || animation === 'none') return null;
  if (animation === 'fade') return FADE_DURATION_MS;
  const ms = animation.duration ?? FADE_DURATION_MS;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Where a hook's stream stands; its identity is the stream's (`StreamInfo.stream`). */
interface StreamState {
  epoch: number;
  ended: boolean;
  readonly fade: number | null;
}

/** A snapshot for the next published document. */
function infoOf(stream: StreamState): StreamInfo {
  const { epoch, ended, fade } = stream;
  return { stream, epoch, ended, fade };
}

/** By value, so an inline `{ smooth: true }` on every render does not warn. */
function streamingConfigEqual(
  a: StreamingConfig | undefined,
  b: StreamingConfig | undefined
): boolean {
  return (
    (a?.smooth ?? false) === (b?.smooth ?? false) &&
    fadeDuration(a?.animation) === fadeDuration(b?.animation)
  );
}

/**
 * Streams markdown into a `MarkdownDocument` for `<Markdown document>`.
 * Spec: docs/rewrite/05-streaming.md#api,
 * docs/rewrite/phase-2/hook-and-scheduler.md
 *
 * While it streams, the document hides the open block's unfinished syntax
 * (a dangling `**bold`, a link or table row in progress: P2b-2, P2b-3,
 * docs/rewrite/phase-2/smoothing.md). `done()` and `reset()` publish the
 * exact parse (with `streamingConfig.smooth`, `done()` first drains the
 * paced text, within 0.2 s).
 *
 * `append`, `reset` and `done` keep their identity for the life of the
 * component. Options are read when the hook is created; changing `plugins`,
 * `preset` or `streamingConfig` later has no effect (call `reset()` on a new
 * hook instead) and warns in development. `onStreamingEnd` is the exception:
 * the latest one is called.
 *
 * `<Markdown document>` and `useMarkdownBlocks()` apply
 * `streamingConfig.animation` on their own: no other prop is needed.
 */
export function useMarkdownStream(
  options: UseMarkdownStreamOptions = {}
): UseMarkdownStreamResult {
  // Created once, in the first render (lazy state, not a ref: a ref read in
  // render is not allowed). Where the stream stands (P2b-5, P2b-6): every
  // published document carries it.
  const [stream] = useState(
    (): StreamState => ({
      epoch: 0,
      ended: false,
      fade: fadeDuration(options.streamingConfig?.animation),
    })
  );

  const [document, setDocument] = useState<MarkdownDocument>(() =>
    createDocument(
      tableOf(
        parse('', {
          preset: options.preset,
          html: options.html,
          plugins: options.plugins,
        })
      ),
      infoOf(stream)
    )
  );

  // Created once, in the first render. Holds the mutable pieces that
  // outlive renders.
  const [state] = useState(() => {
    const { preset, html, plugins } = options;
    const common = {
      preset,
      html,
      plugins,
      // Always on (P2b-2); the core's 'none' is for tests and benches.
      smoothing: 'hide-incomplete' as const,
      onFlush: (table: NodeTable, kind: FlushKind) => {
        if (kind === 'reset') {
          stream.epoch++;
          stream.ended = false;
        } else if (kind === 'done') {
          stream.ended = true;
        }
        setDocument(createDocument(table, infoOf(stream)));
      },
    };
    // P2b-4: with `smooth` the pacer owns the cadence (one release per frame,
    // the 16 ms timer on web as in P2-4).
    const scheduler: StreamDriver = options.streamingConfig?.smooth
      ? createMarkdownPacer({
          ...common,
          strategy: defaultStrategy(),
        })
      : createMarkdownScheduler({
          ...common,
          strategy: defaultStrategy(),
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

  // P2b-6: the latest callback, fired once per epoch from an effect, so the
  // `done()` document is committed first. The ref survives StrictMode's
  // effect re-run, which therefore does not fire twice.
  const onEnd = useRef(options.onStreamingEnd);
  useInsertionEffect(() => {
    onEnd.current = options.onStreamingEnd;
  });
  const endedEpoch = useRef(-1);
  useEffect(() => {
    const info = streamInfoOf(document);
    if (
      info === undefined ||
      !info.ended ||
      endedEpoch.current === info.epoch
    ) {
      return;
    }
    endedEpoch.current = info.epoch;
    onEnd.current?.();
  }, [document]);

  const warned = useRef(false);
  useEffect(() => {
    if (!isDev() || warned.current) return;
    const first = state.options;
    if (
      !shallowEqualArray(first.plugins, options.plugins) ||
      !presetEqual(first.preset, options.preset) ||
      !streamingConfigEqual(first.streamingConfig, options.streamingConfig)
    ) {
      warned.current = true;
      console.warn(
        '[react-native-markdown] useMarkdownStream reads `plugins`, `preset` ' +
          'and `streamingConfig` once, when the hook is created. The new ' +
          'values are ignored.'
      );
    }
  });

  const { append, reset, done } = state.api;
  return useMemo(
    () => ({ append, reset, done, document }),
    [append, reset, done, document]
  );
}
