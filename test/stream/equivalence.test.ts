/**
 * Stream equivalence harness (phase 2, S1.6).
 * Design: docs/rewrite/phase-2/testing-harness.md
 *
 * After EVERY flush the streamed table must equal `parse(source so far)`.
 * Known divergences go in test/fixtures/stream-allowlist.json (shrink-only:
 * an allowlisted case that starts passing fails through `test.failing`).
 *
 * Knobs (env):
 *   STREAM_WORK=1         enable the work-counter assertions (needs S1.5)
 *   STREAM_WORK_STRICT=1  also reject full re-parses outside declared triggers
 *   STREAM_SEED=<n>       one extra seeded chunking per input
 *   STREAM_FULL=1         run every chunk size on the large fixtures too
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { F1, F2 } from '../../bench/fixtures';
import { pathologicalCases } from '../fixtures/pathological/cases';
import { parseWithMarkdownIt } from '../../src/parse';
import { presetFor } from '../utils/renderToHtml';
import { readSpec, type SpecSuite } from '../utils/specReader';
import { targetedCases } from './cases';
import {
  awkwardSplits,
  checkWork,
  diffDocuments,
  everyPosition,
  fixed,
  loadStreamAllowlist,
  seeded,
  streamAndCompare,
  WORK_STRICT,
  type RunOptions,
} from './harness';
import { createMarkdownStreamCore } from '../../src/stream/createMarkdownStream';

const allowlist = loadStreamAllowlist();
const FULL = process.env.STREAM_FULL === '1';
const EXTRA_SEED = process.env.STREAM_SEED
  ? Number(process.env.STREAM_SEED)
  : null;

interface Chunking {
  name: string;
  chunks: string[];
}

interface ChunkingOptions {
  /** Every two-chunk split (only for short sources). */
  everyPosition: boolean;
  fixedSizes: number[];
  seeds: number[];
}

const SHORT = 80;

function chunkings(source: string, o: ChunkingOptions): Chunking[] {
  const out: Chunking[] = [];
  const seen = new Set<string>();
  const add = (name: string, chunks: string[]) => {
    const key = JSON.stringify(chunks);
    if (seen.has(key) || chunks.join('') !== source) return;
    seen.add(key);
    out.push({ name, chunks });
  };
  for (const size of o.fixedSizes) add(`fixed(${size})`, fixed(size)(source));
  const seeds = EXTRA_SEED === null ? o.seeds : [...o.seeds, EXTRA_SEED];
  for (const seed of seeds) add(`seed=${seed}`, seeded(seed)(source));
  for (const a of awkwardSplits(source)) add(a.name, a.chunks);
  if (o.everyPosition) {
    for (const p of everyPosition(source)) add(p.name, p.chunks);
  }
  return out;
}

const SPEC_CHUNKING = (source: string): ChunkingOptions => ({
  everyPosition: source.length <= SHORT,
  fixedSizes: [1, 2, 20, 195],
  seeds: [1, 2, 3],
});

const label = (id: string, c: Chunking) => `${id} ${c.name}`;

/** Registers a test (or `test.failing` for allowlisted keys) running all chunkings. */
function register(
  key: string,
  title: string,
  sources: string | string[],
  options: ChunkingOptions,
  run: RunOptions = {}
) {
  const body = () => {
    for (const source of Array.isArray(sources) ? sources : [sources]) {
      for (const c of chunkings(source, options)) {
        streamAndCompare(c.chunks, label(key, c), run);
      }
    }
  };
  const known = allowlist.get(key);
  if (known) test.failing(`${title} [allowlisted: ${known.reason}]`, body);
  else test(title, body);
}

// --- spec examples ------------------------------------------------------

const SUITES: { suite: SpecSuite; file: string }[] = [
  { suite: 'commonmark', file: 'commonmark/spec.txt' },
  { suite: 'gfm', file: 'gfm/spec.txt' },
  { suite: 'gfm-extensions', file: 'gfm/extensions.txt' },
];

const knownKeys = new Set<string>();

