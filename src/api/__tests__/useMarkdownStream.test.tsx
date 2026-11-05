import { StrictMode, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import { definePlugin } from '../../plugins/definePlugin';
import { tableOf } from '../document';
import { parse } from '../parse';
import {
  useMarkdownStream,
  type UseMarkdownStreamOptions,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

const html = (doc: ReturnType<typeof parse>) => documentToHtml(tableOf(doc));

interface Probe {
  current: UseMarkdownStreamResult;
  renders: number;
}

async function setup(options?: UseMarkdownStreamOptions, strict = false) {
  const probe = { renders: 0 } as Probe;
  function Component({ opts }: { opts?: UseMarkdownStreamOptions }) {
    probe.current = useMarkdownStream(opts);
    probe.renders++;
    return null;
  }
  const element = (opts?: UseMarkdownStreamOptions) =>
    strict ? (
      <StrictMode>
        <Component opts={opts} />
      </StrictMode>
    ) : (
      <Component opts={opts} />
    );
  const view = await render(element(options));
  return {
    probe,
    unmount: () => view.unmount(),
    rerender: (opts?: UseMarkdownStreamOptions) => view.rerender(element(opts)),
  };
}

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/**
 * The schedule under test, through the public options only: an explicit
 * `flushIntervalMs` selects `timeout` on every platform; without it these tests
 * run as iOS, whose default is `raf`.
 */
const optionsFor = (mode: 'timeout' | 'raf'): UseMarkdownStreamOptions =>
  mode === 'timeout' ? { flushIntervalMs: 50 } : {};

describe.each(['timeout', 'raf'] as const)('useMarkdownStream (%s)', (mode) => {
  const options = optionsFor(mode);
  // `timeout` flushes the first chunk at once; `raf` waits for the frame.
  const firstFlush = () => advance(mode === 'raf' ? 16 : 0);

  it('starts with an empty document', async () => {
    const { probe } = await setup(options);
    expect(probe.current.document.blockCount).toBe(0);
  });

  it('keeps append, reset and done stable across renders and flushes', async () => {
    const { probe, rerender } = await setup(options);
    const { append, reset, done } = probe.current;
    await act(async () => probe.current.append('# Title\n\n'));
    await firstFlush();
    await rerender(options);
    expect(probe.current.append).toBe(append);
    expect(probe.current.reset).toBe(reset);
    expect(probe.current.done).toBe(done);
  });

  it('publishes a new document per flush, combining appends in between', async () => {
    const { probe } = await setup(options);
    const initial = probe.current.document;
    await act(async () => {
      probe.current.append('Hello');
    });
    await firstFlush();
    const first = probe.current.document;
    expect(first).not.toBe(initial);
    expect(html(first)).toContain('Hello');

    const before = probe.renders;
    await act(async () => {
      probe.current.append(' wor');
      probe.current.append('ld');
    });
    expect(probe.current.document).toBe(first); // still inside the window / frame
    await advance(50);
    expect(html(probe.current.document)).toContain('Hello world');
    expect(probe.renders - before).toBe(1);
  });

  it('done() flushes at once and equals parse(source)', async () => {
    const { probe } = await setup(options);
    const source = '# T\n\nsome *text* and a [link](/u)\n\n- a\n- b\n';
    await act(async () => {
      probe.current.append(source.slice(0, 10));
      probe.current.append(source.slice(10));
      probe.current.done();
    });
    expect(html(probe.current.document)).toBe(html(parse(source)));
    await advance(1000); // nothing left to flush
    expect(html(probe.current.document)).toBe(html(parse(source)));
  });

  it('reset() drops buffered text and starts over', async () => {
    const { probe } = await setup(options);
    await act(async () => {
      probe.current.append('old');
      probe.current.reset('# new');
    });
    await advance(1000);
    expect(html(probe.current.document)).toBe(html(parse('# new')));
  });

  it('StrictMode neither duplicates nor drops text', async () => {
    const { probe } = await setup(options, true);
    await act(async () => {
      probe.current.append('one ');
      probe.current.append('two ');
    });
    await advance(200);
    await act(async () => {
      probe.current.append('three');
    });
    await advance(200);
    await act(async () => probe.current.done());
    expect(html(probe.current.document)).toBe(html(parse('one two three')));
  });

  it('unmount cancels the pending flush; a later append is a silent no-op', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { probe, unmount } = await setup(options);
    const stream = probe.current;
    await act(async () => {
      stream.append('first');
    });
    await firstFlush();
    await act(async () => {
      stream.append(' second');
    });
    const renders = probe.renders;
    await unmount();
    await advance(1000);
    stream.append('third');
    stream.done();
    await advance(1000);
    expect(probe.renders).toBe(renders);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('useMarkdownStream timing', () => {
  it('timeout: leading flush, then one trailing flush per window', async () => {
    const { probe } = await setup({ flushIntervalMs: 100 });
    await act(async () => probe.current.append('a'));
    expect(html(probe.current.document)).toContain('a'); // leading
    const before = probe.renders;
    await act(async () => {
      probe.current.append('b');
      probe.current.append('c');
    });
    await advance(99);
    expect(probe.renders).toBe(before);
    await advance(1);
    expect(probe.renders).toBe(before + 1);
    expect(html(probe.current.document)).toContain('abc');
  });

  it('raf: no flush before the frame, one per frame after', async () => {
    const { probe } = await setup();
    await act(async () => {
      probe.current.append('a');
      probe.current.append('b');
    });
    expect(probe.current.document.blockCount).toBe(0);
    await advance(16);
    expect(html(probe.current.document)).toContain('ab');
  });
});

/**
 * Frames of exactly 16 ms on the fake clock. Jest's fake `requestAnimationFrame`
 * lands on the next frame boundary of its own clock, so a frame can come sooner
 * than 16 ms after the request.
 */
function installFrames() {
  const raf = jest
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation(
      (cb) => setTimeout(() => cb(0), 16) as unknown as number
    );
  const caf = jest
    .spyOn(globalThis, 'cancelAnimationFrame')
    .mockImplementation((handle) =>
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
    );
  return { raf, caf };
}

describe('useMarkdownStream platform defaults (P2-4)', () => {
  it('iOS and Android: raf, no leading flush, one flush per frame', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { raf } = installFrames();
    const { probe } = await setup();
    expect(raf).not.toHaveBeenCalled();
    await act(async () => probe.current.append('a'));
    expect(probe.current.document.blockCount).toBe(0);
    await advance(15);
    expect(probe.current.document.blockCount).toBe(0);
    await advance(1);
    expect(html(probe.current.document)).toContain('a');
    const before = probe.renders;
    await act(async () => {
      probe.current.append('b');
      probe.current.append('c');
    });
    await advance(16);
    expect(probe.renders - before).toBe(1);
    expect(html(probe.current.document)).toContain('abc');
  });

  it('web: a 16 ms timer, leading flush, trailing flush per window', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const { probe } = await setup();
    await act(async () => probe.current.append('a'));
    expect(html(probe.current.document)).toContain('a'); // leading, no wait
    const before = probe.renders;
    await act(async () => {
      probe.current.append('b');
      probe.current.append('c');
    });
    await advance(15);
    expect(probe.renders).toBe(before);
    await advance(1);
    expect(probe.renders - before).toBe(1);
    expect(html(probe.current.document)).toContain('abc');
  });

  it('web: does not use requestAnimationFrame (a hidden tab throttles it)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const { raf } = installFrames();
    const { probe } = await setup();
    await act(async () => {
      probe.current.append('a');
      probe.current.append('b');
    });
    await advance(100);
    expect(raf).not.toHaveBeenCalled();
    expect(html(probe.current.document)).toContain('ab');
  });

  it('an explicit flushIntervalMs selects the timer on native too', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { raf } = installFrames();
    const { probe } = await setup({ flushIntervalMs: 100 });
    await act(async () => probe.current.append('a'));
    expect(html(probe.current.document)).toContain('a'); // leading flush
    await act(async () => probe.current.append('b'));
    await advance(99);
    expect(html(probe.current.document)).not.toContain('ab');
    await advance(1);
    expect(html(probe.current.document)).toContain('ab');
    expect(raf).not.toHaveBeenCalled();
  });

  it('native raf uses requestAnimationFrame when it exists', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { raf } = installFrames();
    const { probe } = await setup();
    await act(async () => probe.current.append('a'));
    expect(raf).toHaveBeenCalledTimes(1);
    await advance(16);
    expect(html(probe.current.document)).toContain('a');
  });

  it('native raf falls back to a 16 ms timer without requestAnimationFrame', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const raf = globalThis.requestAnimationFrame;
    const caf = globalThis.cancelAnimationFrame;
    Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
    try {
      const { probe } = await setup();
      await act(async () => probe.current.append('a'));
      expect(probe.current.document.blockCount).toBe(0);
      await advance(15);
      expect(probe.current.document.blockCount).toBe(0);
      await advance(1);
      expect(html(probe.current.document)).toContain('a');
    } finally {
      Object.assign(globalThis, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
    }
  });
});

