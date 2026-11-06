// Phase 2 S0 (#29): streaming cost spike.
// Spec: docs/rewrite/phase-2/{work-breakdown,benchmark-protocol,stream-algorithm}.md
//
// Streams a document through the real markdown-it parser and token → node
// table converter, one strategy at a time, and prints the total flush cost as
// a multiple of ONE full parse() of the finished text (the `streamCost` metric).
//
//   yarn stream                 # JIT
//   yarn stream:jitless         # no JIT: the number S0 decides on
//   node --jitless --import tsx stream.mjs [runs] [--text file] [--rate N] [--sizes 1,2,20,195]
//
// Strategies
//   naive          full parse per flush (the baseline the criterion is relative to)
//   tail           tail re-parse (from the last top-level block's start), one flush per chunk
//   tail+frame     tail re-parse, at most one flush per 16 ms frame
//   tail+adaptive  tail re-parse, minimum flush interval = ADAPT_RATIO x the last flush cost
//                  (at least a frame, capped at ADAPT_CAP_MS)
//   tail+fence     tail + frame, and appends to an open top-level fenced block without re-parsing
//
// Arrival is simulated on a virtual clock: `--rate` characters per second
// (default 1250, i.e. F4a: 20-char chunks every 16 ms). Flushes advance the
// clock by their real measured cost, as they would block the JS thread.
//
// Not included yet: the splice of the tail onto the stable prefix (S1) and
// React commit time. Conversion is included. `done()` (the final full parse)
// is reported separately, not in `streamCost`.

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { getParser } from '../src/parse/markdownIt.ts';
import { convertTokens } from '../src/parse/convert.ts';
import { resolvePreset } from '../src/plugins/presets.ts';
import { F2 } from './fixtures/index.ts';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const rate = Number(flag('rate', 1250)); // chars per second
const sizes = flag('sizes', '1,2,20,195').split(',').map(Number);
const textFile = flag('text', null);
const transcriptFile = flag('transcript', null); // SYNTHETIC [{t,text}] replay
const transcript = transcriptFile
  ? JSON.parse(readFileSync(transcriptFile, 'utf8'))
  : null;
const text = transcript
  ? transcript.map((c) => c.text).join('')
  : textFile
    ? readFileSync(textFile, 'utf8')
    : F2;
const WINDOWS = [0, 16, 33, 50, 100, 200];

const FRAME_MS = 16;
const ADAPT_RATIO = 1; // flush at most ~50% of the time
const ADAPT_CAP_MS = 64; // text never lags more than ~4 frames behind

const { md, registry } = getParser(resolvePreset('gfm'));
const options = { html: 'safe', registry, context: '' };

function parseFull(source) {
  const env = {};
  return convertTokens(md, md.parse(source, env), source, options).table;
}

function parseTail(source, offset, references) {
  const tail = source.slice(offset);
  const env = { references: { ...references } };
  const table = convertTokens(md, md.parse(tail, env), tail, options).table;
  return { table, references: env.references ?? references };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p90 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)];

function timeOf(fn, n = 11, warmup = 3) {
  for (let i = 0; i < warmup; i++) fn();
  const t = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return median(t);
}

// --- fence fast path ---------------------------------------------------

const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The open fence at the end of `source`'s last block text, or null. */
function openFenceOf(blockText) {
  const lines = blockText.split('\n');
  const m = OPEN_FENCE.exec(lines[0]);
  if (!m) return null;
  const char = m[1][0];
  const len = m[1].length;
  const close = new RegExp(`^ {0,3}\\${char}{${len},}\\s*$`);
  // Closed if any later complete line closes it (the last line may be partial,
  // but a partial closing line is still treated as closing: conservative).
  for (let i = 1; i < lines.length; i++) if (close.test(lines[i])) return null;
  return { close };
}

