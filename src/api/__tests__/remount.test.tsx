/**
 * Remount in `virtualize` mode (#51, virtualization.md "Open until built"):
 * a block with a table and a block with an image scroll out of the
 * FlatList's window and back. The remounted blocks read their column widths
 * and image size from the caches (tableLayout.ts, imageSize.ts) on their
 * first render: no `Image.getSize` call, no measuring pass.
 *
 * The window is VirtualizedList's own: the test feeds it the layout and
 * scroll events a device would send (fixed 100 px cells), so cells really
 * unmount and mount again. What it does not prove: real native layout, text
 * measurement or cell heights (every height here is made up), nor timing
 * on a device (a remount there may still cost a frame of native layout).
 */
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { Image, StyleSheet } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderTree, type TestInstance, type Tree } from '../../__tests__/tree';
import { defaultComponents } from '../../render/defaults';
import type { Components, ElementProps } from '../../render/elements';
import { clearImageSizeCache } from '../../render/imageSize';
import { Markdown } from '../Markdown';
import {
  layOutList,
  layoutEvent,
  mountedIndices,
  rootOf,
  scrollListTo,
} from './listHelpers';

const COUNT = 80;
const TABLE = 20;
const IMAGE = 21;
const SRC = 'https://example.com/remount.png';

const SOURCE = Array.from({ length: COUNT }, (_, i) => {
  if (i === TABLE) return '| a | b |\n|---|---|\n| one | two |\n| three | 4 |';
  if (i === IMAGE) return `![photo](${SRC})`;
  return `Block ${i}.`;
}).join('\n\n');

/** Commit phases of the default Table and Image, in order. */
const commits: string[] = [];
const onRender: ProfilerOnRenderCallback = (id, phase) => {
  commits.push(`${id}:${phase}`);
};

const DefaultTable = defaultComponents.Table;
const DefaultImage = defaultComponents.Image;

/** The default elements, inside a Profiler that logs each commit. */
const profiled: Partial<Components> = {
  Table: (props: ElementProps<'Table'>) => (
    <Profiler id="Table" onRender={onRender}>
      <DefaultTable {...props} />
    </Profiler>
  ),
  Image: (props: ElementProps<'Image'>) => (
    <Profiler id="Image" onRender={onRender}>
      <DefaultImage {...props} />
    </Profiler>
  ),
};

const flat = (node: TestInstance) =>
  (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;

/** Table cell Views: they carry the cell border style. */
const tableCells = (tree: Tree) =>
  tree.findAll((n) => n.type === 'View' && 'borderWidth' in flat(n));

const imageHost = (tree: Tree) => tree.findAll((n) => n.type === 'Image');

let getSize: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  clearImageSizeCache();
  commits.length = 0;
  getSize = jest.spyOn(Image, 'getSize');
  getSize.mockResolvedValue({ width: 400, height: 200 });
});
afterEach(() => {
  getSize.mockRestore();
  jest.useRealTimers();
});

it('remounts a table and an image from the caches, with no second pass', async () => {
  const tree = await renderTree(
    <Markdown
      source={SOURCE}
      components={profiled}
      virtualize={{ initialNumToRender: 1, windowSize: 3 }}
    />
  );
  const root = rootOf(tree);
  await layOutList(root, COUNT);
  expect(mountedIndices(root)).not.toContain(TABLE);

  // -- First mount: measured the slow way. ----------------------------------
  await scrollListTo(root, TABLE * 100, COUNT);
  expect(mountedIndices(root)).toEqual(expect.arrayContaining([TABLE, IMAGE]));
  expect(tableCells(tree)).toHaveLength(6);
  // Measuring: cells report their natural width, then one frame commits.
  expect(tableCells(tree).every((c) => c.props.onLayout)).toBe(true);
  const natural = [30, 20, 50, 60, 90, 10];
  await act(async () => {
    tableCells(tree).forEach((cell, i) =>
      cell.props.onLayout(layoutEvent(0, 20, natural[i]))
    );
  });
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  const widths = tableCells(tree).map((c) => flat(c).width);
  expect(widths).toEqual([90, 60, 90, 60, 90, 60]);
  expect(flat(imageHost(tree)[0]!)).toMatchObject({ aspectRatio: 2 });
  expect(getSize).toHaveBeenCalledTimes(1);
  // The Profiler sees both passes: a mount, then an update per element.
  expect(commits).toEqual(
    expect.arrayContaining(['Table:mount', 'Table:update', 'Image:mount'])
  );
  expect(commits).toContain('Image:update');

  // -- Out of the window: both cells unmount. -------------------------------
  await scrollListTo(root, 6000, COUNT);
  expect(mountedIndices(root)).not.toContain(TABLE);
  expect(mountedIndices(root)).not.toContain(IMAGE);
  expect(tableCells(tree)).toHaveLength(0);
  expect(imageHost(tree)).toHaveLength(0);

  // -- Back: remounted, final on the first render. --------------------------
  commits.length = 0;
  await scrollListTo(root, TABLE * 100, COUNT);
  expect(mountedIndices(root)).toEqual(expect.arrayContaining([TABLE, IMAGE]));
  // One commit each, a mount: no measuring update, no size update.
  expect(commits.filter((c) => c.startsWith('Table'))).toEqual(['Table:mount']);
  expect(commits.filter((c) => c.startsWith('Image'))).toEqual(['Image:mount']);
  expect(tableCells(tree).map((c) => flat(c).width)).toEqual(widths);
  // Not measuring: no cell reports a width, nothing is hidden.
  expect(tableCells(tree).every((c) => c.props.onLayout === undefined)).toBe(
    true
  );
  expect(JSON.stringify(tree.toJSON())).not.toContain('"opacity":0');
  const image = flat(imageHost(tree)[0]!);
  expect(image).toMatchObject({ aspectRatio: 2 });
  expect(image).not.toHaveProperty('backgroundColor'); // no placeholder
  expect(getSize).toHaveBeenCalledTimes(1);
});

it('remounts the table from the cache after a theme round trip', async () => {
  // The width cache is per resolved theme. `theme="light"` resolves to the
  // same theme object on every render, so after light → dark → light a
  // remounted table still hits the light widths.
  const element = (theme: 'light' | 'dark') => (
    <Markdown
      source={SOURCE}
      theme={theme}
      components={profiled}
      virtualize={{ initialNumToRender: 1, windowSize: 3 }}
    />
  );
  const measure = async (width: number) => {
    await act(async () => {
      tableCells(tree).forEach((cell) =>
        cell.props.onLayout?.(layoutEvent(0, 20, width))
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
  };
  const tree = await renderTree(element('light'));
  const root = rootOf(tree);
  await layOutList(root, COUNT);
  await scrollListTo(root, TABLE * 100, COUNT);
  await measure(70);
  const light = tableCells(tree).map((c) => flat(c).width);
  expect(light.every((w) => typeof w === 'number')).toBe(true);

  await tree.rerender(element('dark'));
  await measure(130);
  const dark = tableCells(tree).map((c) => flat(c).width);
  expect(dark.every((w) => typeof w === 'number')).toBe(true);

  await tree.rerender(element('light'));
  expect(tableCells(tree).map((c) => flat(c).width)).toEqual(light);
  await scrollListTo(root, 6000, COUNT);
  expect(tableCells(tree)).toHaveLength(0);
  commits.length = 0;
  await scrollListTo(root, TABLE * 100, COUNT);
  expect(commits.filter((c) => c.startsWith('Table'))).toEqual(['Table:mount']);
  expect(tableCells(tree).map((c) => flat(c).width)).toEqual(light);
});
