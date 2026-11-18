import { act } from 'react';
import { AccessibilityInfo } from 'react-native';
import { renderTree } from '../../__tests__/tree';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import {
  createFootnoteFocusStore,
  footnoteFocusKey,
  type FootnoteFocusConfig,
  type FootnoteFocusStore,
} from '../footnoteFocus';
import { tableFor } from './helpers';

const DOC = 'a[^1] b[^1]\n\nmore\n\n[^1]: First.\n';

function ctxWith(focus: FootnoteFocusConfig | null) {
  return createRenderCtx({
    components: defaultComponents,
    handlers: { onFootnotePress: () => {} },
    footnoteFocus: focus,
  });
}

const config = (
  store: FootnoteFocusStore,
  over: Partial<FootnoteFocusConfig> = {}
): FootnoteFocusConfig => ({
  store,
  target: 'definition',
  highlight: { color: '#ff0', duration: 1000 },
  ...over,
});

const mount = (focus: FootnoteFocusConfig | null) =>
  renderTree(<BlockList table={tableFor(DOC)} ctx={ctxWith(focus)} />);

const flush = () => act(async () => {});

const reduceMotion = (on: boolean) =>
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('footnote focus store', () => {
  it('keeps definition ys and notifies on set, not on forget', () => {
    const store = createFootnoteFocusStore();
    const seen: string[] = [];
    store.onDefinitionY((l) => seen.push(l));
    store.setDefinitionY('a', 10);
    expect(store.getDefinitionY('a')).toBe(10);
    store.setDefinitionY('a', undefined);
    expect(store.getDefinitionY('a')).toBeUndefined();
    expect(seen).toEqual(['a']);
  });

  it('gives a new token to each flash and 0 to other keys', () => {
    const store = createFootnoteFocusStore();
    const key = footnoteFocusKey({ kind: 'definition', label: 'a' });
    store.flash({ kind: 'definition', label: 'a' });
    const first = store.getFlashToken(key);
    store.flash({ kind: 'definition', label: 'a' });
    expect(store.getFlashToken(key)).not.toBe(first);
    expect(store.getFlashToken('d:b')).toBe(0);
    store.clear();
    expect(store.getFlashToken(key)).toBe(0);
  });
});

describe('definition layout reporting', () => {
  it('reports y on layout and forgets on unmount', async () => {
    const store = createFootnoteFocusStore();
    const root = await mount(config(store));
    const frame = root.find(
      (n) => n.type === 'View' && typeof n.props.onLayout === 'function'
    );
    expect(frame.props.collapsable).toBe(false);
    await act(async () => {
      frame.props.onLayout({ nativeEvent: { layout: { y: 42 } } });
    });
    expect(store.getDefinitionY('1')).toBe(42);
    await root.unmount();
    expect(store.getDefinitionY('1')).toBeUndefined();
  });

  it('adds no wrapper without a focus config or with target section', async () => {
    for (const focus of [
      null,
      config(createFootnoteFocusStore(), { target: 'section' }),
    ]) {
      const root = await mount(focus);
      expect(
        root.findAll(
          (n) => n.type === 'View' && typeof n.props.onLayout === 'function'
        )
      ).toHaveLength(0);
    }
  });
});

describe('flash', () => {
  const colored = (root: Awaited<ReturnType<typeof mount>>) =>
    JSON.stringify(root.toJSON()).includes('backgroundColor');

  it('renders no background with no config', async () => {
    const root = await mount(null);
    expect(colored(root)).toBe(false);
  });

  it('animates a background and restarts on a new token', async () => {
    reduceMotion(false);
    const store = createFootnoteFocusStore();
    const root = await mount(config(store));
    expect(colored(root)).toBe(false);
    await act(async () => store.flash({ kind: 'definition', label: '1' }));
    await flush();
    expect(colored(root)).toBe(true);
    const before = store.getFlashToken('d:1');
    await act(async () => store.flash({ kind: 'definition', label: '1' }));
    await flush();
    expect(store.getFlashToken('d:1')).not.toBe(before);
    expect(colored(root)).toBe(true);
  });

  it('flashes one reference, by label and number', async () => {
    reduceMotion(false);
    const store = createFootnoteFocusStore();
    const root = await mount(config(store));
    await act(async () =>
      store.flash({ kind: 'reference', label: '1', reference: 2 })
    );
    await flush();
    const styled = root
      .findAll((n) => n.type === 'Text' && n.props.accessibilityRole === 'link')
      .filter((n) => JSON.stringify(n.props.style).includes('backgroundColor'));
    expect(styled).toHaveLength(1);
  });

  it('shows the colour statically with Reduce Motion, then removes it', async () => {
    jest.useFakeTimers();
    reduceMotion(true);
    const store = createFootnoteFocusStore();
    const root = await mount(config(store));
    await act(async () => store.flash({ kind: 'definition', label: '1' }));
    await flush();
    expect(JSON.stringify(root.toJSON())).toContain('"backgroundColor":"#ff0"');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(JSON.stringify(root.toJSON())).not.toContain('#ff0');
  });

  it('marks a flashing definition focusable for the screen reader', async () => {
    jest.useFakeTimers();
    reduceMotion(true);
    jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockResolvedValue(true);
    const store = createFootnoteFocusStore();
    const root = await mount(config(store, { highlight: null }));
    const accessible = () =>
      root.findAll((n) => n.type === 'View' && n.props.accessible === true);
    expect(accessible()).toHaveLength(0);
    await act(async () => store.flash({ kind: 'definition', label: '1' }));
    await flush();
    expect(accessible()).toHaveLength(1);
  });
});