for (const { suite, file } of SUITES) {
  describe(`stream equivalence: ${suite}`, () => {
    const examples = readSpec(file, suite).filter(
      (ex) => ex.extension !== 'disabled'
    );
    for (const ex of examples) {
      const key = `${suite}:${ex.example}`;
      knownKeys.add(key);
      register(
        key,
        `#${ex.example} ${ex.section} (line ${ex.line})`,
        ex.markdown,
        SPEC_CHUNKING(ex.markdown),
        {
          parse: { preset: presetFor(suite, ex.extension), html: 'text' },
          // Reference definitions and footnotes legitimately trigger full re-parses.
          allowFullReparse: true,
        }
      );
    }
  });
}

// --- bench fixtures and transcripts -----------------------------------

describe('stream equivalence: fixtures', () => {
  const read = (rel: string) =>
    readFileSync(join(__dirname, '..', '..', 'bench', 'fixtures', rel), 'utf8');
  const fixtures: [string, string][] = [
    ['F1', F1],
    ['F2', F2],
    ['code-heavy', read('code-heavy.md')],
    ['t1-debug-flatlist', read('transcripts/text/t1-debug-flatlist.md')],
    ['t2-explain-streaming', read('transcripts/text/t2-explain-streaming.md')],
    ['t3-setup-guide', read('transcripts/text/t3-setup-guide.md')],
  ];
  for (const [name, source] of fixtures) {
    const key = `fixture:${name}`;
    knownKeys.add(key);
    // 1-char chunks on a 10 KB source are 10k full parses with the stub.
    const small = source.length <= 4000 || FULL;
    register(
      key,
      `${name} (${source.length} chars)`,
      source,
      {
        everyPosition: false,
        fixedSizes: small ? [1, 2, 20, 195] : [20, 195],
        seeds: [1, 2],
      },
      { allowFullReparse: true }
    );
  }
});

// --- targeted cases -----------------------------------------------------

describe('stream equivalence: targeted cases', () => {
  for (const c of targetedCases) {
    const key = `targeted:${c.name}`;
    knownKeys.add(key);
    register(
      key,
      c.name,
      c.sources,
      // Every split position, plus randomized chunkings (fences, tables, ...).
      {
        everyPosition: true,
        fixedSizes: [1, 2, 3, 20, 195],
        seeds: [1, 2, 3, 4, 5, 6, 7, 8],
      },
      { parse: c.parse, allowFullReparse: c.allowFullReparse }
    );
  }
});

// --- pathological, streamed in 1 KB chunks -----------------------------

const PATHOLOGICAL_CHUNK = 1024;
/**
 * Inputs are up to ~400 KB. By default only the first 32 KB of each is
 * streamed (32 flushes), so the stub (full re-parse per flush, quadratic by
 * design) stays fast; STREAM_PATHOLOGICAL_FULL=1 streams the whole input
 * (use once S1.5 lands; a linear-per-flush core handles it in seconds).
 */
const PATHOLOGICAL_MAX_CHARS =
  process.env.STREAM_PATHOLOGICAL_FULL === '1' ? Infinity : 32 * 1024;
const PATHOLOGICAL_FULL = process.env.STREAM_PATHOLOGICAL_FULL === '1';
/**
 * Absolute cap per case, a runaway guard and not the main bound. Applied on
 * the default truncated run (32 KB). The full run (hostile inputs of up to
 * ~400 KB, where one parse is itself slow) relies on the ratio bound below
 * unless STREAM_PATHOLOGICAL_BUDGET_MS is set.
 */
const PATHOLOGICAL_BUDGET_MS = Number(
  process.env.STREAM_PATHOLOGICAL_BUDGET_MS ??
    (PATHOLOGICAL_FULL ? Infinity : 20000)
);
/**
 * Ratio bound, scaled by the number of flushes. A single huge block is
 * re-parsed on every flush, so a correct tail re-parse costs about
 * `chunks / 2` full parses (quadratic by nature, P2-4 coalescing is what
 * cuts the flush count). A fixed multiple of one parse cannot hold for these
 * inputs; this bound allows `chunks x factor` and still catches anything
 * beyond quadratic.
 */
