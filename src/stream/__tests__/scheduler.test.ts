import { parseWithMarkdownIt } from '../../parse';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import {
  createMarkdownScheduler,
  FRAME_MS,
  type SchedulerClock,
  type SchedulerOptions,
} from '../scheduler';
import type { NodeTable } from '../../model';

interface Entry {
  readonly id: number;
  readonly at: number;
  readonly run: () => void;
  readonly kind: 'timeout' | 'frame';
}

/** Manual clock: time only moves through `advance`. Frames land every 16 ms. */
function createFakeClock(withFrames: boolean) {
  let now = 0;
  let nextId = 1;
  let entries: Entry[] = [];
  const nextFrameAt = () => (Math.floor(now / FRAME_MS) + 1) * FRAME_MS;
  const clock: SchedulerClock = {
    setTimeout(run, ms) {
      const id = nextId++;
      entries.push({ id, at: now + ms, run, kind: 'timeout' });
      return id;
    },
    clearTimeout(handle) {
      entries = entries.filter((e) => e.id !== handle);
    },
    ...(withFrames
      ? {
          requestFrame(run: () => void) {
            const id = nextId++;
            entries.push({ id, at: nextFrameAt(), run, kind: 'frame' });
            return id;
          },
          cancelFrame(handle: unknown) {
            entries = entries.filter((e) => e.id !== handle);
          },
        }
      : {}),
  };
  return {
    clock,
    get now() {
      return now;
    },
    get outstanding() {
      return entries.length;
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = entries
          .filter((e) => e.at <= end)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        entries = entries.filter((e) => e !== due);
        now = due.at;
        due.run();
      }
      now = end;
    },
  };
}

function setup(
  strategy: 'timeout' | 'raf',
  extra: Partial<SchedulerOptions> = {},
  withFrames = true
) {
  const fake = createFakeClock(withFrames);
  const tables: NodeTable[] = [];
  const scheduler = createMarkdownScheduler({
    strategy,
    clock: fake.clock,
    // A 50 ms window keeps the timing arithmetic below readable. The real
    // default (16 ms) is checked on its own: pass `flushIntervalMs: undefined`.
    flushIntervalMs: 50,
    onFlush: (t) => tables.push(t),
    ...extra,
  });
  return { fake, tables, scheduler };
}

const html = (table: NodeTable) => documentToHtml(table);
const htmlOf = (source: string) => html(parseWithMarkdownIt(source).table);

function sharedContract(
  strategy: 'timeout' | 'raf',
  settle: (fake: ReturnType<typeof createFakeClock>) => void
) {
  describe('shared contract', () => {
    it('done() flushes buffered text synchronously and equals a full parse', () => {
      const { fake, tables, scheduler } = setup(strategy);
      const text = '# Title\n\nSome *text* here\n\n- a\n- b\n';
      scheduler.append(text.slice(0, 10));
      scheduler.append(text.slice(10));
      settle(fake); // let whatever is scheduled land first for one case
      scheduler.append('more');
      const before = tables.length;
      const table = scheduler.done();
      expect(tables.length).toBe(before + 1);
      expect(tables[tables.length - 1]).toBe(table);
      expect(scheduler.pending).toBe('');
      expect(html(table)).toBe(htmlOf(text + 'more'));
      expect(fake.outstanding).toBe(0);
    });

    it('done() with text still buffered parses it, no timer left', () => {
      const { fake, scheduler } = setup(strategy);
      scheduler.append('alpha\n\n');
      scheduler.append('beta');
      const table = scheduler.done();
      expect(html(table)).toBe(htmlOf('alpha\n\nbeta'));
      expect(fake.outstanding).toBe(0);
      fake.advance(1000);
      expect(scheduler.flushCount).toBeLessThanOrEqual(1);
    });

    it('done() with nothing buffered still emits a full-parse table', () => {
      const { tables, scheduler } = setup(strategy);
      scheduler.done();
      expect(tables).toHaveLength(1);
      expect(scheduler.table.blockCount).toBe(0);
    });

    it('reset() drops buffered text, cancels pending work and emits', () => {
      const { fake, tables, scheduler } = setup(strategy);
      scheduler.append('one\n\n');
      scheduler.append('two');
      const table = scheduler.reset('fresh');
      expect(scheduler.pending).toBe('');
      expect(fake.outstanding).toBe(0);
      expect(tables[tables.length - 1]).toBe(table);
      expect(html(table)).toBe(htmlOf('fresh'));
      const count = tables.length;
      fake.advance(1000);
      expect(tables).toHaveLength(count);
      scheduler.reset();
      expect(scheduler.table.blockCount).toBe(0);
    });

    it('ignores empty chunks', () => {
      const { fake, tables, scheduler } = setup(strategy);
      scheduler.append('');
      expect(fake.outstanding).toBe(0);
      fake.advance(1000);
      expect(tables).toHaveLength(0);
    });

    it('suspend() cancels pending work but keeps the buffer; resume() flushes it', () => {
      const { fake, tables, scheduler } = setup(strategy);
      scheduler.append('a');
      scheduler.append('b');
      scheduler.suspend();
      expect(fake.outstanding).toBe(0);
      const count = tables.length;
      fake.advance(1000);
      expect(tables).toHaveLength(count);
      const kept = scheduler.pending;
      expect(kept.length).toBeGreaterThan(0);
      scheduler.resume();
      settle(fake);
      expect(scheduler.pending).toBe('');
      expect(scheduler.table.source).toBe('ab');
    });

    it('drops appends while suspended', () => {
      const { fake, tables, scheduler } = setup(strategy);
      scheduler.suspend();
      scheduler.append('lost');
      expect(scheduler.pending).toBe('');
      expect(fake.outstanding).toBe(0);
      scheduler.resume();
      fake.advance(1000);
      expect(tables).toHaveLength(0);
      scheduler.append('kept');
      settle(fake);
      expect(scheduler.table.source).toBe('kept');
    });

    it('resume() with an empty buffer schedules nothing', () => {
      const { fake, scheduler } = setup(strategy);
      scheduler.suspend();
      scheduler.resume();
      expect(fake.outstanding).toBe(0);
    });

    it('flush() flushes buffered text now and is a no-op when empty', () => {
      const { fake, tables, scheduler } = setup(strategy);
      scheduler.flush();
      expect(tables).toHaveLength(0);
      scheduler.append('x');
      scheduler.append('y');
      scheduler.flush();
      expect(scheduler.pending).toBe('');
      expect(fake.outstanding).toBe(0);
      expect(scheduler.table.source).toBe('xy');
    });
  });
}

