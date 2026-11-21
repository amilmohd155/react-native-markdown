/**
 * The highlight plugin through the real streaming path (P3-30 to P3-34):
 * `useMarkdownStream` + `<Markdown document>`, a 20 KB TypeScript fence
 * streamed in 40-character appends, with and without `smooth`.
 *
 * Observed through test hooks only: the core's `lastFlush.path` (the core is
 * wrapped, not replaced), a components-only probe plugin around the real
 * `CodeBlock` (its `open` prop and mount count), `runsOf` calls (one per
 * chunk Text render) and a counting tokenizer.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  renderTree,
  type JsonElement,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import { tableOf } from '../../api/document';
import { Markdown } from '../../api/Markdown';
import { parse } from '../../api/parse';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../../api/useMarkdownStream';
import { emoji } from '../../emoji';
import { definePlugin, type MarkdownPlugin } from '../../plugins/definePlugin';
import type { ElementProps } from '../../render/elements';
import type { FlushStats } from '../../stream/types';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import { chunkAll, type Chunk } from '../chunking';
import { highlight, type Tokenizer } from '../index';
import { javascriptTokenizer } from '../tokenizers/javascript';

// --- Hooks into the real code ---------------------------------------------

/** One core `append`: the source before it, the chunk and the path taken. */
type CoreAppend = {
  readonly before: string;
  readonly chunk: string;
  readonly path: FlushStats['path'];
};
const mockAppends: CoreAppend[] = [];

// The real core, with `append` wrapped to record `lastFlush.path`. Not
// spread: `table`, `source` and `lastFlush` are getters.
jest.mock('../../stream/createMarkdownStream', () => {
  const actual = jest.requireActual<
    typeof import('../../stream/createMarkdownStream')
  >('../../stream/createMarkdownStream');
  return {
    ...actual,
    createMarkdownStreamCoreWith: (
      ...args: Parameters<typeof actual.createMarkdownStreamCoreWith>
    ) => {
      const core = actual.createMarkdownStreamCoreWith(...args);
      const append = core.append;
      core.append = (chunk: string) => {
        const before = core.source;
        const table = append(chunk);
        mockAppends.push({ before, chunk, path: core.lastFlush.path });
        return table;
      };
      return core;
    },
  };
});

// Every `runsOf` call: one per chunk Text render.
const mockRunsCalls: Chunk[] = [];
jest.mock('../chunking', () => {
  const actual =
    jest.requireActual<typeof import('../chunking')>('../chunking');
  return {
    ...actual,
    runsOf: (...args: Parameters<typeof actual.runsOf>) => {
      mockRunsCalls.push(args[0]);
      return actual.runsOf(...args);
    },
  };
});

// --- The document ------------------------------------------------------------

/**
 * About 20 KB of realistic TypeScript, deterministic, every line under 50
 * characters (the chunker's work bound assumes short lines).
 */
function generateTs(minLength: number): string {
  const parts: string[] = [];
  let length = 0;
  for (let i = 0; length < minLength; i++) {
    const part = [
      `/** Item ${i} of the inventory. */`,
      `export interface Item${i} {`,
      '  readonly id: number;',
      '  name: string;',
      '  tags: readonly string[];',
      '}',
      '',
      `// Builds item ${i} from raw input.`,
      `export function makeItem${i}(raw: Raw) {`,
      '  const name = `item-${raw.id}`;',
      `  if (raw.id > ${i} && raw.ok) {`,
      "    return { id: raw.id, name, tags: ['x'] };",
      '  }',
      `  return { id: ${i}, name: "small", tags: [] };`,
      '}',
      '',
    ].join('\n');
    parts.push(part);
    length += part.length + 1;
  }
  return parts.join('\n');
}

const CODE = generateTs(20_000);
const PROSE_BEFORE =
  '# Inventory\n\nIntro with **bold** and `inline code`, ' +
  'then the generated module:\n\n';
const OPENER = '```ts\n';
const CLOSER = '```\n';
const PROSE_AFTER =
  '\nMore prose after the code, with a [link](https://example.com).\n\n' +
  '- one item\n- another item\n';
const SOURCE = PROSE_BEFORE + OPENER + CODE + CLOSER + PROSE_AFTER;

/** Offsets in SOURCE: where the fence body starts and the closer line starts. */
const BODY_START = PROSE_BEFORE.length + OPENER.length;
const CLOSER_START = BODY_START + CODE.length;

const CHUNK = 40;

/** Chunk boundaries depend only on the text: any tokenizer will do. */
const plainTokens: Tokenizer = (text) => [{ type: 'plain', text }];

// --- Plugins -----------------------------------------------------------------