const PATHOLOGICAL_COST_FACTOR = 2;
/** Jest timeout is fixed per test, so the full run gets a long one (30 min). */
const PATHOLOGICAL_TIMEOUT_MS = PATHOLOGICAL_FULL
  ? 30 * 60 * 1000
  : Math.min(PATHOLOGICAL_BUDGET_MS * 2, 60000);

describe('stream equivalence: pathological (1 KB chunks)', () => {
  for (const { name, input } of pathologicalCases) {
    const key = `pathological:${name}`;
    knownKeys.add(key);
    const body = () => {
      const source = input().slice(0, PATHOLOGICAL_MAX_CHARS);
      const chunks = fixed(PATHOLOGICAL_CHUNK)(source);

      const fullStarted = Date.now();
      const expected = parseWithMarkdownIt(source).table;
      const fullMs = Date.now() - fullStarted;

      const core = createMarkdownStreamCore();
      const started = Date.now();
      for (const chunk of chunks) core.append(chunk);
      const table = core.done();
      const elapsed = Date.now() - started;

      if (PATHOLOGICAL_FULL) {
        console.log(
          `pathological "${name}": ${chunks.length} flushes, stream ${elapsed} ms, one parse ${fullMs} ms`
        );
      }
      expect(elapsed).toBeLessThan(PATHOLOGICAL_BUDGET_MS);
      // The floor keeps fast inputs from tripping on timer noise.
      expect(elapsed).toBeLessThan(
        Math.max(500, fullMs * (chunks.length + 1) * PATHOLOGICAL_COST_FACTOR)
      );
      // Per-flush comparison would double the cost of inputs this large;
      // the final table (after done()) must still be a full parse.
      expect(diffDocuments(table, expected)).toBeNull();
    };
    const known = allowlist.get(key);
    if (known) {
      test.failing(
        `${name} [allowlisted: ${known.reason}]`,
        body,
        PATHOLOGICAL_TIMEOUT_MS
      );
    } else {
      test(name, body, PATHOLOGICAL_TIMEOUT_MS);
    }
  }
});

// --- work counter helper (self-test) -----------------------------------

describe('work counter assertion helper', () => {
  const ctx = {
    openBlockStart: 100,
    sourceLength: 150,
    chunkLength: 10,
    allowFullReparse: false,
  };
  it('accepts a tail re-parse bounded by the open block', () => {
    expect(
      checkWork({ charsReparsed: 50, fullReparse: false, path: 'tail' }, ctx)
    ).toBeNull();
  });
  it('rejects a tail re-parse beyond the open block', () => {
    expect(
      checkWork({ charsReparsed: 51, fullReparse: false, path: 'tail' }, ctx)
    ).toMatch(/exceeds bound 50/);
  });
  it('bounds the fence fast path by the chunk', () => {
    const fast = (n: number) => ({
      charsReparsed: n,
      fullReparse: false,
      path: 'fence-fast-path' as const,
    });
    expect(checkWork(fast(10), ctx)).toBeNull();
    expect(checkWork(fast(11), ctx)).toMatch(/exceeds bound 10/);
  });
  it('allows full re-parses unless strict', () => {
    const full = {
      charsReparsed: 150,
      fullReparse: true,
      path: 'full' as const,
    };
    expect(checkWork(full, ctx)).toBe(
      WORK_STRICT
        ? 'unexpected full re-parse (no trigger declared for this case)'
        : null
    );
  });
  it('rejects inconsistent stats', () => {
    expect(
      checkWork({ charsReparsed: 1, fullReparse: false, path: 'full' }, ctx)
    ).toMatch(/without fullReparse/);
    expect(
      checkWork({ charsReparsed: 1, fullReparse: true, path: 'tail' }, ctx)
    ).toMatch(/fullReparse with path/);
  });
});

// --- allowlist hygiene -------------------------------------------------

describe('stream allowlist', () => {
  it('only names cases that exist', () => {
    const stale = [...allowlist.keys()].filter((key) => !knownKeys.has(key));
    expect(stale).toEqual([]);
  });
});