describe('createMarkdownScheduler · timeout', () => {
  it('flushes the first append at once (leading flush)', () => {
    const { tables, scheduler } = setup('timeout');
    scheduler.append('hello');
    expect(tables).toHaveLength(1);
    expect(scheduler.pending).toBe('');
    expect(html(tables[0]!)).toBe(htmlOf('hello'));
  });

  it('combines appends inside the window into one trailing flush', () => {
    const { fake, tables, scheduler } = setup('timeout');
    scheduler.append('a');
    scheduler.append('b');
    scheduler.append('c');
    expect(tables).toHaveLength(1);
    expect(scheduler.pending).toBe('bc');
    fake.advance(49);
    expect(tables).toHaveLength(1);
    fake.advance(1);
    expect(tables).toHaveLength(2);
    expect(scheduler.pending).toBe('');
    expect(scheduler.table.source).toBe('abc');
    expect(scheduler.flushCount).toBe(2);
  });

  it('goes idle after a quiet window, then flushes the next append at once', () => {
    const { fake, tables, scheduler } = setup('timeout');
    scheduler.append('a');
    fake.advance(50); // window ends, nothing buffered
    expect(fake.outstanding).toBe(0);
    scheduler.append('b');
    expect(tables).toHaveLength(2);
  });

  it('flushes at most once per window across many windows', () => {
    const { fake, tables, scheduler } = setup('timeout');
    // one append every 10 ms for 500 ms
    for (let t = 0; t < 500; t += 10) {
      scheduler.append('x');
      fake.advance(10);
    }
    fake.advance(50);
    // leading flush + one per 50 ms window: far fewer than the 50 appends
    expect(tables.length).toBeLessThanOrEqual(12);
    expect(tables.length).toBeGreaterThanOrEqual(10);
    expect(scheduler.table.source).toBe('x'.repeat(50));
    expect(scheduler.pending).toBe('');
  });

  it('one flush per later window when appends arrive in each', () => {
    const { fake, tables, scheduler } = setup('timeout');
    scheduler.append('a'); // leading, window 1
    fake.advance(50); // quiet end of window 1
    scheduler.append('b'); // leading, window 2
    scheduler.append('c');
    fake.advance(50); // trailing
    scheduler.append('d'); // the trailing flush restarted the window
    expect(tables).toHaveLength(3);
    expect(scheduler.pending).toBe('d');
    fake.advance(50);
    expect(tables).toHaveLength(4);
  });

  it('flushIntervalMs changes the window', () => {
    const { fake, tables, scheduler } = setup('timeout', {
      flushIntervalMs: 120,
    });
    scheduler.append('a');
    scheduler.append('b');
    fake.advance(119);
    expect(tables).toHaveLength(1);
    fake.advance(1);
    expect(tables).toHaveLength(2);
  });

  it('defaults to a 16 ms window', () => {
    const { fake, tables, scheduler } = setup('timeout', {
      flushIntervalMs: undefined,
    });
    scheduler.append('a');
    scheduler.append('b');
    fake.advance(15);
    expect(tables).toHaveLength(1);
    fake.advance(1);
    expect(tables).toHaveLength(2);
    expect(scheduler.table.source).toBe('ab');
  });

  it('trailing flush lands the last chunk', () => {
    const { fake, scheduler } = setup('timeout');
    scheduler.append('a');
    scheduler.append('last');
    fake.advance(50);
    expect(scheduler.table.source).toBe('alast');
  });

  sharedContract('timeout', (fake) => fake.advance(50));
});

