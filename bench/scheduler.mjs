// Phase 2 S2.9a: scheduler strategy comparison, Node.
// Spec: docs/rewrite/phase-2/{hook-and-scheduler,decisions P2-4,benchmark-protocol}.md
//
// Drives the REAL scheduler (src/stream/scheduler.ts) and stream core with the
// two strategies side by side:
//   timeout@N   leading flush + one flush per N ms window (P2-4, N = 50 by default)
//   raf         one flush per animation frame (first append waits for the next frame)
//
// Time is virtual. The scheduler gets a SchedulerClock backed by an event queue:
//   - chunks arrive at `--rate` chars/s (or on the `--transcript` timestamps)
//   - frames land on a 60 Hz vsync grid (16.67 ms), so `raf` is simulated, not real
//   - the JS thread is single: a callback that does real work (a flush) advances the
//     virtual clock by its measured cost, so events behind it start late
//
// Metrics, per strategy and workload:
//   flushes       number of flushes
//   p50/p90 ms    flush cost
//   lat p50/p90/max  chunk arrival -> end of the flush that carried it (virtual ms)
//   total ms / x full   sum of flush costs, and as a multiple of ONE full parse of the text
//   done ms       the final done() (full re-parse), reported apart
//
//   yarn scheduler                 # JIT
//   yarn scheduler:jitless         # the number to decide on (closest to Hermes)
//   node --jitless --import tsx scheduler.mjs [runs] [--text file] [--sizes 1,20,195]
//        [--rates 1250,5000] [--intervals 16,33,50,100] [--transcript file] [--save]
//
// Not included: React commit time (the hook, S2.3) and the splice-to-render path.

import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseWithMarkdownIt } from '../src/parse/index.ts';
import { createMarkdownScheduler } from '../src/stream/scheduler.ts';
import { F2 } from './fixtures/index.ts';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 5);
const sizes = flag('sizes', '1,20,195').split(',').map(Number);
const rates = flag('rates', '1250,5000').split(',').map(Number); // chars per second
const intervals = flag('intervals', '16,33,50,100').split(',').map(Number);
const textFile = flag('text', null);
const transcriptFile = flag('transcript', null); // SYNTHETIC [{t,text}] replay
const save = args.includes('--save');
const transcript = transcriptFile
  ? JSON.parse(readFileSync(transcriptFile, 'utf8'))
  : null;
const text = transcript
  ? transcript.map((c) => c.text).join('')
  : textFile
    ? readFileSync(textFile, 'utf8')
    : F2;

const VSYNC_MS = 1000 / 60;

const sorted = (xs) => [...xs].sort((a, b) => a - b);
const pct = (xs, p) => {
  const s = sorted(xs);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
};
const median = (xs) => pct(xs, 0.5);

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

/** Chunks with nominal arrival times. */
function arrivalsFor(size, rate) {
  if (transcript) return transcript;
  const out = [];
  let t = 0;
  for (let k = 0; k < text.length; k += size) {
    const chunk = text.slice(k, k + size);
    out.push({ t, text: chunk });
    t += (chunk.length / rate) * 1000;
  }
  return out;
}

/** One simulated stream with a real scheduler on a virtual clock. */
function simulate(strategyOptions, arrivals) {
  let now = 0;
  let seq = 0;
  const queue = []; // {time, seq, fn, cancelled}
  const push = (time, fn) => {
    const ev = { time, seq: seq++, fn, cancelled: false };
    queue.push(ev);
    return ev;
  };
  const clock = {
    setTimeout: (fn, ms) => push(now + ms, fn),
    clearTimeout: (ev) => {
      ev.cancelled = true;
    },
    requestFrame: (fn) =>
      push((Math.floor(now / VSYNC_MS) + 1) * VSYNC_MS, fn),
    cancelFrame: (ev) => {
      ev.cancelled = true;
    },
  };

  const flushCosts = [];
  const latencies = [];
  const pendingArrivals = []; // nominal arrival times of chunks not yet flushed
  let flushedHere = null; // arrivals carried by a flush during the current callback

  const scheduler = createMarkdownScheduler({
    ...strategyOptions,
    clock,
    onFlush: () => {
      flushedHere = pendingArrivals.splice(0);
    },
  });

  // Chunk arrivals are events too. They are already time-ordered, so they stay
  // in their own array; `queue` holds only the few live timers and frames.
  let nextArrival = 0;

  for (;;) {
    let best = -1;
    for (let k = 0; k < queue.length; k++) {
      const ev = queue[k];
      if (ev.cancelled) continue;
      if (
        best === -1 ||
        ev.time < queue[best].time ||
        (ev.time === queue[best].time && ev.seq < queue[best].seq)
      ) {
        best = k;
      }
    }
    const arrival = arrivals[nextArrival];
    let run;
    if (arrival && (best === -1 || arrival.t <= queue[best].time)) {
      // ties: the arrival goes first (the chunk was there before the timer fired)
      nextArrival++;
      now = Math.max(now, arrival.t); // the thread may still be busy
      run = () => {
        pendingArrivals.push(arrival.t);
        scheduler.append(arrival.text);
      };
    } else if (best !== -1) {
      const [ev] = queue.splice(best, 1);
      now = Math.max(now, ev.time);
      run = ev.fn;
    } else {
      break;
    }
    flushedHere = null;
    const start = performance.now();
    run();
    const cost = performance.now() - start;
    if (flushedHere) {
      now += cost;
      flushCosts.push(cost);
      for (const t of flushedHere) latencies.push(now - t);
    }
  }

  if (scheduler.pending !== '') throw new Error('text left unflushed');
  const doneStart = performance.now();
  const finalTable = scheduler.done();
  const doneMs = performance.now() - doneStart;
  return { flushCosts, latencies, flushCount: scheduler.flushCount, doneMs, finalTable };
}