type ProbeLog = {
  mounts: number;
  unmounts: number;
  /** `open` of the latest commit. */
  open: boolean | null;
  /** `runsOf` calls before the first render with `open === false`. */
  closedAt: number | null;
};

/** Records where the `runsOf` log stood at the first closed render. */
function noteClosed(log: ProbeLog, open: boolean) {
  if (!open && log.closedAt === null) log.closedAt = mockRunsCalls.length;
}

/**
 * A components-only plugin (keeps the fast path) whose CodeBlock records
 * `open` and its mounts, then renders `inner`'s CodeBlock.
 */
function probed(inner: MarkdownPlugin): {
  readonly plugin: MarkdownPlugin;
  readonly log: ProbeLog;
} {
  const Inner = inner.components!.CodeBlock!;
  const log: ProbeLog = { mounts: 0, unmounts: 0, open: null, closedAt: null };
  function Probe(props: ElementProps<'CodeBlock'>) {
    const { open } = props;
    // The probe renders before its block's chunks.
    noteClosed(log, open);
    useEffect(() => {
      log.open = open;
    });
    useEffect(() => {
      log.mounts++;
      return () => {
        log.unmounts++;
      };
    }, []);
    return <Inner {...props} />;
  }
  const plugin = definePlugin({
    name: 'highlight-probe',
    components: { CodeBlock: Probe },
  });
  return { plugin, log };
}

/** A TypeScript tokenizer that counts its calls and input characters. */
function counting(): {
  readonly tokenize: Tokenizer;
  calls: number;
  chars: number;
} {
  const counter = {
    calls: 0,
    chars: 0,
    tokenize: ((code: string) => {
      counter.calls++;
      counter.chars += code.length;
      return javascriptTokenizer(code, 'typescript');
    }) as Tokenizer,
  };
  return counter;
}

// --- Driving the hook ----------------------------------------------------------

const probe = {} as { current: UseMarkdownStreamResult };
function Streamed({
  plugins,
  smooth,
}: {
  readonly plugins: readonly MarkdownPlugin[];
  readonly smooth: boolean;
}) {
  const stream = useMarkdownStream({
    plugins,
    streamingConfig: { smooth },
  });
  useEffect(() => {
    probe.current = stream;
  });
  return <Markdown document={stream.document} plugins={plugins} />;
}

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

/** The code block's root View, or null when none is rendered. */
const codeRoot = (tree: Tree): TestInstance | null => {
  const scrolls = tree.findAll((n) => n.props.horizontal === true);
  if (scrolls.length === 0) return null;
  expect(scrolls).toHaveLength(1);
  return scrolls[0]!.parent;
};
const accessibleCount = (tree: Tree) =>
  tree.findAll((n) => n.props.accessible === true).length;

type Sample = {
  /** Characters appended to the hook so far. */
  readonly sent: number;
  readonly root: TestInstance | null;
  readonly open: boolean | null;
  readonly highlighted: number;
};

/**
 * Streams SOURCE in 40-character appends, one flush each, then `done()` and
 * drains timers. Samples the tree after every flush.
 */
async function streamIn(tree: Tree, log: ProbeLog | null): Promise<Sample[]> {
  const samples: Sample[] = [];
  const sample = (sent: number) =>
    samples.push({
      sent,
      root: codeRoot(tree),
      open: log?.open ?? null,
      highlighted: accessibleCount(tree),
    });
  for (let at = 0; at < SOURCE.length; at += CHUNK) {
    await act(async () => probe.current.append(SOURCE.slice(at, at + CHUNK)));
    await advance(50);
    sample(Math.min(at + CHUNK, SOURCE.length));
  }
  await act(async () => probe.current.done());
  for (let i = 0; i < 20; i++) await advance(16);
  sample(SOURCE.length);
  return samples;
}

/**
 * Whether a core append should take the open-fence fast path: the source
 * before it ended inside the fence body (opener line complete), the chunk
 * reaches no closer character, and the partial last line before and after
 * it is not whitespace only (markdown-it drops such a line, so the core
 * re-parses).
 */
function shouldBeFast({ before, chunk }: CoreAppend): boolean {
  if (before.length < BODY_START) return false;
  if (before.length + chunk.length > CLOSER_START) return false;
  const settled = (text: string) => {
    const lastLine = text.slice(text.lastIndexOf('\n') + 1);
    return lastLine.length === 0 || lastLine.trim().length > 0;
  };
  return settled(before) && settled(before + chunk);
}

type Json = JsonElement | JsonElement[] | null;

/** As serialised: function props (handlers) and `undefined` dropped. */
const plain = (json: Json): unknown => JSON.parse(JSON.stringify(json));

