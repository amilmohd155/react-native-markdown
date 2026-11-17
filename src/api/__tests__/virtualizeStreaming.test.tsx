/**
 * The streaming tail in a list (#51, virtualization.md "Open until built"):
 * 500 chunks of a document with headings, paragraphs, a list, a code block
 * and a table stream into `<Markdown virtualize>` (and `scroll`, and the
 * hook in a plain FlatList). After every flush:
 * - every rendered block equals a fresh render of the text so far, as the
 *   stream shows it (the hide-incomplete view, P2b-2), so the open block
 *   is current;
 * - blocks closed before and after the flush keep their host instance (no
 *   remount) and do not render at all;
 * - with `autoScroll` off the library makes no scroll call; with it on,
 *   exactly one non-animated `scrollToEnd` per reported content growth
 *   past the viewport.
 *
 * Not proven here: every block is mounted (`initialNumToRender` covers the
 * document), so this is the streaming path, not windowing (see
 * remount.test.tsx); content heights are made up, not laid out; and the
 * device's own scroll position is not modelled beyond echoing an `onScroll`
 * at the end after each `scrollToEnd`.
 */
import {
  createElement,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { FlatList } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  renderTree,
  textOf,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import { hostComponents } from '../../render/__tests__/helpers';
import { ELEMENT_NAMES } from '../../theme';
import { createDocument, tableOf } from '../document';
import { streamView } from '../../../test/stream/harness';
import { Markdown } from '../Markdown';
import type { ScrollOptions } from '../scrollOptions';
import { useMarkdownBlocks } from '../useMarkdownBlocks';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';
import {
  cellsOf,
  fire,
  layoutEvent,
  mountedIndices,
  rootOf,
  scrollEvent,
  scrollViewMocks,
  spyScrollCalls,
} from './listHelpers';

// -- The document -------------------------------------------------------------

const section = (n: number) =>
  [
    `## Section ${n}`,
    `Paragraph ${n} has *emphasis*, \`code\` and a [link](https://x.dev/${n}).`,
    `- item ${n}.1\n- item ${n}.2\n- item ${n}.3`,
    '```js\n' + `const x${n} = ${n};\nconsole.log(x${n});\n` + '```',
    `| col a | col b |\n|---|---|\n| ${n}.1 | ${n}.2 |\n| ${n}.3 | ${n}.4 |`,
    `Closing paragraph ${n}, long enough to grow across several chunks.`,
  ].join('\n\n');

const SOURCE = [1, 2, 3, 4].map(section).join('\n\n') + '\n';
const CHUNKS = 500;

/** `SOURCE` cut into exactly `CHUNKS` pieces of uneven length (seeded). */
function chunks(): string[] {
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const cuts = new Set<number>();
  while (cuts.size < CHUNKS - 1) {
    cuts.add(1 + Math.floor(random() * (SOURCE.length - 1)));
  }
  const sorted = [0, ...[...cuts].sort((a, b) => a - b), SOURCE.length];
  return sorted.slice(1).map((end, i) => SOURCE.slice(sorted[i], end));
}

// -- Tracked elements ---------------------------------------------------------

/** Element renders and mounts, by instance id. */
const log = {
  renders: [] as number[],
  mounts: [] as number[],
  unmounts: [] as number[],
};
let nextId = 0;

/**
 * A host element named `name` that tags itself with an id fixed at mount
 * (`mountId`), and logs every render, mount and unmount of that id.
 */
function tracked(name: string) {
  return function Tracked({
    children,
    style: _style,
    ...props
  }: {
    children?: ReactNode;
    style?: unknown;
  }) {
    const [id] = useState(() => ++nextId);
    log.renders.push(id);
    useEffect(() => {
      log.mounts.push(id);
      return () => {
        log.unmounts.push(id);
      };
    }, [id]);
    return createElement(name, { ...props, mountId: id }, children);
  };
}

const TOP = ['Heading', 'Paragraph', 'List', 'CodeBlock', 'Table'] as const;
const components = hostComponents(
  Object.fromEntries(
    TOP.map((name) => [name, tracked(name) as ComponentType<never>])
  )
);
const plain = hostComponents();
const ELEMENTS = new Set<string>(ELEMENT_NAMES);

/** Top-level element hosts, in block order. */
function topHosts(node: TestInstance): TestInstance[] {
  const out: TestInstance[] = [];
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (ELEMENTS.has(child.type)) out.push(child);
    else out.push(...topHosts(child));
  }
  return out;
}

