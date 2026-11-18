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
 * The default schedule under test (P2-4): `timeout` is the web default, `raf`
 * the iOS default. Restored by `jest.restoreAllMocks`.
 */
const selectSchedule = (mode: 'timeout' | 'raf') =>
  jest.replaceProperty(Platform, 'OS', mode === 'timeout' ? 'web' : 'ios');

describe.each(['timeout', 'raf'] as const)('useMarkdownStream (%s)', (mode) => {
  beforeEach(() => selectSchedule(mode));
  // `timeout` flushes the first chunk at once; `raf` waits for the frame.
  const firstFlush = () => advance(mode === 'raf' ? 16 : 0);

  it('starts with an empty document', async () => {
    const { probe } = await setup();
    expect(probe.current.document.blockCount).toBe(0);
  });

  it('keeps append, reset and done stable across renders and flushes', async () => {
    const { probe, rerender } = await setup();
    const { append, reset, done } = probe.current;
    await act(async () => probe.current.append('# Title\n\n'));
    await firstFlush();
    await rerender();
    expect(probe.current.append).toBe(append);
    expect(probe.current.reset).toBe(reset);
    expect(probe.current.done).toBe(done);
  });

  it('publishes a new document per flush, combining appends in between', async () => {
    const { probe } = await setup();
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
    await advance(16);
    expect(html(probe.current.document)).toContain('Hello world');
    expect(probe.renders - before).toBe(1);
  });

  it('done() flushes at once and equals parse(source)', async () => {
    const { probe } = await setup();
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
    const { probe } = await setup();
    await act(async () => {
      probe.current.append('old');
      probe.current.reset('# new');
    });
    await advance(1000);
    expect(html(probe.current.document)).toBe(html(parse('# new')));
  });

  it('StrictMode neither duplicates nor drops text', async () => {
    const { probe } = await setup(undefined, true);
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
    const { probe, unmount } = await setup();
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
    jest.replaceProperty(Platform, 'OS', 'web');
    const { probe } = await setup();
    await act(async () => probe.current.append('a'));
    expect(html(probe.current.document)).toContain('a'); // leading
    const before = probe.renders;
    await act(async () => {
      probe.current.append('b');
      probe.current.append('c');
    });
    await advance(15);
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
    beforeEach(() => selectSchedule(mode));
    // StrictMode runs the effects, cleans them up, then runs them again. Text
    // appended in the first run is buffered when the cleanup suspends the
    // stream, and the second run must flush it exactly once.
    function Appends({ text }: { text: string }) {
      const stream = useMarkdownStream();
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
  'useMarkdownStream hides unfinished syntax (%s)',
  (mode) => {
    beforeEach(() => selectSchedule(mode));
    it('shows the view while streaming and the exact parse after done()', async () => {
      const { probe } = await setup();
      await act(async () => probe.current.append('hello **bold'));
      await advance(mode === 'raf' ? 16 : 0);
      expect(html(probe.current.document)).not.toContain('bold');
      await act(async () => probe.current.done());
      expect(html(probe.current.document)).toBe(html(parse('hello **bold')));
    });

    it('holds a table header until its delimiter row, and drops a partial row', async () => {
      const { probe } = await setup();
      const step = async (chunk: string) => {
        await act(async () => probe.current.append(chunk));
        // Past one window or frame: one flush per step.
        await advance(100);
        return html(probe.current.document);
      };
      expect(await step('| a | b |\n|---|')).toBe('');
      expect(await step('---|\n| 1 | **2')).toBe(
        html(parse('| a | b |\n|---|---|\n'))
      );
      expect(await step(' |\n| 3')).toBe(
        html(parse('| a | b |\n|---|---|\n| 1 | **2 |\n'))
      );
      await act(async () => probe.current.done());
      expect(html(probe.current.document)).toBe(
        html(parse('| a | b |\n|---|---|\n| 1 | **2 |\n| 3'))
      );
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
    await rerender({ plugins: [pluginC], preset: 'commonmark' });
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

  it('does not warn for an equal inline array', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = await setup({ plugins: [pluginA] });
    await rerender({ plugins: [pluginA] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('compares streamingConfig.animation by value (P2b-5)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = await setup({
      streamingConfig: { animation: { type: 'fade' } },
    });
    // The same fade, written three ways: no warning.
    await rerender({ streamingConfig: { animation: { type: 'fade' } } });
    await rerender({ streamingConfig: { animation: 'fade' } });
    await rerender({
      streamingConfig: { animation: { type: 'fade', duration: 200 } },
    });
    expect(warn).not.toHaveBeenCalled();
    await rerender({
      streamingConfig: { animation: { type: 'fade', duration: 300 } },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('streamingConfig');
  });

  it("warns when animation changes from 'none' to 'fade'", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = await setup({ streamingConfig: {} });
    await rerender({ streamingConfig: { animation: 'none' } });
    expect(warn).not.toHaveBeenCalled();
    await rerender({ streamingConfig: { animation: 'fade' } });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('useMarkdownStream streamingConfig.smooth (P2b-4)', () => {
  const smooth: UseMarkdownStreamOptions = {
    streamingConfig: { smooth: true },
  };
  const burst = Array.from(
    { length: 40 },
    (_, i) => `Sentence number ${i} has a few **words** in it.\n\n`
  ).join('');

  it.each(['ios', 'web'] as const)(
    '%s: paces a burst over several flushes, then done() drains and is exact',
    async (os) => {
      jest.replaceProperty(Platform, 'OS', os);
      const { raf } = installFrames();
      const { probe } = await setup(smooth);
      const { append, reset, done } = probe.current;
      const before = probe.renders;
      await act(async () => probe.current.append(burst));
      // One act per frame, so each release renders on its own.
      for (let i = 0; i < 3; i++) await advance(16);
      const shown = html(probe.current.document);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown).not.toBe(html(parse(burst)));
      await act(async () => probe.current.done());
      for (let i = 0; i < 13; i++) await advance(16);
      expect(html(probe.current.document)).toBe(html(parse(burst)));
      expect(probe.renders - before).toBeGreaterThan(6);
      // Native frames come from requestAnimationFrame; web never uses it.
      if (os === 'web') expect(raf).not.toHaveBeenCalled();
      else expect(raf).toHaveBeenCalled();
      expect(probe.current.append).toBe(append);
      expect(probe.current.reset).toBe(reset);
      expect(probe.current.done).toBe(done);
    }
  );

  it('releases once per frame: no leading flush', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { raf } = installFrames();
    const { probe } = await setup(smooth);
    await act(async () => probe.current.append('hello there '));
    expect(probe.current.document.blockCount).toBe(0); // no leading flush
    await advance(16);
    expect(html(probe.current.document)).toContain('hello');
    expect(raf).toHaveBeenCalled();
  });

  it('holds a partial word until the next space', async () => {
    const { probe } = await setup(smooth);
    await act(async () => probe.current.append('hello wor'));
    await advance(100);
    expect(html(probe.current.document)).toBe(html(parse('hello')));
    await act(async () => probe.current.append('ld '));
    await advance(16);
    expect(html(probe.current.document)).toBe(html(parse('hello world')));
  });

  it('reads the option once: turning smooth off later keeps pacing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { probe, rerender } = await setup(smooth);
    await rerender({ streamingConfig: { smooth: true } }); // equal inline object
    expect(warn).not.toHaveBeenCalled();
    await rerender({ streamingConfig: { smooth: false } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('streamingConfig');
    await act(async () => probe.current.append('one two'));
    await advance(100);
    expect(html(probe.current.document)).toBe(html(parse('one'))); // still paced
  });

  it('reset() mid-backlog drops the backlog', async () => {
    const { probe } = await setup(smooth);
    await act(async () => probe.current.append(burst));
    await advance(32);
    await act(async () => probe.current.reset('# new'));
    await advance(2000);
    expect(html(probe.current.document)).toBe(html(parse('# new')));
  });

  it('StrictMode neither duplicates nor drops text', async () => {
    const { probe } = await setup(smooth, true);
    await act(async () => {
      probe.current.append('one ');
      probe.current.append('two ');
    });
    await advance(200);
    await act(async () => probe.current.append('three'));
    await act(async () => probe.current.done());
    await advance(200);
    expect(html(probe.current.document)).toBe(html(parse('one two three')));
  });

  it('unmount mid-backlog cancels its frame and updates no state', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    let unmounted = false;
    let firedAfterUnmount = 0;
    const pending = new Set<number>();
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      const handle = setTimeout(() => {
        pending.delete(handle as unknown as number);
        if (unmounted) firedAfterUnmount++;
        cb(0);
      }, 16) as unknown as number;
      pending.add(handle);
      return handle;
    });
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((h) => {
      pending.delete(h as number);
      clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
    });
    const { probe, unmount } = await setup(smooth);
    const stream = probe.current;
    await act(async () => stream.append(burst));
    await advance(32);
    stream.done();
    expect(pending.size).toBe(1); // the pacer's next frame
    const renders = probe.renders;
    await unmount();
    unmounted = true;
    expect(pending.size).toBe(0);
    await advance(2000);
    stream.append('more');
    stream.done();
    await advance(2000);
    expect(firedAfterUnmount).toBe(0);
    expect(probe.renders).toBe(renders);
    expect(error).not.toHaveBeenCalled();
  });
});