const jsonText = (node: JsonElement | string): string =>
  typeof node === 'string'
    ? node
    : (node.children ?? []).map(jsonText).join('');

/** `plain`, with every Text's children replaced by its text (no spans). */
function uncoloured(json: Json): unknown {
  const walk = (node: JsonElement | string): unknown => {
    if (typeof node === 'string') return node;
    const children =
      node.type === 'Text' ? [jsonText(node)] : (node.children ?? []).map(walk);
    return { ...(plain(node) as object), children };
  };
  if (json === null) return null;
  return Array.isArray(json) ? json.map(walk) : walk(json);
}

const staticJson = async (plugins: readonly MarkdownPlugin[]) =>
  (await renderTree(<Markdown source={SOURCE} plugins={plugins} />)).toJSON();

beforeEach(() => {
  jest.useFakeTimers();
  // The web strategy flushes on a timer (no requestAnimationFrame).
  jest.replaceProperty(Platform, 'OS', 'web');
  mockAppends.length = 0;
  mockRunsCalls.length = 0;
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const TIMEOUT = 120_000;

describe('the document', () => {
  it('is about 20 KB of short-line TypeScript', () => {
    expect(CODE.length).toBeGreaterThanOrEqual(20_000);
    expect(CODE.length).toBeLessThan(21_000);
    expect(CODE.split('\n').every((line) => line.length < 50)).toBe(true);
    expect(CODE.endsWith('\n')).toBe(true);
  });
});

describe.each([
  ['smooth off', false],
  ['smooth on', true],
])('streaming a 20 KB ts fence (%s)', (_, smooth) => {
  it(
    'takes the fence fast path with highlight() installed (P3-32)',
    async () => {
      const plugins = [highlight()];
      const tree = await renderTree(
        <Streamed plugins={plugins} smooth={smooth} />
      );
      await streamIn(tree, null);
      const inFence = mockAppends.filter(shouldBeFast);
      // Most flushes are inside the fence body.
      expect(inFence.length).toBeGreaterThan(
        smooth ? 100 : (0.8 * CODE.length) / CHUNK
      );
      expect(
        inFence
          .filter((a) => a.path !== 'fence-fast-path')
          .map((a) => [
            a.path,
            a.before.length,
            a.before.slice(a.before.lastIndexOf('\n') + 1),
            a.chunk,
          ])
      ).toEqual([]);
      // Outside the body it never claims the fast path.
      const outside = mockAppends.filter(
        (a) => a.before.length + a.chunk.length <= BODY_START - 1
      );
      expect(outside.length).toBeGreaterThan(0);
      expect(outside.every((a) => a.path !== 'fence-fast-path')).toBe(true);
    },
    TIMEOUT
  );

  it(
    'falls back to the tail re-parse with a syntax plugin (emoji) added',
    async () => {
      const plugins = [highlight(), emoji()];
      const tree = await renderTree(
        <Streamed plugins={plugins} smooth={smooth} />
      );
      await streamIn(tree, null);
      expect(mockAppends.filter(shouldBeFast).length).toBeGreaterThan(100);
      expect(mockAppends.filter((a) => a.path === 'fence-fast-path')).toEqual(
        []
      );
    },
    TIMEOUT
  );

  it(
    'keeps one mounted block, renders frozen chunks once, bounds tokenizer work, ends as the static render',
    async () => {
      const counter = counting();
      const { plugin, log } = probed(
        highlight({ languages: { ts: counter.tokenize } })
      );
      const plugins = [plugin];
      const tree = await renderTree(
        <Streamed plugins={plugins} smooth={smooth} />
      );
      const samples = await streamIn(tree, log);

      // (b) `open`: true while the fence is unclosed, false after the
      // closer and after done(). Paced text lags, so check the shape of
      // the sequence, and the exact value where the stream is unambiguous.
      const opens = samples.map((s) => s.open).filter((o) => o !== null);
      const firstFalse = opens.indexOf(false);
      expect(opens.slice(0, firstFalse).length).toBeGreaterThan(100);
      expect(opens.slice(0, firstFalse).every((o) => o === true)).toBe(true);
      expect(opens.slice(firstFalse).every((o) => o === false)).toBe(true);
      expect(samples[samples.length - 1]!.open).toBe(false);
      if (!smooth) {
        for (const s of samples) {
          if (s.sent > BODY_START + 1 && s.sent <= CLOSER_START) {
            expect([s.sent, s.open]).toEqual([s.sent, true]);
          }
          if (s.sent >= CLOSER_START + CLOSER.length) {
            expect([s.sent, s.open]).toEqual([s.sent, false]);
          }
        }
      }

      // (c) No remount: the probe mounted once, and the block's root View
      // is one host instance from its first flush to after done().
      expect(log).toMatchObject({ mounts: 1, unmounts: 0 });
      const roots = samples.map((s) => s.root).filter((r) => r !== null);
      expect(roots.length).toBeGreaterThan(100);
      expect(roots.every((r) => r === roots[0])).toBe(true);
      expect(samples.every((s) => s.highlighted <= 1)).toBe(true);

      // (c) While open, a frozen chunk renders once: one `runsOf` per
      // frozen object, and every chunk but the last freezes.
      const chunkCount = chunkAll(CODE.slice(0, -1), plainTokens, 'ts').length;
      expect(log.closedAt).not.toBeNull();
      const whileOpen = mockRunsCalls.slice(0, log.closedAt!);
      const frozen = whileOpen.filter((c) => c.frozen);
      const perObject = new Map<Chunk, number>();
      for (const c of frozen) perObject.set(c, (perObject.get(c) ?? 0) + 1);
      expect([...perObject.values()].filter((n) => n !== 1)).toEqual([]);
      // The last line pair may first freeze in the closing render.
      expect(
        new Set(mockRunsCalls.filter((c) => c.frozen).map((c) => c.id)).size
      ).toBeGreaterThanOrEqual(chunkCount - 1);
      // Each frozen id has one object (no re-freeze after a truncation).
      expect(perObject.size).toBe(new Set(frozen.map((c) => c.id)).size);
      // Chunk renders grow with flushes, not flushes x chunks.
      const flushes = samples.length;
      expect(whileOpen.length).toBeLessThan(chunkCount + 3 * flushes + 10);
      // At close, only chunks whose colours changed render again (here the
      // interface members after the first), each at most once.
      const atClose = mockRunsCalls.slice(log.closedAt!);
      expect(atClose.length).toBeGreaterThan(0);
      expect(atClose.length).toBeLessThanOrEqual(chunkCount);
      expect(new Set(atClose).size).toBe(atClose.length);

      // (c) Tokenizer work stays within the chunker's bound, plus one full
      // pass at close.
      expect(counter.chars).toBeLessThan(4 * CODE.length);
      expect(counter.calls).toBeLessThan(flushes + 11);

      // (d) The published document equals parse(), and the final tree
      // equals a static render (colours: the next test).
      expect(documentToHtml(tableOf(probe.current.document))).toBe(
        documentToHtml(tableOf(parse(SOURCE, { plugins })))
      );
      expect(uncoloured(tree.toJSON())).toEqual(
        uncoloured(await staticJson(plugins))
      );
    },
    TIMEOUT
  );

  // Streaming colours may be approximate: the chunker re-feeds one line of
  // left context, but the TypeScript tokenizer classifies a member key by
  // the enclosing brace, so `name` and `tags` in `interface A {...}` stream
  // as `plain`. The one full re-tokenize at close makes them `property`.
  it(
    'ends exactly equal to the static render (colours included)',
    async () => {
      const plugins = [highlight()];
      const tree = await renderTree(
        <Streamed plugins={plugins} smooth={smooth} />
      );
      await streamIn(tree, null);
      expect(plain(tree.toJSON())).toEqual(plain(await staticJson(plugins)));
    },
    TIMEOUT
  );

  it(
    'switches a fence over maxLength to plain once, and stays plain',
    async () => {
      const maxLength = 2000;
      const { plugin, log } = probed(highlight({ maxLength }));
      const plugins = [plugin];
      const tree = await renderTree(
        <Streamed plugins={plugins} smooth={smooth} />
      );
      const samples = await streamIn(tree, log);
      const states = samples
        .filter((s) => s.root !== null)
        .map((s) => s.highlighted);
      expect(states[0]).toBe(1);
      const switchAt = states.indexOf(0);
      expect(switchAt).toBeGreaterThan(0);
      expect(states.slice(switchAt).every((h) => h === 0)).toBe(true);
      if (!smooth) {
        // It switched on the first flush whose code went over the cap.
        const withRoot = samples.filter((s) => s.root !== null);
        const codeAt = (s: Sample) => s.sent - BODY_START;
        expect(codeAt(withRoot[switchAt - 1]!)).toBeLessThanOrEqual(
          maxLength + CHUNK
        );
        expect(codeAt(withRoot[switchAt]!)).toBeGreaterThan(maxLength);
      }
      // The probe (the plugin's element) never remounted; the inner
      // subtree swap to the default block is expected.
      expect(log).toMatchObject({ mounts: 1, unmounts: 0 });
      expect(plain(tree.toJSON())).toEqual(plain(await staticJson(plugins)));
    },
    TIMEOUT
  );
});