const shape = (tree: Tree) =>
  topHosts(tree.container).map((h) => `${h.type}: ${textOf(h)}`);
const types = (tree: Tree) => topHosts(tree.container).map((h) => h.type);
const ids = (tree: Tree) =>
  topHosts(tree.container).map((h) => h.props.mountId as number);

// -- Scenarios ----------------------------------------------------------------

type Mode = 'virtualize' | 'scroll' | 'hook';

const probe = {} as { current: UseMarkdownStreamResult };

function Streamed({
  mode,
  options,
}: {
  mode: Mode;
  options: Omit<ScrollOptions, 'component'>;
}) {
  const stream = useMarkdownStream();
  useEffect(() => {
    probe.current = stream;
  });
  if (mode === 'hook') return <HookList document={stream.document} />;
  return (
    <Markdown
      document={stream.document}
      components={components}
      {...(mode === 'scroll'
        ? { scroll: options }
        : { virtualize: { ...options, initialNumToRender: 1000 } })}
    />
  );
}

function HookList({
  document,
}: {
  document: UseMarkdownStreamResult['document'];
}) {
  const blocks = useMarkdownBlocks({ document, components });
  return (
    <FlatList
      data={blocks.data}
      keyExtractor={blocks.keyExtractor}
      renderItem={blocks.renderItem}
      initialNumToRender={1000}
    />
  );
}

/**
 * Content height a device might report: grows with blocks and text, and
 * sometimes shrinks (a `| a | b |` paragraph becoming a table).
 */
const heightOf = (tree: Tree) =>
  topHosts(tree.container).reduce(
    (sum, h) => sum + 24 + 2 * textOf(h).length,
    0
  );

const VIEWPORT = 600;

interface Run {
  readonly flushes: number;
  readonly tableRemounts: number;
  readonly kindChanges: number;
  readonly opened: number;
  readonly expectedEnds: number;
}

/**
 * Streams every chunk, checking after each flush. With `report`, the
 * container is told its viewport once and its content height after each
 * flush, and gets an `onScroll` at the end after each `scrollToEnd`.
 */