describe.each(['timeout', 'raf'] as const)(
  'useMarkdownStream background catch-up (%s)',
  (mode) => {
    // StrictMode runs the effects, cleans them up, then runs them again. Text
    // appended in the first run is buffered when the cleanup suspends the
    // stream, and the second run must flush it exactly once.
    function Appends({ text }: { text: string }) {
      const stream = useMarkdownStream(optionsFor(mode));
      const sent = useRef(false);
      useEffect(() => {
        if (!sent.current) {
          sent.current = true;
          stream.append(text);
        }
      }, [stream, text]);
      probeRef.current = stream;
      return null;
    }
    const probeRef = {} as { current: UseMarkdownStreamResult };

    it('keeps text buffered before a suspend and flushes it after resume', async () => {
      await render(
        <StrictMode>
          <Appends text="kept text" />
        </StrictMode>
      );
      await advance(200);
      expect(html(probeRef.current.document)).toBe(html(parse('kept text')));
    });

    it('drops appends made while suspended (after unmount)', async () => {
      const view = await render(<Appends text="first" />);
      await advance(200);
      const stream = probeRef.current;
      await view.unmount();
      stream.append(' lost');
      await advance(200);
      expect(html(stream.document)).toBe(html(parse('first')));
    });
  }
);

describe.each(['timeout', 'raf'] as const)(
  'useMarkdownStream smoothing (%s)',
  (mode) => {
    it('shows the view while streaming and the exact parse after done()', async () => {
      const { probe } = await setup({
        ...optionsFor(mode),
        smoothing: 'hide-incomplete',
      });
      await act(async () => probe.current.append('hello **bold'));
      await advance(mode === 'raf' ? 16 : 0);
      expect(html(probe.current.document)).not.toContain('bold');
      await act(async () => probe.current.done());
      expect(html(probe.current.document)).toBe(html(parse('hello **bold')));
    });
  }
);

describe('useMarkdownStream dev warning', () => {
  const pluginA = definePlugin({ name: 'a' });
  const pluginB = definePlugin({ name: 'b' });
  const pluginC = definePlugin({ name: 'c' });

  it('warns once when plugins change', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = await setup({ plugins: [pluginA] });
    await rerender({ plugins: [pluginB] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('useMarkdownStream');
    // A further, different change (and a mixed one) does not warn again.
    await rerender({ plugins: [pluginC] });
    await rerender({ plugins: [pluginC], smoothing: 'hide-incomplete' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns when the preset changes', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = await setup({ preset: 'gfm' });
    await rerender({ preset: 'commonmark' });
    expect(warn).toHaveBeenCalledTimes(1);
    await rerender({ preset: { base: 'gfm', exclude: ['tables'] } });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns when smoothing changes', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = await setup({ smoothing: 'none' });
    await rerender({ smoothing: 'hide-incomplete' });
    expect(warn).toHaveBeenCalledTimes(1);
    await rerender({ smoothing: 'none' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn for an equal inline array', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = await setup({ plugins: [pluginA] });
    await rerender({ plugins: [pluginA] });
    expect(warn).not.toHaveBeenCalled();
  });
});