/** Whether appending `chunk` to `source` can add a closing fence line. */
function canClose(fence, source, chunk) {
  const lastNl = source.lastIndexOf('\n');
  const lines = (source.slice(lastNl + 1) + chunk).split('\n');
  for (const line of lines) if (fence.close.test(line)) return true;
  return false;
}

/** Class of the open block, from its first line. */
function classOf(blockText) {
  const first = blockText.split('\n', 1)[0];
  if (OPEN_FENCE.test(first)) return 'fence';
  if (first.includes('|')) return 'table';
  if (/^ {0,3}([-*+]|\d{1,9}[.)])\s/.test(first)) return 'list';
  return 'other';
}

// --- one simulated stream ----------------------------------------------

function simulate(strategy, chunks) {
  const interval = (chars) => (chars / rate) * 1000;
  let now = 0;
  let nextArrival = 0;
  let i = 0;
  let source = '';
  let pending = '';
  let offset = 0; // start of the open (last) block
  let references = {};
  let openClass = 'other';
  let fence = null; // open fenced block state, for tail+fence
  let nextFlushAt = 0;
  const flushes = [];
  let fastPath = 0;
  let prefixBlocks = 0;
  let lastCount = 0;
  const classCost = { fence: 0, table: 0, list: 0, other: 0 };

  const coalesced = strategy !== 'tail' && strategy !== 'naive';
  const useFence = strategy === 'tail+fence';

  const flush = () => {
    const chunk = pending;
    pending = '';
    const start = performance.now();
    if (useFence && fence && !canClose(fence, source, chunk)) {
      source += chunk; // append to the open code block, no parse
      fastPath++;
    } else {
      source += chunk;
      if (strategy === 'naive') {
        parseFull(source);
      } else {
        const r = parseTail(source, offset, references);
        references = r.references;
        const t = r.table;
        if (t.blockCount > 0) {
          prefixBlocks += t.blockCount - 1;
          lastCount = prefixBlocks + 1;
          offset += t.blockStart[t.blockCount - 1];
          const last = source.slice(offset);
          fence = useFence ? openFenceOf(last) : null;
          openClass = classOf(last);
        }
      }
    }
    const cost = performance.now() - start;
    classCost[openClass] += cost;
    flushes.push(cost);
    now += cost;
    const gap =
      strategy === 'tail+adaptive'
        ? Math.min(ADAPT_CAP_MS, Math.max(FRAME_MS, cost * ADAPT_RATIO))
        : FRAME_MS;
    nextFlushAt = coalesced ? now + gap - cost : now;
  };

  while (i < chunks.length || pending) {
    // deliver every chunk that has arrived by `now`
    while (i < chunks.length && nextArrival <= now) {
      pending += chunks[i];
      nextArrival += interval(chunks[i].length);
      i++;
    }
    if (pending && now >= nextFlushAt) {
      flush();
    } else if (i < chunks.length) {
      // idle: jump to whichever comes first, the next arrival or the flush slot
      const target = pending ? Math.min(nextArrival, nextFlushAt) : nextArrival;
      now = Math.max(now, target);
    } else {
      now = Math.max(now, nextFlushAt);
    }
  }
  return { flushes, fastPath, source, blocks: lastCount, classCost };
}

/** Tail re-parse with a fixed throttle window; measures text lag. */
function simulateWindow(timed, windowMs) {
  let now = 0;
  let i = 0;
  let source = '';
  let pending = [];
  let offset = 0;
  let references = {};
  let nextFlushAt = 0;
  let prefixBlocks = 0;
  let count = 0;
  const flushes = [];
  const lags = [];
  while (i < timed.length || pending.length) {
    while (i < timed.length && timed[i].t <= now) pending.push(timed[i++]);
    if (pending.length && now >= nextFlushAt) {
      const flushStart = now;
      for (const c of pending) source += c.text;
      const start = performance.now();
      const r = parseTail(source, offset, references);
      references = r.references;
      if (r.table.blockCount > 0) {
        prefixBlocks += r.table.blockCount - 1;
        count = prefixBlocks + 1;
        offset += r.table.blockStart[r.table.blockCount - 1];
      }
      const cost = performance.now() - start;
      flushes.push(cost);
      now += cost;
      for (const c of pending) lags.push(now - c.t);
      pending = [];
      nextFlushAt = flushStart + windowMs;
    } else if (i < timed.length) {
      const target = pending.length
        ? Math.min(timed[i].t, nextFlushAt)
        : timed[i].t;
      now = Math.max(now, target);
    } else {
      now = Math.max(now, nextFlushAt);
    }
  }
  return { flushes, lags, source, blocks: count };
}