describe('createMarkdownScheduler · raf', () => {
  it('waits for the next frame: no leading flush', () => {
    const { fake, tables, scheduler } = setup('raf');
    scheduler.append('hello');
    expect(tables).toHaveLength(0);
    expect(scheduler.pending).toBe('hello');
    fake.advance(FRAME_MS);
    expect(tables).toHaveLength(1);
    expect(html(tables[0]!)).toBe(htmlOf('hello'));
  });

  it('combines many appends in one frame into one flush', () => {
    const { fake, tables, scheduler } = setup('raf');
    for (const c of 'streaming') scheduler.append(c);
    expect(fake.outstanding).toBe(1);
    fake.advance(FRAME_MS);
    expect(tables).toHaveLength(1);
    expect(scheduler.table.source).toBe('streaming');
  });

  it('flushes again on the next frame when more arrives', () => {
    const { fake, tables, scheduler } = setup('raf');
    scheduler.append('a');
    fake.advance(FRAME_MS);
    scheduler.append('b');
    expect(tables).toHaveLength(1);
    fake.advance(FRAME_MS);
    expect(tables).toHaveLength(2);
    expect(scheduler.table.source).toBe('ab');
  });

  it('requests nothing when idle', () => {
    const { fake, scheduler } = setup('raf');
    scheduler.append('a');
    fake.advance(FRAME_MS);
    expect(fake.outstanding).toBe(0);
    fake.advance(1000);
    expect(scheduler.flushCount).toBe(1);
  });

  it('flushes at most once per frame', () => {
    const { fake, tables, scheduler } = setup('raf');
    for (let t = 0; t < 160; t += 4) {
      scheduler.append('x');
      fake.advance(4);
    }
    fake.advance(FRAME_MS);
    expect(tables.length).toBeLessThanOrEqual(11);
    expect(scheduler.table.source).toBe('x'.repeat(40));
  });

  sharedContract('raf', (fake) => fake.advance(FRAME_MS));
});

describe('createMarkdownScheduler · raf without requestFrame', () => {
  it('falls back to setTimeout(16)', () => {
    const { fake, tables, scheduler } = setup('raf', {}, false);
    scheduler.append('a');
    scheduler.append('b');
    fake.advance(FRAME_MS - 1);
    expect(tables).toHaveLength(0);
    fake.advance(1);
    expect(tables).toHaveLength(1);
    expect(scheduler.table.source).toBe('ab');
  });

  it('cancels the fallback timer on suspend and done', () => {
    const { fake, scheduler } = setup('raf', {}, false);
    scheduler.append('a');
    expect(fake.outstanding).toBe(1);
    scheduler.suspend();
    expect(fake.outstanding).toBe(0);
    scheduler.resume();
    scheduler.append('b');
    expect(fake.outstanding).toBe(1);
    scheduler.done();
    expect(fake.outstanding).toBe(0);
  });
});

describe.each(['timeout', 'raf'] as const)(
  'createMarkdownScheduler · smoothing (%s)',
  (strategy) => {
    const flushFirst = (fake: ReturnType<typeof createFakeClock>) =>
      fake.advance(strategy === 'raf' ? FRAME_MS : 0);

    it('publishes the smoothed view per flush and the exact parse from done()', () => {
      const { fake, tables, scheduler } = setup(strategy, {
        smoothing: 'hide-incomplete',
      });
      scheduler.append('hello **bold');
      flushFirst(fake);
      const view = tables[tables.length - 1]!;
      expect(html(view)).not.toContain('bold');
      expect(html(view)).toContain('hello');
      // The view keeps the real source.
      expect(view.source).toBe('hello **bold');

      const table = scheduler.done();
      expect(tables[tables.length - 1]).toBe(table);
      expect(html(table)).toBe(htmlOf('hello **bold'));
      expect(html(table)).toContain('bold');
    });

    it('done() with text still buffered is exact, not the view', () => {
      const { scheduler } = setup(strategy, { smoothing: 'hide-incomplete' });
      scheduler.append('para\n\n');
      scheduler.append('x [label](http');
      expect(html(scheduler.done())).toBe(htmlOf('para\n\nx [label](http'));
    });

    it("'none' equals no smoothing option", () => {
      const a = setup(strategy, { smoothing: 'none' });
      const b = setup(strategy);
      for (const s of [a, b]) {
        s.scheduler.append('hello **bold');
        flushFirst(s.fake);
      }
      expect(html(a.tables[a.tables.length - 1]!)).toBe(
        html(b.tables[b.tables.length - 1]!)
      );
    });
  }
);
