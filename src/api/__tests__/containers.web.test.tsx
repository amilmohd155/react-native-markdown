/// <reference lib="dom" />
/**
 * `scroll` and `virtualize` under react-native-web (#51, D1): they render
 * and stream, and follow-tail works with react-native-web's events. Those
 * come from DOM `scroll` events and `ResizeObserver` (layout), and there are
 * no drag or momentum events at all, so pausing rests on the rule in
 * scrollControl.ts: an upward move with no content shrink is the user.
 *
 * jsdom has no layout, so this file fakes the browser's part: a
 * `ResizeObserver` the test triggers, `offsetHeight` / `scrollHeight` /
 * `scrollTop` per element, and `element.scroll()` that clamps like a
 * browser and fires `scroll` on the next task. Everything above that (RNW's
 * ScrollView, its VirtualizedList, its scroll event throttle) is real. Not
 * proven: a real browser's event timing, smooth scrolling, wheel and touch
 * input, or real text layout.
 */
import { act, fireEvent, render } from '@testing-library/react';
import { useEffect } from 'react';
import { Markdown } from '../Markdown';
import type { ScrollOptions } from '../scrollOptions';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

// -- A fake browser layout ----------------------------------------------------

const offsetHeights = new Map<Element, number>();
const scrollHeights = new Map<Element, number>();
const scrollTops = new Map<Element, number>();
/** `element.scroll()` calls: the target `top` asked for. */
const scrollCalls: number[] = [];

type ResizeCallback = (entries: { target: Element }[]) => void;
let onResize: ResizeCallback | null = null;
const observed = new Set<Element>();

class FakeResizeObserver {
  constructor(callback: ResizeCallback) {
    onResize = callback;
  }
  observe(node: Element) {
    observed.add(node);
  }
  unobserve(node: Element) {
    observed.delete(node);
  }
  disconnect() {
    observed.clear();
  }
}

const maxTop = (node: Element) =>
  Math.max(0, (scrollHeights.get(node) ?? 0) - (offsetHeights.get(node) ?? 0));

const descriptors: [string, PropertyDescriptor][] = [
  [
    'offsetHeight',
    {
      configurable: true,
      get(this: Element) {
        return offsetHeights.get(this) ?? 0;
      },
    },
  ],
  [
    'scrollHeight',
    {
      configurable: true,
      get(this: Element) {
        return scrollHeights.get(this) ?? 0;
      },
    },
  ],
  [
    'scrollTop',
    {
      configurable: true,
      get(this: Element) {
        return scrollTops.get(this) ?? 0;
      },
      set(this: Element, value: number) {
        scrollTops.set(this, Math.min(Math.max(0, value), maxTop(this)));
      },
    },
  ],
  [
    'scroll',
    {
      configurable: true,
      writable: true,
      value(this: HTMLElement, options: { top?: number }) {
        scrollCalls.push(options.top ?? 0);
        this.scrollTop = options.top ?? 0;
        // A browser fires `scroll` asynchronously.
        setTimeout(() => fireEvent.scroll(this), 0);
      },
    },
  ],
];
const saved = descriptors.map(
  ([name]) =>
    [
      name,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
    ] as const
);

beforeAll(() => {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver =
    FakeResizeObserver;
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
});
afterAll(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[
        name
      ];
  }
});