/** naive is O(flushes) full parses; sample prefix lengths and interpolate. */
function simulateNaive(chunks) {
  // flush schedule is the same as `tail` (one per chunk); price each from samples
  const total = chunks.length;
  const samples = 40;
  const pts = [];
  let len = 0;
  const lens = chunks.map((c) => (len += c.length));
  for (let s = 1; s <= samples; s++) {
    const L = lens[Math.min(total - 1, Math.ceil((s / samples) * total) - 1)];
    const src = text.slice(0, L);
    pts.push([L, timeOf(() => parseFull(src), 5, 1)]);
  }
  const costAt = (L) => {
    for (let k = 0; k < pts.length; k++) {
      if (L <= pts[k][0]) {
        const [l0, t0] = k ? pts[k - 1] : [0, 0];
        const [l1, t1] = pts[k];
        return t0 + ((t1 - t0) * (L - l0)) / (l1 - l0 || 1);
      }
    }
    return pts[pts.length - 1][1];
  };
  return { flushes: lens.map(costAt), fastPath: 0, source: text };
}

// --- run ---------------------------------------------------------------

const chunkify = (size) => {
  const out = [];
  for (let k = 0; k < text.length; k += size) out.push(text.slice(k, k + size));
  return out;
};

const fullMs = timeOf(() => parseFull(text));
const nodes = parseFull(text);
const jit = process.execArgv.includes('--jitless') ? 'jitless' : 'JIT';
console.log(
  `${transcriptFile ?? textFile ?? 'F2'} · ${text.length} chars · ${nodes.count} nodes · ${nodes.blockCount} blocks · ${jit} · rate ${rate} chars/s · ${runs} runs`
);
console.log(`one full parse(): ${fullMs.toFixed(2)} ms  (streamCost 1.0x)\n`);

const strategies = [
  'naive',
  'tail',
  'tail+frame',
  'tail+adaptive',
  'tail+fence',
];
const rows = [];
const attribution = [];
let warnedNote = false;
let warnedWindow = false;
for (const size of transcript ? [] : sizes) {
  const chunks = chunkify(size);
  for (const strategy of strategies) {
    const totals = [];
    const worst = [];
    let last;
    for (let r = 0; r < runs; r++) {
      last =
        strategy === 'naive'
          ? simulateNaive(chunks)
          : simulate(strategy, chunks);
      totals.push(last.flushes.reduce((a, b) => a + b, 0));
      worst.push(p90(last.flushes));
    }
    // correctness check: the streamed source equals the text
    if (last.source !== text) throw new Error(`${strategy}: source mismatch`);
    const total = median(totals);
    const fullBlocks = nodes.blockCount;
    if (strategy !== 'naive' && last.blocks !== fullBlocks) {
      console.warn(
        `WARNING ${strategy}@${size}: tail block count ${last.blocks} != full parse ${fullBlocks}` +
          (warnedNote
            ? ''
            : '\n  (likely the footnote section: the full parse emits a trailing footnote-list block at EOF when a definition in the tail is referenced from the stable prefix; a tail parse cannot see the reference)')
      );
      warnedNote = true;
    }
    if (strategy === 'tail') attribution.push({ size, cost: last.classCost });
    rows.push({
      chunk: size,
      strategy,
      flushes: last.flushes.length,
      fast: last.fastPath,
      ms: total,
      x: total / fullMs,
      p90: median(worst),
    });
  }
}

