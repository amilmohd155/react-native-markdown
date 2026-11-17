/**
 * Pacer (P2b-4, `streamingConfig.smooth`). Jest fake timers drive a clock
 * with 16 ms frames; `Date.now` is faked with them.
 * Spec: docs/rewrite/testing-harness.md#hook-and-scheduler-tests
 */
import { F1 } from '../../../bench/fixtures';
import { targetedCases } from '../../../test/stream/cases';
import { diffDocuments, streamView } from '../../../test/stream/harness';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import type { NodeTable } from '../../model';
import { parseWithMarkdownIt } from '../../parse';
import { createMarkdownPacer, type PacerClock } from '../pacer';
import { FRAME_MS } from '../scheduler';

const html = (t: NodeTable) => documentToHtml(t);
const exact = (source: string) => parseWithMarkdownIt(source).table;

/** Global fake timers; frames are 16 ms timers unless `frames` is false. */
function fakeClock(frames = true): PacerClock {
  const base: PacerClock = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  };
  if (!frames) return base;
  return {
    ...base,
    requestFrame: (cb) => setTimeout(cb, FRAME_MS),
    cancelFrame: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
}

interface Flush {
  readonly at: number;
  readonly table: NodeTable;
}

function setup(strategy: 'raf' | 'timeout' = 'raf', clock = fakeClock()) {
  const flushes: Flush[] = [];
  const start = Date.now();
  const pacer = createMarkdownPacer({
    smoothing: 'hide-incomplete',
    strategy,
    clock,
    onFlush: (table) => flushes.push({ at: Date.now() - start, table }),
  });
  const elapsed = () => Date.now() - start;
  return { pacer, flushes, elapsed };
}

const advance = (ms: number) => jest.advanceTimersByTime(ms);

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

/** About 2 KB of prose with lists, a fence and a table. */
const BURST = Array.from(
  { length: 12 },
  (_, i) =>
    `## Section ${i}\n\nSome words in a paragraph that keeps going for a while, with **bold** and a [link](https://example.com/${i}).\n\n- one item\n- two items\n\n| a | b |\n|---|---|\n| ${i} | x |\n\n\`\`\`js\nconst x = ${i};\n\`\`\`\n\n`
).join('');

describe('pacer: rate', () => {
  it('spreads a 2 KB burst over several frames, at most 1 s behind, then done() is exact', () => {
    expect(BURST.length).toBeGreaterThan(2000);
    const { pacer, flushes } = setup();
    pacer.append(BURST);
    advance(2000);
    expect(pacer.backlog).toBe('');
    expect(flushes.length).toBeGreaterThanOrEqual(8);
    expect(flushes[flushes.length - 1]!.at).toBeLessThanOrEqual(1000);
    // No flush carries more than a quarter of the burst.
    let prev = 0;
    for (const { table } of flushes) {
      expect(table.source.length - prev).toBeLessThan(BURST.length / 4);
      prev = table.source.length;
    }
    pacer.done();
    expect(diffDocuments(pacer.table, exact(BURST))).toBeNull();
  });

  it('never holds text more than 1000 ms behind while input keeps coming', () => {
    const { pacer, flushes } = setup();
    // A long run with no whitespace: only the lag cap can release it.
    const arrivals: { at: number; end: number }[] = [];
    let sent = '';
    for (let i = 0; i < 150; i++) {
      const chunk = i % 10 === 0 ? 'https://x/' : 'abcdefghij';
      sent += chunk;
      pacer.append(chunk);
      arrivals.push({ at: i * 16, end: sent.length });
      advance(16);
    }
    advance(1200);
    for (const { at, end } of arrivals) {
      const out = flushes.find((f) => f.table.source.length >= end);
      expect(out).toBeDefined();
      expect(out!.at - at).toBeLessThanOrEqual(1000 + FRAME_MS);
    }
  });

  it('a steady trickle goes out within a frame of arriving', () => {
    const { pacer, flushes } = setup();
    let sent = '';
    for (let i = 0; i < 40; i++) {
      const chunk = `word${i} `;
      sent += chunk;
      pacer.append(chunk);
      const before = flushes.length;
      advance(16);
      expect(flushes.length).toBe(before + 1);
      expect(pacer.released).toBe(sent);
    }
  });

  it('a trickle that splits words lags by at most the partial word', () => {
    const { pacer } = setup();
    const text = 'the quick brown fox jumps over the lazy dog and runs away ';
    for (let i = 0; i < text.length; i += 3) {
      pacer.append(text.slice(i, i + 3));
      advance(16);
      const sent = text.slice(0, i + 3);
      const lastSpace = sent.lastIndexOf(' ');
      expect(pacer.released).toBe(sent.slice(0, lastSpace + 1));
    }
  });

  it('spreads a chunk over the measured gap between chunks', () => {
    const { pacer, flushes } = setup();
    const chunk = 'lorem ipsum dolor sit amet consectetur '.repeat(4);
    // Learn a 320 ms gap.
    for (let i = 0; i < 6; i++) {
      pacer.append(chunk);
      advance(320);
    }
    const before = flushes.length;
    pacer.append(chunk);
    advance(320);
    // Spread over several frames, not dumped in one.
    expect(flushes.length - before).toBeGreaterThan(5);
    expect(pacer.backlog).toBe('');
  });
});