/** Lets the browser report `targets`' new sizes (ResizeObserver → onLayout). */
async function resize(...targets: Element[]) {
  await act(async () => {
    onResize?.(
      targets.filter((n) => observed.has(n)).map((target) => ({ target }))
    );
  });
  // RNW measures on a timer, and a scroll it causes fires on the next task.
  await advance(1);
  await advance(1);
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

// -- The streamed document ----------------------------------------------------

type Mode = 'scroll' | 'virtualize';
const probe = {} as { current: UseMarkdownStreamResult };
const componentRef = { current: null as unknown };

function Streamed({ mode, options }: { mode: Mode; options: ScrollOptions }) {
  const stream = useMarkdownStream({ flushIntervalMs: 50 });
  useEffect(() => {
    probe.current = stream;
  });
  const all = { ...options, componentRef };
  return (
    <Markdown
      document={stream.document}
      {...(mode === 'scroll'
        ? { scroll: all }
        : { virtualize: { ...all, initialNumToRender: 1000 } })}
    />
  );
}

const SOURCE = [
  '# Streamed on the web',
  'A paragraph with *emphasis* and `code`.',
  '- one\n- two\n- three',
  '```js\nconst web = true;\n```',
  '| a | b |\n|---|---|\n| 1 | 2 |',
  'The last paragraph, which keeps growing for a while longer.',
].join('\n\n');

const CHUNK = 4;
const chunks = () => {
  const out: string[] = [];
  for (let i = 0; i < SOURCE.length; i += CHUNK) {
    out.push(SOURCE.slice(i, i + CHUNK));
  }
  return out;
};

const VIEWPORT = 300;

/** The scroll node and its content container, as RNW renders them. */
function nodes() {
  const instance = componentRef.current as {
    getScrollableNode(): HTMLElement;
  };
  const node = instance.getScrollableNode();
  return { node, content: node.firstElementChild as HTMLElement };
}

/** Content height for the text so far: grows with it. */
const heightFor = (text: string) => 100 + text.length * 2;

/** Appends `chunk`, flushes, and reports the new content height. */
async function flush(chunk: string, height: number) {
  await act(async () => probe.current.append(chunk));
  await advance(60);
  const { node, content } = nodes();
  offsetHeights.set(content, height);
  scrollHeights.set(node, height);
  await resize(content);
}

/** The user moves the scroll position (wheel, scrollbar): no drag events. */
async function userScrollTo(top: number) {
  const { node } = nodes();
  await advance(20); // past RNW's scroll event throttle
  node.scrollTop = top;
  fireEvent.scroll(node);
  await advance(1);
}

beforeEach(() => {
  jest.useFakeTimers();
  scrollCalls.length = 0;
  componentRef.current = null;
});
afterEach(() => {
  jest.useRealTimers();
});

describe.each(['scroll', 'virtualize'] as const)(
  '%s on react-native-web',
  (mode) => {
    it('streams: the text is current after every flush', async () => {
      const { container } = render(<Streamed mode={mode} options={{}} />);
      const reference = render(<Markdown source="" />);
      let text = '';
      for (const chunk of chunks()) {
        text += chunk;
        await act(async () => probe.current.append(chunk));
        await advance(60);
        reference.rerender(<Markdown source={text} />);
        expect(container.textContent).toBe(reference.container.textContent);
      }
      expect(container.textContent).toContain(
        'keeps growing for a while longer.'
      );
      // Without autoScroll the library never scrolls.
      expect(scrollCalls).toEqual([]);
    });

    it('follows the tail, pauses on an upward scroll, resumes at the end', async () => {
      render(<Streamed mode={mode} options={{ autoScroll: true }} />);
      await act(async () => {});
      const { node } = nodes();
      offsetHeights.set(node, VIEWPORT);
      await resize(node);

      const pieces = chunks();
      let text = '';
      let i = 0;
      const next = async () => {
        text += pieces[i++]!;
        await flush(pieces[i - 1]!, heightFor(text));
      };

      // Following: each growth past the viewport lands at the end, once.
      let overflowing = 0;
      for (let n = 0; n < 40; n++) {
        await next();
        if (heightFor(text) > VIEWPORT) overflowing++;
      }
      const following = scrollCalls.length;
      expect(overflowing).toBeGreaterThan(10);
      expect(following).toBe(overflowing);
      expect(node.scrollTop).toBe(maxTop(node));

      // A wheel up: no drag event on the web, an upward move with no shrink.
      await userScrollTo(50);
      for (let n = 0; n < 10; n++) await next();
      expect(scrollCalls).toHaveLength(following);
      expect(node.scrollTop).toBe(50);

      // Back to the end (within the threshold): following again.
      await userScrollTo(maxTop(node) - 10);
      await next();
      expect(scrollCalls.length).toBeGreaterThan(following);
      expect(node.scrollTop).toBe(maxTop(node));
    });

    it('keeps following when the content shrinks and the browser clamps', async () => {
      render(<Streamed mode={mode} options={{ autoScroll: true }} />);
      await act(async () => {});
      const { node, content } = nodes();
      offsetHeights.set(node, VIEWPORT);
      await resize(node);
      await flush('# Title\n\nSome text that is long enough.', 1000);
      expect(node.scrollTop).toBe(700);

      // Shrinks: the browser clamps scrollTop and fires `scroll` (an upward
      // move, but the content shrank: not the user).
      offsetHeights.set(content, 800);
      scrollHeights.set(node, 800);
      node.scrollTop = node.scrollTop; // clamp to 500
      await advance(20);
      fireEvent.scroll(node);
      await resize(content);
      expect(node.scrollTop).toBe(500);

      const calls = scrollCalls.length;
      await flush(' More.', 900);
      expect(scrollCalls.length).toBe(calls + 1);
      expect(node.scrollTop).toBe(600);
    });
  }
);
