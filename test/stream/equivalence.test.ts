/**
 * Stream equivalence harness (phase 2, S1.6).
 * Design: docs/rewrite/phase-2/testing-harness.md
 *
 * After EVERY flush the streamed table must equal `parse(source so far)`.
 * Known divergences go in test/fixtures/stream-allowlist.json (shrink-only:
 * an allowlisted case that starts passing fails through `test.failing`).
 *
 * Knobs (env; also in docs/rewrite/phase-2/testing-harness.md):
 *   STREAM_WORK=1         work-counter assertions on every flush (targeted,
 *                         spec, fixtures AND pathological cases)
 *   STREAM_WORK_STRICT=1  also reject full re-parses outside declared triggers
 *   STREAM_NO_FENCE_FAST=1  turn the open-fence fast path off in the core;
 *                         path expectations flip to "never fence-fast-path"
 *   STREAM_SEED=<n>       one extra seeded chunking per input
 *   STREAM_FULL=1         also run chunk sizes 1 and 2 on the large fixtures
 *   STREAM_PATHOLOGICAL_FULL=1  stream the pathological inputs whole (~12 min)
 *   STREAM_PATHOLOGICAL_BUDGET_MS=<n>  absolute cap per pathological case
 *                         (default 20000 truncated, none with _FULL)
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
  checkExpectedPath,
  checkWork,
  FENCE_FAST_DISABLED,
  mustTakeFastPath,
  openRegionStart,
  parseStreamAllowlist,
  diffDocuments,
  everyPosition,
  fixed,
  loadStreamAllowlist,
  seeded,
  streamAndCompare,
  WORK_ASSERTIONS,
  WORK_STRICT,
  type RunOptions,
} from './harness';
import {
  createMarkdownStreamCore,
  createMarkdownStreamCoreWith,
} from '../../src/stream/createMarkdownStream';

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
  let pathChecks = 0;
  const body = () => {
    for (const source of Array.isArray(sources) ? sources : [sources]) {
      for (const c of chunkings(source, options)) {
        pathChecks += streamAndCompare(c.chunks, label(key, c), run);
      }
      // Guard against a vacuous expectation: the oracle must have applied.
      if (run.expectedPath === 'fence-fast-path' && !FENCE_FAST_DISABLED) {
        expect(pathChecks).toBeGreaterThan(0);
      }
      pathChecks = 0;
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

// code-heavy (5.6 KB) is cheap with chunk sizes 1 and 2; F2 (9.7 KB) is not.
const LARGE_FIXTURE = 6000;

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
    // 1- and 2-char chunks on a 10 KB source are ~10k appends, each followed
    // by a full-parse comparison (quadratic): opt-in with STREAM_FULL=1.
    const small = source.length <= LARGE_FIXTURE || FULL;
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
      {
        parse: c.parse,
        allowFullReparse: c.allowFullReparse,
        expectedPath: c.expectedPath,
      }
    );
  }
});

// --- pathological, streamed in 1 KB chunks -----------------------------

const PATHOLOGICAL_CHUNK = 1024;
/**
 * Inputs are up to ~400 KB. By default only the first 32 KB of each is
 * streamed (32 flushes) to keep the default run short; STREAM_PATHOLOGICAL_FULL=1
 * streams the whole input.
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
const RATIO_NOISE_FLOOR_MS = 500;
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
      // Only append() is timed: the checks below are excluded.
      let elapsed = 0;
      // A full comparison every `stride` flushes (a few per input); the work
      // counter (STREAM_WORK=1) is checked on EVERY flush, which is cheap.
      const stride = Math.max(8, Math.ceil(chunks.length / 16));
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const openBlockStart = WORK_ASSERTIONS
          ? openRegionStart(core.table, core.source)
          : 0;
        const t0 = Date.now();
        core.append(chunk);
        elapsed += Date.now() - t0;
        if (WORK_ASSERTIONS) {
          const violation = checkWork(core.lastFlush, {
            openBlockStart,
            sourceLength: core.source.length,
            chunkLength: chunk.length,
            allowFullReparse: false,
          });
          if (violation) {
            throw new Error(`[${key}] chunk ${i}: work counter: ${violation}`);
          }
        }
        if (i % stride === stride - 1) {
          const diff = diffDocuments(
            core.table,
            parseWithMarkdownIt(core.source).table
          );
          if (diff) throw new Error(`[${key}] chunk ${i}: ${diff}`);
        }
      }
      const t1 = Date.now();
      const table = core.done();
      elapsed += Date.now() - t1;

      if (PATHOLOGICAL_FULL) {
        console.log(
          `pathological "${name}": ${chunks.length} flushes, stream ${elapsed} ms, one parse ${fullMs} ms`
        );
      }
      expect(elapsed).toBeLessThan(PATHOLOGICAL_BUDGET_MS);
      // The floor is a timer-noise guard for inputs whose single parse takes
      // ~1 ms (the spec bound alone would then be tens of ms); it does not
      // loosen the bound for slow inputs, where the ratio term dominates.
      expect(elapsed).toBeLessThan(
        Math.max(
          RATIO_NOISE_FLOOR_MS,
          fullMs * (chunks.length + 1) * PATHOLOGICAL_COST_FACTOR
        )
      );
      // The final table (after done()) must be a full parse.
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

// --- path expectation helper (self-test) --------------------------------

describe('path expectation helper', () => {
  const fast = (path: 'tail' | 'fence-fast-path' | 'full') => path;
  it('finds flushes that must take the fast path', () => {
    expect(mustTakeFastPath('```\na\n', 'b')).toBe(true);
    expect(mustTakeFastPath('```', '\nb')).toBe(false); // opener incomplete
    expect(mustTakeFastPath('```\na\n', '```\n')).toBe(false); // closer
    expect(mustTakeFastPath('```\na\n``', '`')).toBe(false); // closer spans
    expect(mustTakeFastPath('    ```\na\n', 'b')).toBe(false); // indented
    expect(mustTakeFastPath('```\na\r\n', 'b')).toBe(false); // CR
    expect(mustTakeFastPath('```\na\n', '  ')).toBe(false); // blank last line
  });
  it('rejects the wrong path', () => {
    const fp = (p: 'tail' | 'fence-fast-path' | 'full') =>
      checkExpectedPath('fence-fast-path', fast(p), '```\na\n', 'b');
    const tail = (p: 'tail' | 'fence-fast-path' | 'full') =>
      checkExpectedPath('tail', fast(p), '- a\n  ```\n', 'b');
    if (FENCE_FAST_DISABLED) {
      expect(fp('fence-fast-path').violation).toMatch(/must not be taken/);
      expect(fp('tail').violation).toBeNull();
    } else {
      expect(fp('fence-fast-path')).toEqual({ violation: null, checked: true });
      expect(fp('tail').violation).toMatch(/expected path 'fence-fast-path'/);
      expect(
        checkExpectedPath('fence-fast-path', 'tail', '```\na\n', '```\n')
      ).toEqual({ violation: null, checked: false });
    }
    expect(tail('fence-fast-path').violation).toMatch(/must not be taken/);
    expect(tail('tail').violation).toBeNull();
  });
  it('really drives the core down the expected paths', () => {
    const run = (source: string) => {
      const c = createMarkdownStreamCoreWith(undefined, {
        fenceFastPath: true,
      });
      const paths = new Set<string>();
      for (const ch of source) {
        c.append(ch);
        paths.add(c.lastFlush.path);
      }
      return paths;
    };
    const topLevel = run('```\nabc\ndef\n');
    const indented = run('    ```\n    abc\n    def\n');
    const inItem = run('- a\n  ```\n  abc\n  def\n');
    const inQuote = run('> ```\n> abc\n> def\n');
    expect(topLevel.has('fence-fast-path')).toBe(true);
    for (const p of [indented, inItem, inQuote]) {
      expect(p.has('fence-fast-path')).toBe(false);
    }
  });
});

// --- allowlist loader (self-test) ----------------------------------------

describe('stream allowlist loader', () => {
  const ok = { key: 'targeted:x', reason: 'why', issue: 'https://e.com/1' };
  it('accepts a complete entry and the empty list', () => {
    expect(parseStreamAllowlist([]).size).toBe(0);
    expect(parseStreamAllowlist([ok]).get('targeted:x')).toEqual(ok);
  });
  it('requires a key, a reason and a link per entry', () => {
    expect(() => parseStreamAllowlist([{ ...ok, reason: '' }])).toThrow(
      /needs a key, reason and issue/
    );
    expect(() => parseStreamAllowlist([{ ...ok, reason: '  ' }])).toThrow();
    expect(() => parseStreamAllowlist([{ ...ok, issue: '' }])).toThrow();
    expect(() => parseStreamAllowlist([{ ...ok, key: '' }])).toThrow();
    expect(() => parseStreamAllowlist([{ ...ok, issue: '#12' }])).toThrow(
      /must be a link/
    );
  });
  it('rejects duplicates and non-arrays', () => {
    expect(() => parseStreamAllowlist([ok, ok])).toThrow(/duplicated/);
    expect(() => parseStreamAllowlist({})).toThrow(/JSON array/);
  });
  // Shrink-only: allowlisted keys register through test.failing (see
  // register() and the pathological block), so an entry that starts passing
  // fails the suite until it is removed.
});

// --- allowlist hygiene -------------------------------------------------

describe('stream allowlist', () => {
  it('only names cases that exist', () => {
    const stale = [...allowlist.keys()].filter((key) => !knownKeys.has(key));
    expect(stale).toEqual([]);
  });
});