async function streamAll(tree: Tree, report: boolean): Promise<Run> {
  const reference = await renderTree(<Markdown source="" components={plain} />);
  const root = rootOf(tree);
  if (report) await fire(root, 'onLayout', layoutEvent(0, VIEWPORT));
  let text = '';
  let lastHeight = 0;
  let expectedEnds = 0;
  let tableRemounts = 0;
  let kindChanges = 0;
  let opened = 0;
  let flushes = 0;
  for (const chunk of chunks()) {
    const before = tableOf(probe.current.document);
    const beforeIds = ids(tree);
    const beforeTypes = types(tree);
    log.renders.length = 0;
    log.unmounts.length = 0;

    text += chunk;
    await act(async () => probe.current.append(chunk));
    await act(async () => {
      jest.advanceTimersByTime(60);
    });
    flushes++;

    const after = tableOf(probe.current.document);
    await reference.rerender(
      <Markdown
        document={createDocument(streamView(text))}
        components={plain}
      />
    );
    // The open block (and every other) shows the text so far.
    expect(shape(tree)).toEqual(shape(reference));

    const closed =
      after.prefixId !== undefined && after.prefixId === before.prefixId
        ? Math.min(before.stableCount ?? 0, after.stableCount ?? 0)
        : 0;
    const afterIds = ids(tree);
    const closedIds = beforeIds.slice(0, closed);
    // Closed blocks: same instance, no render, no unmount.
    expect(afterIds.slice(0, closed)).toEqual(closedIds);
    for (const id of closedIds) {
      expect(log.renders).not.toContain(id);
      expect(log.unmounts).not.toContain(id);
    }
    if (after.blockCount > before.blockCount) opened++;
    // What did remount: the open block, when its kind changed (a paragraph
    // becoming a code block or a table), or the open table, which is keyed
    // by its content (renderBlock.ts) and so remounts on every change.
    for (const id of log.unmounts) {
      const index = beforeIds.indexOf(id);
      expect(index).toBeGreaterThanOrEqual(closed);
      const was = beforeTypes[index];
      if (was === 'Table') tableRemounts++;
      else {
        expect(types(tree)[index]).not.toBe(was);
        kindChanges++;
      }
    }

    if (report) {
      const height = heightOf(tree);
      if (height > lastHeight && height > VIEWPORT) expectedEnds++;
      const calls = scrollViewMocks.scrollToEnd.mock.calls.length;
      await fire(root, 'onContentSizeChange', 300, height);
      lastHeight = height;
      if (scrollViewMocks.scrollToEnd.mock.calls.length > calls) {
        // The device reports where our scrollToEnd landed.
        await fire(
          root,
          'onScroll',
          scrollEvent(height - VIEWPORT, height, VIEWPORT)
        );
      }
    }
  }
  await act(async () => probe.current.done());
  await reference.rerender(<Markdown source={SOURCE} components={plain} />);
  expect(shape(tree)).toEqual(shape(reference));
  return { flushes, tableRemounts, kindChanges, opened, expectedEnds };
}