// --- run ---------------------------------------------------------------

const fullMs = timeOf(() => parseWithMarkdownIt(text, {}));
const reference = parseWithMarkdownIt(text, {}).table;
const jit = process.execArgv.includes('--jitless') ? 'jitless' : 'JIT';
console.log(
  `${transcriptFile ?? textFile ?? 'F2'} · ${text.length} chars · ${reference.blockCount} blocks · ${jit} · ${runs} runs · 60 Hz simulated frames`
);
console.log(`one full parse(): ${fullMs.toFixed(2)} ms  (x full 1.0)\n`);

const strategies = [
  ...intervals.map((n) => ({
    label: `timeout@${n}`,
    options: { strategy: 'timeout', flushIntervalMs: n },
  })),
  { label: 'raf', options: { strategy: 'raf' } },
];

const workloads = transcript
  ? [{ label: `transcript ${transcriptFile}`, arrivals: () => transcript }]
  : sizes.flatMap((size) =>
      rates.map((rate) => ({
        label: `chunk ${size} @ ${rate} c/s`,
        arrivals: () => arrivalsFor(size, rate),
      }))
    );

const pad = (v, n) => String(v).padStart(n);
const f = (v, d = 2) => v.toFixed(d);
const rows = [];
const head =
  `${'workload'.padEnd(22)} ${'strategy'.padEnd(12)} ${pad('chunks', 6)} ${pad('flushes', 8)} ` +
  `${pad('p50', 6)} ${pad('p90', 6)} ${pad('lat p50', 8)} ${pad('lat p90', 8)} ${pad('lat max', 8)} ` +
  `${pad('total ms', 9)} ${pad('x full', 7)} ${pad('done ms', 8)}`;
console.log(head);

for (const workload of workloads) {
  for (const strategy of strategies) {
    const per = [];
    for (let r = 0; r < runs; r++) {
      const arrivals = workload.arrivals();
      const out = simulate(strategy.options, arrivals);
      // correctness: the streamed result equals a full parse of the text
      const t = out.finalTable;
      if (
        t.source !== reference.source ||
        t.blockCount !== reference.blockCount
      ) {
        throw new Error(`${strategy.label}: final table differs from parse()`);
      }
      per.push({
        chunks: arrivals.length,
        flushes: out.flushCosts.length,
        p50: median(out.flushCosts),
        p90: pct(out.flushCosts, 0.9),
        latP50: median(out.latencies),
        latP90: pct(out.latencies, 0.9),
        latMax: Math.max(...out.latencies),
        total: out.flushCosts.reduce((a, b) => a + b, 0),
        doneMs: out.doneMs,
      });
    }
    const m = (k) => median(per.map((x) => x[k]));
    const row = {
      workload: workload.label,
      strategy: strategy.label,
      chunks: per[0].chunks,
      flushes: m('flushes'),
      flushP50: m('p50'),
      flushP90: m('p90'),
      latP50: m('latP50'),
      latP90: m('latP90'),
      latMax: m('latMax'),
      totalMs: m('total'),
      xFull: m('total') / fullMs,
      doneMs: m('doneMs'),
    };
    rows.push(row);
    console.log(
      `${row.workload.padEnd(22)} ${row.strategy.padEnd(12)} ${pad(row.chunks, 6)} ${pad(row.flushes, 8)} ` +
        `${pad(f(row.flushP50), 6)} ${pad(f(row.flushP90), 6)} ${pad(f(row.latP50, 1), 8)} ${pad(f(row.latP90, 1), 8)} ${pad(f(row.latMax, 1), 8)} ` +
        `${pad(f(row.totalMs, 1), 9)} ${pad(f(row.xFull) + 'x', 7)} ${pad(f(row.doneMs, 1), 8)}`
    );
  }
  console.log('');
}

console.log(
  'Frames are simulated (vsync grid, 60 Hz), not measured. Flush cost is real Node time; React commit is not included.'
);

if (save) {
  const date = new Date().toISOString().slice(0, 10);
  const file = new URL(
    `./results/scheduler-node-${jit.toLowerCase()}-${date}.json`,
    import.meta.url
  );
  writeFileSync(
    file,
    JSON.stringify(
      {
        protocol: 'docs/rewrite/phase-2/benchmark-protocol.md (S2.9a, Node)',
        harness: 'bench/scheduler.mjs',
        node: process.version,
        jit,
        runs,
        chars: text.length,
        blocks: reference.blockCount,
        fullMs,
        frame: '60 Hz, simulated',
        rows,
      },
      null,
      1
    ) + '\n'
  );
  console.log(`saved ${file.pathname}`);
}
