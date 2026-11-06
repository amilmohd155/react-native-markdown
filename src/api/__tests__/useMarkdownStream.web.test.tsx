/// <reference lib="dom" />
import { StrictMode } from 'react';
import { Platform } from 'react-native';
import { act, render } from '@testing-library/react';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import { tableOf } from '../document';
import { parse } from '../parse';
import {
  useMarkdownStream,
  type UseMarkdownStreamOptions,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

/**
 * The hook under react-native-web + jsdom (phase 2 testing harness, Platform
 * tests). On web the default schedule is a 16 ms timer with a leading flush
 * (P2-4), never requestAnimationFrame.
 */
const html = (doc: ReturnType<typeof parse>) => documentToHtml(tableOf(doc));

interface Probe {
  current: UseMarkdownStreamResult;
  renders: number;
}

function setup(options?: UseMarkdownStreamOptions, strict = false) {
  const probe = { renders: 0 } as Probe;
  function Component() {
    probe.current = useMarkdownStream(options);
    probe.renders++;
    return null;
  }
  const view = render(
    strict ? (
      <StrictMode>
        <Component />
      </StrictMode>
    ) : (
      <Component />
    )
  );
  return { probe, unmount: view.unmount };
}

const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useMarkdownStream (react-native-web)', () => {
  it('runs as web', () => {
    expect(Platform.OS).toBe('web');
  });

  it('default schedule: leading flush, then one trailing flush per 16 ms', () => {
    const { probe } = setup();
    act(() => probe.current.append('a'));
    expect(html(probe.current.document)).toContain('a'); // leading
    const before = probe.renders;
    act(() => {
      probe.current.append('b');
      probe.current.append('c');
    });
    advance(15);
    expect(probe.renders).toBe(before);
    advance(1);
    expect(probe.renders - before).toBe(1);
    expect(html(probe.current.document)).toContain('abc');
  });

  it('never uses requestAnimationFrame by default', () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    const { probe } = setup();
    act(() => {
      probe.current.append('a');
      probe.current.append('b');
    });
    advance(100);
    expect(raf).not.toHaveBeenCalled();
    expect(html(probe.current.document)).toContain('ab');
  });

  it('append, done and reset', () => {
    const { probe } = setup();
    expect(probe.current.document.blockCount).toBe(0);
    const source = '# T\n\nsome *text* and a [link](/u)\n\n- a\n- b\n';
    act(() => {
      probe.current.append(source.slice(0, 10));
      probe.current.append(source.slice(10));
      probe.current.done();
    });
    expect(html(probe.current.document)).toBe(html(parse(source)));

    act(() => {
      probe.current.append('stale');
      probe.current.reset('# new');
    });
    advance(1000);
    expect(html(probe.current.document)).toBe(html(parse('# new')));
  });

  it('keeps append, reset and done stable across flushes', () => {
    const { probe } = setup();
    const { append, reset, done } = probe.current;
    act(() => probe.current.append('# Title\n\n'));
    advance(50);
    expect(probe.current.append).toBe(append);
    expect(probe.current.reset).toBe(reset);
    expect(probe.current.done).toBe(done);
  });

  it('StrictMode neither duplicates nor drops text', () => {
    const { probe } = setup(undefined, true);
    act(() => {
      probe.current.append('one ');
      probe.current.append('two ');
    });
    advance(100);
    act(() => probe.current.append('three'));
    advance(100);
    act(() => probe.current.done());
    expect(html(probe.current.document)).toBe(html(parse('one two three')));
  });

  it('unmount cancels the pending flush without warnings', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { probe, unmount } = setup();
    const stream = probe.current;
    act(() => stream.append('first'));
    act(() => stream.append(' second'));
    const renders = probe.renders;
    unmount();
    advance(1000);
    stream.append('third');
    stream.done();
    advance(1000);
    expect(probe.renders).toBe(renders);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