describe('pacer: word bounds', () => {
  it('never ends a slice inside a word', () => {
    const { pacer, flushes } = setup();
    pacer.append(BURST);
    advance(2000);
    for (const { table } of flushes) {
      const s = table.source;
      expect(/\s$/.test(s) || s === BURST).toBe(true);
    }
  });

  it.each(['- ', '* ', '+ ', '1. ', '# ', '### ', '> ', '> - ', '- [ ] '])(
    'holds the marker %j until its first word',
    (marker) => {
      const { pacer } = setup();
      pacer.append('intro\n\n');
      advance(16);
      pacer.append(marker);
      advance(100);
      expect(pacer.released).toBe('intro\n\n');
      pacer.append('item ');
      advance(16);
      expect(pacer.released).toBe(`intro\n\n${marker}item `);
    }
  );

  it('releases a held word after a 500 ms stall, not before', () => {
    const { pacer, flushes } = setup();
    pacer.append('hello wor');
    advance(16);
    expect(pacer.released).toBe('hello ');
    advance(500 - 16 - 1);
    expect(pacer.released).toBe('hello ');
    advance(1);
    expect(pacer.released).toBe('hello wor');
    expect(flushes).toHaveLength(2);
  });

  it('releases a held marker after a stall', () => {
    const { pacer } = setup();
    pacer.append('text\n\n- ');
    advance(480);
    expect(pacer.released).toBe('text\n\n');
    advance(20);
    expect(pacer.released).toBe('text\n\n- ');
  });

  it('a fence, a link and a table pass through; the view hides a partial row', () => {
    const { pacer, flushes } = setup();
    const text =
      'See [docs](https://example.com/a) now.\n\n```js\nconst a = 1;\n```\n\n| h1 | h2 |\n|----|----|\n| c1 | c2 |\n| c3 ';
    for (let i = 0; i < text.length; i += 7) {
      pacer.append(text.slice(i, i + 7));
      advance(16);
    }
    advance(600);
    for (const { table } of flushes) {
      expect(diffDocuments(table, streamView(table.source))).toBeNull();
    }
    // The partial row `| c3 ` is released after the stall but never shown.
    expect(pacer.released).toBe(text);
    expect(html(pacer.table)).not.toContain('c3');
    expect(html(pacer.table)).toContain('c2');
    pacer.done();
    expect(html(pacer.table)).toBe(html(exact(text)));
  });
});