const pad = (v, n) => String(v).padStart(n);
console.log(
  `${pad('chunk', 6)} ${'strategy'.padEnd(14)} ${pad('flushes', 8)} ${pad('fast', 6)} ${pad('total ms', 10)} ${pad('x full', 9)} ${pad('p90 ms', 8)}`
);
for (const r of rows) {
  console.log(
    `${pad(r.chunk, 6)} ${r.strategy.padEnd(14)} ${pad(r.flushes, 8)} ${pad(r.fast, 6)} ${pad(r.ms.toFixed(1), 10)} ${pad(r.x.toFixed(2) + 'x', 9)} ${pad(r.p90.toFixed(2), 8)}`
  );
}

{
  const fmt = (v, d = 1) => v.toFixed(d);
  const sweep = [];
  const sources = transcript
    ? [{ label: `SYNTHETIC transcript ${transcriptFile}`, timed: transcript }]
    : sizes
        .filter((z) => z === 20 || z === 195)
        .map((z) => {
          let t = 0;
          return {
            label: `chunk ${z}`,
            timed: chunkify(z).map((c) => {
              const at = t;
              t += (c.length / rate) * 1000;
              return { t: at, text: c };
            }),
          };
        });
  for (const src of sources) {
    console.log(
      `\nwindow sweep, ${src.label} (tail re-parse, throttle window)`
    );
    console.log(
      `${pad('window', 7)} ${pad('flushes', 8)} ${pad('total ms', 9)} ${pad('x full', 8)} ${pad('lag mean', 9)} ${pad('lag max', 8)}`
    );
    for (const w of WINDOWS) {
      const res = [];
      for (let r = 0; r < runs; r++) {
        const o = simulateWindow(src.timed, w);
        if (o.source !== text) throw new Error('window: source mismatch');
        if (o.blocks !== nodes.blockCount && !warnedWindow) {
          warnedWindow = true;
          console.warn(
            `WARNING window sweep: tail block count ${o.blocks} != full parse ${nodes.blockCount} (see note above)`
          );
        }
        res.push({
          n: o.flushes.length,
          total: o.flushes.reduce((a, b) => a + b, 0),
          mean: o.lags.reduce((a, b) => a + b, 0) / o.lags.length,
          max: Math.max(...o.lags),
        });
      }
      const m = (k) => median(res.map((x) => x[k]));
      const row = {
        source: src.label,
        window: w,
        flushes: m('n'),
        ms: m('total'),
        x: m('total') / fullMs,
        lagMean: m('mean'),
        lagMax: m('max'),
      };
      sweep.push(row);
      console.log(
        `${pad(w === 0 ? 'none' : w, 7)} ${pad(row.flushes, 8)} ${pad(fmt(row.ms), 9)} ${pad(fmt(row.x, 2) + 'x', 8)} ${pad(fmt(row.lagMean), 9)} ${pad(fmt(row.lagMax), 8)}`
      );
    }
  }
  globalThis.__sweep = sweep;
}

for (const a of attribution) {
  const total = Object.values(a.cost).reduce((x, y) => x + y, 0);
  const share = (k) => `${k} ${((a.cost[k] / total) * 100).toFixed(1)}%`;
  console.log(
    `\ncost by open block class, tail @ chunk ${a.size} (total ${total.toFixed(1)} ms): ${['fence', 'table', 'list', 'other'].map(share).join(' · ')}`
  );
}
console.log(
  `\nnaive is interpolated from 40 sampled prefixes. Splice and React commit are not included.`
);
console.log(
  `JSON ${JSON.stringify({ jit, chars: text.length, fullMs, rate, rows, attribution, sweep: globalThis.__sweep })}`
);
