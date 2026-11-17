// The Lists tab: the phase 3 containers by hand on a device (#51).
// - Document: a long static document in `virtualize` mode, with
//   `scrollToBlock` and `scrollToEnd` buttons.
// - Stream: a streamed answer with `autoScroll`, in `scroll` or
//   `virtualize` mode. Drag up while it streams to pause following; come
//   back to the end (or press End) to resume.
// - Hook: `useMarkdownBlocks()` in a plain React Native FlatList.
// Each mode renders its own scroll container at the root of the screen,
// never inside another vertical scroller (P3-2).
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Markdown,
  parse,
  useMarkdownBlocks,
  useMarkdownStream,
  type MarkdownListRef,
} from '@docren/react-native-markdown';
import { gallery } from '../gallery';
import { Button, Segmented, UIText, useChrome } from '../ui';
import { CODE_HEAVY } from './streamBenchFixtures';

/** The feature tour twelve times over: several hundred blocks. */
const LONG = parse(
  Array.from({ length: 12 }, (_, i) => `# Copy ${i + 1}\n\n${gallery}`).join(
    '\n\n'
  )
);

const ANSWER = `${gallery}\n\n${CODE_HEAVY}`;
/**
 * Characters per tick, and the tick (about one frame). Slow enough that
 * there is time to drag away from the end and back while it streams.
 */
const STEP = 8;
const TICK_MS = 16;

const MODES = [
  { value: 'document', label: 'Document' },
  { value: 'stream', label: 'Stream' },
  { value: 'hook', label: 'Hook' },
] as const;
type Mode = (typeof MODES)[number]['value'];

const CONTAINERS = [
  { value: 'scroll', label: 'scroll' },
  { value: 'virtualize', label: 'virtualize' },
] as const;
type Container = (typeof CONTAINERS)[number]['value'];

export function Lists() {
  const [mode, setMode] = useState<Mode>('document');
  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <Segmented
          label="List mode"
          value={mode}
          onChange={setMode}
          options={MODES}
        />
      </View>
      {mode === 'document' ? <LongDocument /> : null}
      {mode === 'stream' ? <StreamedAnswer /> : null}
      {mode === 'hook' ? <HookList /> : null}
    </View>
  );
}

function LongDocument() {
  const { effective } = useChrome();
  const ref = useRef<MarkdownListRef>(null);
  const count = LONG.blockCount;
  const go = (index: number) => ref.current?.scrollToBlock(index);
  return (
    <>
      <View style={styles.row}>
        <Button label="First" tone="quiet" onPress={() => go(0)} />
        <Button
          label="Middle"
          tone="quiet"
          onPress={() => go(Math.floor(count / 2))}
        />
        <Button label="Last" tone="quiet" onPress={() => go(count - 1)} />
        <Button label="End" onPress={() => ref.current?.scrollToEnd()} />
      </View>
      <UIText variant="caption" muted style={styles.note}>
        {`virtualize · ${count} blocks`}
      </UIText>
      <Markdown
        document={LONG}
        theme={effective}
        virtualize={{
          ref,
          style: styles.fill,
          contentContainerStyle: styles.content,
        }}
      />
    </>
  );
}

function StreamedAnswer() {
  const { effective } = useChrome();
  const [container, setContainer] = useState<Container>('virtualize');
  const [streaming, setStreaming] = useState(false);
  const ref = useRef<MarkdownListRef>(null);
  // `append`, `reset` and `done` keep their identity; the result object does
  // not (its `document` changes per flush), so the effect depends on them.
  const { append, reset, done, document } = useMarkdownStream();

  const start = useCallback(() => {
    reset();
    setStreaming(true);
  }, [reset]);

  useEffect(() => {
    if (!streaming) return;
    let at = 0;
    const timer = setInterval(() => {
      append(ANSWER.slice(at, at + STEP));
      at += STEP;
      if (at >= ANSWER.length) {
        clearInterval(timer);
        done();
        setStreaming(false);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [streaming, append, done]);

  const options = {
    ref,
    autoScroll: true,
    style: styles.fill,
    contentContainerStyle: styles.content,
  };
  return (
    <>
      <View style={styles.row}>
        <Segmented
          label="Container"
          value={container}
          onChange={setContainer}
          options={CONTAINERS}
          style={styles.grow}
        />
        <Button
          label={streaming ? 'Stop' : 'Stream'}
          onPress={streaming ? () => setStreaming(false) : start}
        />
        <Button
          label="End"
          tone="quiet"
          onPress={() => ref.current?.scrollToEnd()}
        />
      </View>
      <UIText variant="caption" muted style={styles.note}>
        Drag up to pause following; return to the end to resume.
      </UIText>
      {container === 'scroll' ? (
        <Markdown document={document} theme={effective} scroll={options} />
      ) : (
        <Markdown document={document} theme={effective} virtualize={options} />
      )}
    </>
  );
}

function HookList() {
  const { effective } = useChrome();
  const blocks = useMarkdownBlocks({ document: LONG, theme: effective });
  return (
    <>
      <UIText variant="caption" muted style={styles.note}>
        {`useMarkdownBlocks · FlatList · ${blocks.data.length} blocks`}
      </UIText>
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.content}
        data={blocks.data}
        keyExtractor={blocks.keyExtractor}
        renderItem={blocks.renderItem}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { paddingHorizontal: 16, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  grow: { flexGrow: 1 },
  note: { paddingHorizontal: 16, paddingVertical: 6 },
  fill: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
});