beforeEach(() => {
  jest.useFakeTimers();
  log.renders.length = 0;
  log.mounts.length = 0;
  log.unmounts.length = 0;
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('500-chunk stream', () => {
  it('has the document shape the test needs', () => {
    const pieces = chunks();
    expect(pieces).toHaveLength(CHUNKS);
    expect(pieces.join('')).toBe(SOURCE);
  });

  it.each(['virtualize', 'scroll', 'hook'] as const)(
    '%s: open block current, closed blocks untouched, no scroll calls',
    async (mode) => {
      const spies = spyScrollCalls();
      const tree = await renderTree(<Streamed mode={mode} options={{}} />);
      const run = await streamAll(tree, mode !== 'hook');
      expect(run.flushes).toBe(CHUNKS);
      // The tail crossed many block boundaries (4 sections of 6 blocks).
      expect(run.opened).toBeGreaterThanOrEqual(20);
      expect(topHosts(tree.container)).toHaveLength(24);
      // Kind changes: about one per code block and table (4 each).
      expect(run.kindChanges).toBeLessThanOrEqual(12);
      // The open table is keyed by its content, so it remounts on each
      // change. A row shows when its line ends (P2b-3): about one remount
      // per finished row (4 tables of 2 rows), not one per flush.
      expect(run.tableRemounts).toBeGreaterThanOrEqual(4);
      expect(run.tableRemounts).toBeLessThanOrEqual(12);
      expect(spies.all()).toEqual({
        scrollTo: 0,
        scrollToEnd: 0,
        scrollToIndex: 0,
        scrollToOffset: 0,
        listScrollToEnd: 0,
      });
    },
    30_000
  );

  it.each(['virtualize', 'scroll'] as const)(
    '%s with autoScroll: one non-animated scrollToEnd per growth',
    async (mode) => {
      const spies = spyScrollCalls();
      const tree = await renderTree(
        <Streamed mode={mode} options={{ autoScroll: true }} />
      );
      const run = await streamAll(tree, true);
      // Fewer than the 500 flushes: hidden fragments and table rows that
      // wait for their newline do not grow the content.
      expect(run.expectedEnds).toBeGreaterThan(120);
      expect(scrollViewMocks.scrollToEnd).toHaveBeenCalledTimes(
        run.expectedEnds
      );
      for (const [options] of scrollViewMocks.scrollToEnd.mock.calls) {
        expect(options).toEqual({ animated: false });
      }
      expect(spies.all()).toMatchObject({
        scrollTo: 0,
        scrollToIndex: 0,
        scrollToOffset: 0,
        listScrollToEnd: 0,
      });
    },
    30_000
  );
});

describe('500-chunk stream under real windowing', () => {
  function Windowed() {
    const stream = useMarkdownStream();
    useEffect(() => {
      probe.current = stream;
    });
    return (
      <Markdown
        document={stream.document}
        components={components}
        virtualize={{ initialNumToRender: 3, windowSize: 3, autoScroll: true }}
      />
    );
  }

  /** The tracked top-level host of each mounted cell, by block index. */
  const byIndex = (root: TestInstance) =>
    new Map(cellsOf(root).map(({ host, index }) => [index, topHosts(host)[0]]));

  it('keeps the open tail mounted and current while early blocks leave the window', async () => {
    const CELL = 100;
    const tree = await renderTree(<Windowed />);
    const root = rootOf(tree);
    const reference = await renderTree(
      <Markdown source="" components={plain} />
    );
    await fire(root, 'onLayout', layoutEvent(0, VIEWPORT));
    const laidOut = new Set<number>();
    let text = '';
    let stamp = 0;
    let lastEnds = 0;
    for (const chunk of chunks()) {
      const before = tableOf(probe.current.document);
      const beforeHosts = byIndex(root);
      text += chunk;
      log.renders.length = 0;
      await act(async () => probe.current.append(chunk));
      await act(async () => {
        jest.advanceTimersByTime(60);
      });
      const after = tableOf(probe.current.document);
      const count = after.blockCount;
      // What the device reports: new cells' layouts, the content height,
      // and, after our scrollToEnd, the scroll position at the end.
      for (const { host, index } of cellsOf(root)) {
        if (laidOut.has(index)) continue;
        laidOut.add(index);
        await fire(host, 'onLayout', layoutEvent(index * CELL, CELL));
      }
      const height = count * CELL;
      await fire(root, 'onContentSizeChange', 300, height);
      const ends = scrollViewMocks.scrollToEnd.mock.calls.length;
      if (ends > lastEnds && height > VIEWPORT) {
        stamp += 16;
        await fire(
          root,
          'onScroll',
          scrollEvent(height - VIEWPORT, height, VIEWPORT, stamp)
        );
      }
      lastEnds = ends;
      await act(async () => {
        jest.advanceTimersByTime(60);
      });

      // The open block is mounted and shows the text so far.
      await reference.rerender(
        <Markdown
          document={createDocument(streamView(text))}
          components={plain}
        />
      );
      const cells = byIndex(root);
      if (count > 0) {
        const tail = cells.get(count - 1);
        expect(tail).toBeDefined();
        expect(`${tail!.type}: ${textOf(tail!)}`).toBe(shape(reference).at(-1));
      }
      // Closed blocks still mounted: same instance, no render.
      if (after.prefixId === before.prefixId) {
        const closed = Math.min(
          before.stableCount ?? 0,
          after.stableCount ?? 0
        );
        for (const [index, host] of beforeHosts) {
          if (index >= closed || !cells.has(index)) continue;
          expect(cells.get(index)!.props.mountId).toBe(host!.props.mountId);
          expect(log.renders).not.toContain(host!.props.mountId);
        }
      }
    }
    // The window moved: blocks after the initial ones left it.
    const mounted = mountedIndices(root);
    expect(mounted).toContain(23);
    expect(mounted).not.toContain(5);
    expect(log.unmounts.length).toBeGreaterThan(0);
  }, 30_000);
});