describe('pacer: lifecycle', () => {
  it('done() with an empty backlog publishes the exact parse at once', () => {
    const { pacer, flushes } = setup();
    pacer.append('a **b');
    advance(600);
    const before = flushes.length;
    pacer.done();
    expect(flushes).toHaveLength(before + 1);
    expect(html(pacer.table)).toBe(html(exact('a **b')));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('done() mid-backlog drains within 200 ms, paced, then is exact', () => {
    const { pacer, flushes, elapsed } = setup();
    pacer.append(BURST);
    advance(32);
    const doneAt = elapsed();
    const before = flushes.length;
    pacer.done();
    expect(flushes).toHaveLength(before); // not instant
    advance(200);
    expect(pacer.backlog).toBe('');
    expect(flushes.length - before).toBeGreaterThan(2);
    expect(flushes[flushes.length - 1]!.at - doneAt).toBeLessThanOrEqual(200);
    expect(diffDocuments(pacer.table, exact(BURST))).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('done() releases a held word and marker at the end', () => {
    const { pacer } = setup();
    pacer.append('one two\n\n- ');
    pacer.done();
    advance(200);
    expect(html(pacer.table)).toBe(html(exact('one two\n\n- ')));
  });

  it('text appended during the drain joins it', () => {
    const { pacer } = setup();
    pacer.append(BURST);
    pacer.done();
    advance(48);
    pacer.append('tail words');
    advance(200);
    expect(html(pacer.table)).toBe(html(exact(BURST + 'tail words')));
  });

  it('append after done() streams on, as without smooth', () => {
    const { pacer } = setup();
    pacer.append('first ');
    pacer.done();
    advance(200);
    pacer.append('second **x');
    advance(600);
    expect(pacer.released).toBe('first second **x');
    expect(html(pacer.table)).not.toContain('<strong>');
  });

  it('reset() mid-backlog drops the backlog and pending work', () => {
    const { pacer, flushes } = setup();
    pacer.append(BURST);
    advance(32);
    pacer.reset('# new');
    expect(pacer.backlog).toBe('');
    expect(jest.getTimerCount()).toBe(0);
    const count = flushes.length;
    advance(2000);
    expect(flushes).toHaveLength(count);
    expect(html(pacer.table)).toBe(html(exact('# new')));
  });

  it('suspend() mid-backlog leaves no timers; resume() continues', () => {
    const { pacer, flushes } = setup();
    pacer.append(BURST);
    advance(32);
    pacer.suspend();
    expect(jest.getTimerCount()).toBe(0);
    const count = flushes.length;
    pacer.append('dropped ');
    advance(2000);
    expect(flushes).toHaveLength(count);
    pacer.resume();
    advance(2000);
    pacer.done();
    expect(html(pacer.table)).toBe(html(exact(BURST)));
  });

  it('a held word sleeps on one timer, not on frames', () => {
    const { pacer } = setup();
    pacer.append('hello wor');
    advance(16);
    expect(jest.getTimerCount()).toBe(1);
    const spy = jest.spyOn(globalThis, 'setTimeout');
    advance(200);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('creating a pacer starts nothing', () => {
    setup();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('pacer: frame source', () => {
  it('without requestFrame, raf falls back to the 16 ms timer', () => {
    const { pacer } = setup('raf', fakeClock(false));
    pacer.append('ab ');
    advance(15);
    expect(pacer.released).toBe('');
    advance(1);
    expect(pacer.released).toBe('ab ');
  });

  it('timeout never requests a frame', () => {
    const clock = fakeClock();
    const requestFrame = jest.fn(clock.requestFrame);
    const { pacer } = setup('timeout', { ...clock, requestFrame });
    pacer.append(BURST);
    advance(2000);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(pacer.backlog).toBe('');
  });

  it('raf uses requestFrame', () => {
    const clock = fakeClock();
    const requestFrame = jest.fn(clock.requestFrame);
    const { pacer } = setup('raf', { ...clock, requestFrame });
    pacer.append('ab ');
    advance(16);
    expect(requestFrame).toHaveBeenCalled();
    expect(pacer.released).toBe('ab ');
  });
});

/* eslint-disable no-bitwise -- PRNG arithmetic */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

describe('pacer: randomized chunking (property)', () => {
  const sources = [
    ...targetedCases.flatMap((c) => (c.parse ? [] : c.sources)),
    F1.slice(0, 3000),
  ];

  it.each([1, 2, 3, 4, 5])(
    'seed %i: every flush is the view of the released prefix',
    (seed) => {
      const next = rng(seed);
      for (const source of sources) {
        const { pacer, flushes } = setup(next() < 0.5 ? 'raf' : 'timeout');
        let i = 0;
        while (i < source.length) {
          const size = 1 + Math.floor(next() * (next() < 0.1 ? 400 : 30));
          pacer.append(source.slice(i, i + size));
          i += size;
          // Random gaps: same task, a frame or two, or a stall.
          const r = next();
          advance(r < 0.3 ? 0 : r < 0.9 ? 16 * Math.ceil(next() * 3) : 600);
        }
        if (next() < 0.5) advance(Math.floor(next() * 300));
        pacer.done();
        advance(250);
        const last = flushes[flushes.length - 1]!.table;
        for (const { table } of flushes.slice(0, -1)) {
          expect(source.startsWith(table.source)).toBe(true);
          const diff = diffDocuments(table, streamView(table.source));
          if (diff)
            throw new Error(
              `${JSON.stringify(source)} @${table.source.length}: ${diff}`
            );
        }
        const diff = diffDocuments(last, exact(source));
        if (diff) throw new Error(`${JSON.stringify(source)} final: ${diff}`);
        expect(jest.getTimerCount()).toBe(0);
      }
    }
  );
});
