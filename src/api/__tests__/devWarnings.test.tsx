/**
 * Dev-only warnings of the owned scroll containers (P3-7): a `scroll` inside
 * another vertical scroller, an unstable `component` type, and a `component`
 * that drops `ref`. Each fires once in the bad case, never in the good one,
 * and never outside development.
 * Spec: docs/rewrite/phase-3/virtualization.md#warnings
 */
import { createRef, type ReactElement } from 'react';
import { FlatList, ScrollView } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderTree, type TestInstance, type Tree } from '../../__tests__/tree';
import { hostComponents } from '../../render/__tests__/helpers';
import { UNSTABLE_COMPONENT_RENDERS } from '../devWarnings';
import { Markdown } from '../Markdown';
import type {
  MarkdownListComponentProps,
  MarkdownListRef,
  MarkdownScrollComponentProps,
  ScrollOptions,
  VirtualizeOptions,
} from '../scrollOptions';

const g = globalThis as { __DEV__?: unknown };
const components = hostComponents();
const WINDOW_TALL = 20000; // taller than any test window

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  g.__DEV__ = true;
});

type Containers =
  | { readonly scroll: true | ScrollOptions }
  | { readonly virtualize: true | VirtualizeOptions };

const element = (props: Containers): ReactElement =>
  'scroll' in props ? (
    <Markdown
      source="Some text."
      components={components}
      scroll={props.scroll}
    />
  ) : (
    <Markdown
      source="Some text."
      components={components}
      virtualize={props.virtualize}
    />
  );

function rootOf(tree: Tree): TestInstance {
  const [root] = tree.container.children;
  if (typeof root !== 'object') throw new Error('no root element');
  return root;
}

async function fire(host: TestInstance, name: string, ...args: unknown[]) {
  await act(async () => {
    (host.props as Record<string, (...a: unknown[]) => void>)[name]!(...args);
  });
}

/** What a device reports once the scroll view is laid out. */
async function laidOut(host: TestInstance, frame: number, content: number) {
  await fire(host, 'onLayout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: frame } },
  });
  await fire(host, 'onContentSizeChange', 300, content);
}

const warnings = () => warn.mock.calls.map((call) => String(call[0]));

describe('nested scroller (scroll)', () => {
  it('warns once when the view is as tall as its content, above the window', async () => {
    const tree = await renderTree(element({ scroll: true }));
    const root = rootOf(tree);
    await laidOut(root, WINDOW_TALL, WINDOW_TALL);
    await laidOut(root, WINDOW_TALL + 100, WINDOW_TALL + 100);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(
      /^\[react-native-markdown\] <Markdown scroll>/
    );
  });

  it('is silent for a bounded container with taller content', async () => {
    const tree = await renderTree(element({ scroll: true }));
    await laidOut(rootOf(tree), 600, WINDOW_TALL);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent when short content fills its own height', async () => {
    const tree = await renderTree(element({ scroll: true }));
    await laidOut(rootOf(tree), 300, 300);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the follow-tail handlers working', async () => {
    const tree = await renderTree(element({ scroll: { autoScroll: true } }));
    const root = rootOf(tree);
    await laidOut(root, WINDOW_TALL, WINDOW_TALL);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('adds no handlers outside development, and never warns', async () => {
    g.__DEV__ = false;
    const tree = await renderTree(element({ scroll: true }));
    const root = rootOf(tree);
    expect(root.props.onLayout).toBeUndefined();
    expect(root.props.onContentSizeChange).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('is not checked for virtualize, where React Native warns itself', async () => {
    const tree = await renderTree(element({ virtualize: true }));
    const root = rootOf(tree);
    await laidOut(root, WINDOW_TALL, WINDOW_TALL);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('unstable component type', () => {
  /** A fresh component type per call: what an inline `component` is. */
  const fresh = () => (props: MarkdownScrollComponentProps) => (
    <ScrollView {...props} />
  );
  const stable = (props: MarkdownScrollComponentProps) => (
    <ScrollView {...props} />
  );

  it('warns once when the type changes on every render', async () => {
    const tree = await renderTree(element({ scroll: { component: fresh() } }));
    for (let i = 0; i < UNSTABLE_COMPONENT_RENDERS + 3; i++) {
      await tree.rerender(element({ scroll: { component: fresh() } }));
    }
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('scroll.component changes on every render');
  });

  it('warns for virtualize too', async () => {
    const list = () => (props: MarkdownListComponentProps) => (
      <FlatList {...props} />
    );
    const tree = await renderTree(
      element({ virtualize: { component: list() } })
    );
    for (let i = 0; i < UNSTABLE_COMPONENT_RENDERS; i++) {
      await tree.rerender(element({ virtualize: { component: list() } }));
    }
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('virtualize.component');
  });

  it('is silent for a stable type', async () => {
    const tree = await renderTree(element({ scroll: { component: stable } }));
    for (let i = 0; i < 6; i++) {
      await tree.rerender(element({ scroll: { component: stable } }));
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent for one or two legitimate switches', async () => {
    const other = fresh();
    const tree = await renderTree(element({ scroll: { component: stable } }));
    await tree.rerender(element({ scroll: { component: other } }));
    await tree.rerender(element({ scroll: { component: other } }));
    await tree.rerender(element({ scroll: { component: stable } }));
    await tree.rerender(element({ scroll: { component: stable } }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent outside development', async () => {
    g.__DEV__ = false;
    const tree = await renderTree(element({ scroll: { component: fresh() } }));
    for (let i = 0; i < 6; i++) {
      await tree.rerender(element({ scroll: { component: fresh() } }));
    }
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('component that drops ref', () => {
  const dropsRef = ({ ref: _ref, ...props }: MarkdownScrollComponentProps) => (
    <ScrollView {...props} />
  );
  const forwards = (props: MarkdownScrollComponentProps) => (
    <ScrollView {...props} />
  );
  const dropsListRef = ({
    ref: _ref,
    ...props
  }: MarkdownListComponentProps) => <FlatList {...props} />;

  it('warns once with autoScroll', async () => {
    const tree = await renderTree(
      element({ scroll: { component: dropsRef, autoScroll: true } })
    );
    await tree.rerender(
      element({ scroll: { component: dropsRef, autoScroll: true } })
    );
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(
      /^\[react-native-markdown\] scroll\.component did not give/
    );
  });

  it('warns with ref, and with componentRef, and for virtualize', async () => {
    const ref = createRef<MarkdownListRef>();
    await renderTree(element({ scroll: { component: dropsRef, ref } }));
    expect(warn).toHaveBeenCalledTimes(1);
    await renderTree(
      element({
        scroll: { component: dropsRef, componentRef: createRef<unknown>() },
      })
    );
    expect(warn).toHaveBeenCalledTimes(2);
    await renderTree(
      element({ virtualize: { component: dropsListRef, autoScroll: true } })
    );
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warnings()[2]).toContain('virtualize.component');
  });

  it('is silent when the component forwards ref', async () => {
    await renderTree(
      element({
        scroll: {
          component: forwards,
          autoScroll: true,
          ref: createRef<MarkdownListRef>(),
          componentRef: createRef<unknown>(),
        },
      })
    );
    await renderTree(element({ scroll: { autoScroll: true } }));
    await renderTree(element({ virtualize: { autoScroll: true } }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent when nothing needs the ref', async () => {
    await renderTree(element({ scroll: { component: dropsRef } }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent outside development', async () => {
    g.__DEV__ = false;
    await renderTree(
      element({ scroll: { component: dropsRef, autoScroll: true } })
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
