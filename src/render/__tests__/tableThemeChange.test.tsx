import { StyleSheet } from 'react-native';
import { act, useEffect } from 'react';
import { renderTree, type Tree } from '../../__tests__/tree';
import { resolveTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import type { Components } from '../elements';
import { tableFor } from './helpers';

const SOURCE = '| a | b |\n|---|---|\n| 1 | 2 |\n';

/** Counts TableCell mounts: native only fires `onLayout` for new or resized views. */
let mounts = 0;
const DefaultCell = defaultComponents.TableCell;
const components: Components = {
  ...defaultComponents,
  TableCell(props) {
    useEffect(() => {
      mounts += 1;
    }, []);
    return <DefaultCell {...props} />;
  },
};

const cells = (root: Tree) =>
  root.findAll(
    (n) =>
      n.type === 'View' &&
      'borderWidth' in
        ((StyleSheet.flatten(n.props.style) as object | undefined) ?? {})
  );

const hidden = (root: Tree) =>
  JSON.stringify(root.toJSON()).includes('"opacity":0');

/** Native layout: only cells mounted since the last call report. */
let reported = 0;
async function nativeLayOut(root: Tree) {
  const fresh = mounts - reported;
  reported = mounts;
  await act(async () => {
    if (fresh > 0) {
      cells(root).forEach((cell) =>
        cell.props.onLayout?.({ nativeEvent: { layout: { width: 60 } } })
      );
    }
  });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mounts = 0;
  reported = 0;
});
afterEach(() => jest.useRealTimers());

describe('table after an in-place change', () => {
  it('is revealed after a theme change with identical cell sizes', async () => {
    const table = tableFor(SOURCE);
    const root = await renderTree(
      <BlockList
        table={table}
        ctx={createRenderCtx({ components, theme: resolveTheme({}) })}
      />
    );
    await nativeLayOut(root);
    expect(hidden(root)).toBe(false);

    await root.rerender(
      <BlockList
        table={table}
        ctx={createRenderCtx({ components, theme: resolveTheme({}) })}
      />
    );
    await nativeLayOut(root);
    expect(hidden(root)).toBe(false);
  });

  it('is revealed after a content change in the same theme', async () => {
    const ctx = createRenderCtx({ components, theme: resolveTheme({}) });
    const root = await renderTree(
      <BlockList table={tableFor(SOURCE)} ctx={ctx} />
    );
    await nativeLayOut(root);
    await root.rerender(
      <BlockList table={tableFor(SOURCE.replace('1', '9'))} ctx={ctx} />
    );
    await nativeLayOut(root);
    expect(hidden(root)).toBe(false);
  });
});
