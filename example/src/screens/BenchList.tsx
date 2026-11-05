import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Markdown as MarkdownV0 } from 'md-v0';
import { F5_MESSAGES } from '../../../bench/fixtures';
import {
  buildObjectTree,
  ObjectTreeMarkdown,
  type ObjectTree,
} from '../../../bench/objectTree';
import { tableOf } from '../../../src/api/document';
import {
  Markdown,
  parse,
  type MarkdownDocument,
} from '@docren/react-native-markdown';
import { UIText } from '../ui';
import {
  deviceInfo,
  forceGc,
  frames,
  heapSample,
  logChunked,
  type HeapSample,
} from './benchUtil';

/**
 * F5 chat-list benchmark: 200 messages in a `FlatList`, one implementation
 * per run. Spec: docs/rewrite/phase-1/benchmark-protocol.md (Metrics).
 *
 * - retainedHeap: Hermes heap growth from an empty list to the rendered one
 *   (documents included for v1, sources only for v0), GC forced before each
 *   sample when the engine exposes `gc()`.
 * - droppedFrames: the list is scrolled for 5 s at a fixed speed. Frames are
 *   counted on the JS side (rAF gaps), which is a proxy: the protocol's
 *   numbers come from `adb shell dumpsys gfxinfo` (Android) or Instruments
 *   (iOS). Start/end markers are logged for that:
 *     adb shell dumpsys gfxinfo <pkg> reset   (before pressing the button)
 *     adb shell dumpsys gfxinfo <pkg>         (after "done")
 *
 * One implementation per app launch: heap numbers from a process that
 * already ran the other library are not comparable. Relaunch between runs.
 */

/** `tree`: v1 parser, object-tree model (the A/B), tree only is retained. */
export type ListImpl = 'v0' | 'v1' | 'tree';

const SCROLL_MS = 5000;
const SCROLL_PX_PER_S = 1500;
/** Frames after the data is set, so the list's windowed batches settle. */
const SETTLE_FRAMES = 15;

interface Item {
  readonly key: number;
  readonly source: string;
  /** v1 only: parsed ahead of render, as a chat app would. */
  readonly document: MarkdownDocument | null;
  /** tree only: converted ahead of render; the document is not kept. */
  readonly tree: ObjectTree | null;
}

export interface ScrollStats {
  readonly durationMs: number;
  readonly speedPxPerS: number;
  readonly frames: number;
  /** Median gap between frames: the frame budget on this display. */
  readonly frameMs: number;
  /** Frames missed: gaps over 1.5 × the median, in whole frames. */
  readonly dropped: number;
  readonly worstGapMs: number;
}

export interface ListResult {
  readonly impl: ListImpl;
  readonly items: number;
  readonly bytes: number;
  /** v1: time to parse all messages; v0 parses in render, so null. */
  readonly parseMs: number | null;
  readonly gcForced: boolean;
  readonly before: HeapSample;
  readonly after: HeapSample;
  readonly retainedBytes: number | null;
  readonly scroll: ScrollStats;
}

function scrollStats(gaps: readonly number[]): ScrollStats {
  const sorted = [...gaps].sort((a, b) => a - b);
  const frameMs = sorted[Math.floor(sorted.length / 2)] ?? 0;
  let dropped = 0;
  for (const gap of gaps) {
    if (frameMs > 0 && gap > frameMs * 1.5) {
      dropped += Math.round(gap / frameMs) - 1;
    }
  }
  return {
    durationMs: SCROLL_MS,
    speedPxPerS: SCROLL_PX_PER_S,
    frames: gaps.length,
    frameMs,
    dropped,
    worstGapMs: sorted[sorted.length - 1] ?? 0,
  };
}

function scrollFixed(list: FlatList<Item>): Promise<ScrollStats> {
  return new Promise((resolve) => {
    const gaps: number[] = [];
    let start = -1;
    let last = -1;
    const tick = (now: number) => {
      if (start < 0) {
        start = now;
        last = now;
        requestAnimationFrame(tick);
        return;
      }
      gaps.push(now - last);
      last = now;
      const t = now - start;
      list.scrollToOffset({
        offset: (t / 1000) * SCROLL_PX_PER_S,
        animated: false,
      });
      if (t < SCROLL_MS) {
        requestAnimationFrame(tick);
      } else {
        resolve(scrollStats(gaps));
      }
    };
    requestAnimationFrame(tick);
  });
}

async function runList(
  impl: ListImpl,
  list: FlatList<Item>,
  setData: (items: readonly Item[]) => void,
  setStatus: (status: string) => void
): Promise<ListResult> {
  // Empty list is mounted; settle, then take the baseline.
  await frames(5);
  setStatus('baseline heap');
  let gcForced = forceGc();
  const before = heapSample();

  setStatus('mounting');
  let parseMs: number | null = null;
  let items: Item[];
  if (impl === 'v1') {
    const t0 = performance.now();
    items = F5_MESSAGES.map((source, key) => ({
      key,
      source,
      document: parse(source),
      tree: null,
    }));
    parseMs = performance.now() - t0;
  } else if (impl === 'tree') {
    // parse + convert; only the tree is kept, as a chat app on this model would.
    const t0 = performance.now();
    items = F5_MESSAGES.map((source, key) => ({
      key,
      source,
      document: null,
      tree: buildObjectTree(tableOf(parse(source))),
    }));
    parseMs = performance.now() - t0;
  } else {
    items = F5_MESSAGES.map((source, key) => ({
      key,
      source,
      document: null,
      tree: null,
    }));
  }
  setData(items);
  await frames(SETTLE_FRAMES);

  setStatus('retained heap');
  gcForced = forceGc() && gcForced;
  const after = heapSample();
  const retainedBytes =
    before.allocated !== null && after.allocated !== null
      ? after.allocated - before.allocated
      : null;

  setStatus(`scrolling ${SCROLL_MS / 1000}s`);
  console.log('[bench:list] scroll-start');
  const scroll = await scrollFixed(list);
  console.log('[bench:list] scroll-end');

  return {
    impl,
    items: items.length,
    bytes: F5_MESSAGES.reduce((n, m) => n + m.length, 0),
    parseMs,
    gcForced,
    before,
    after,
    retainedBytes,
    scroll,
  };
}

export function BenchList({
  impl,
  onDone,
}: {
  impl: ListImpl;
  onDone: (result: ListResult) => void;
}) {
  const [data, setData] = useState<readonly Item[]>([]);
  const [status, setStatus] = useState('starting');
  const listRef = useRef<FlatList<Item>>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let cancelled = false;
    const list = listRef.current;
    if (list === null) return;
    runList(
      impl,
      list,
      (items) => !cancelled && setData(items),
      (s) => !cancelled && setStatus(s)
    ).then((result) => {
      if (cancelled) return;
      logChunked('bench:list', { device: deviceInfo(), result });
      onDoneRef.current(result);
    });
    return () => {
      cancelled = true;
    };
  }, [impl]);

  return (
    <View style={styles.root}>
      <UIText variant="label" style={styles.status}>
        F5 · {impl} · {status}
      </UIText>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => String(item.key)}
        renderItem={({ item }) => (
          <View style={styles.message}>
            {item.tree !== null ? (
              <ObjectTreeMarkdown tree={item.tree} theme="light" />
            ) : item.document !== null ? (
              <Markdown document={item.document} theme="light" />
            ) : (
              <MarkdownV0 markdown={item.source} />
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  status: { padding: 12 },
  message: {
    backgroundColor: '#ffffff',
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
  },
});
