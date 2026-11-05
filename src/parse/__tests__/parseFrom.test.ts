import { dump } from './dump';
import { NodeType, type NodeTable } from '../../model';
import { readSpec } from '../../../test/utils/specReader';
import { markdownItBackend } from '../markdownItBackend';
import type { ParseOptions } from '../backend';
import type { CarriedContext } from '../../stream/types';

const parseFrom = markdownItBackend.parseFrom!;
const parse = (s: string, o?: ParseOptions) => markdownItBackend.parse(s, o);

/** Everything about block `i`, ids excluded. */
const blockView = (t: NodeTable, i: number) => ({
  start: t.blockStart[i],
  end: t.blockEnd[i],
  context: t.blockContext[i],
  tree: dump(t, t.blocks[i]!),
});

const isSection = (t: NodeTable, i: number) =>
  t.type[t.blocks[i]!] === NodeType.FootnoteSection;

/** Carried context of `source[0, offset)` parsed on its own. */
const carriedBefore = (source: string, offset: number, o?: ParseOptions) =>
  parseFrom(source.slice(0, offset), 0, undefined, o).carried;

/**
 * Checks `parseFrom(source, offset of block firstBlock)` against the full
 * parse: every tail block equals the full parse's block, and the table-level
 * fields match. Skipped when a full-reparse trigger fires (the stream core
 * would not use the result).
 */
function checkTail(
  source: string,
  full: NodeTable,
  firstBlock: number,
  o?: ParseOptions,
  seed?: CarriedContext
) {
  const offset = full.blockStart[firstBlock]!;
  const r = parseFrom(
    source,
    offset,
    seed ?? carriedBefore(source, offset, o),
    o
  );
  if (r.newReferences || r.hasFootnoteDefinition) return r;
  expect(r.table.source).toBe(source);
  expect(r.table.context).toBe(full.context);
  expect(r.table.blockCount).toBe(full.blockCount - firstBlock);
  for (let i = 0; i < r.table.blockCount; i++) {
    expect(blockView(r.table, i)).toEqual(blockView(full, firstBlock + i));
  }
  return r;
}

const SUITES = [
  ['commonmark/spec.txt', 'commonmark'],
  ['gfm/spec.txt', 'gfm'],
  ['gfm/extensions.txt', 'gfm-extensions'],
] as const;

const view = (t: NodeTable) => ({
  context: t.context,
  source: t.source,
  count: t.count,
  tree: dump(t),
  blocks: Array.from({ length: t.blockCount }, (_, i) => blockView(t, i)),
});

describe('parseFrom at offset 0', () => {
  for (const [file, suite] of SUITES) {
    it(`equals parse() for every ${suite} example`, () => {
      for (const ex of readSpec(file, suite)) {
        const full = parse(ex.markdown);
        const r = parseFrom(ex.markdown, 0, undefined);
        expect(view(r.table)).toEqual(view(full));
      }
    });
  }
});

describe('parseFrom at block boundaries', () => {
  for (const [file, suite] of SUITES) {
    it(`tail blocks equal the full parse for ${suite} examples`, () => {
      for (const ex of readSpec(file, suite)) {
        const full = parse(ex.markdown);
        for (let k = 1; k < full.blockCount; k++) {
          if (isSection(full, k)) continue;
          checkTail(ex.markdown, full, k);
        }
      }
    });
  }
});

const DOC = [
  '# Intro',
  '',
  'See [spec] and [other][o].',
  '',
  '[spec]: https://example.com/spec "Spec"',
  '',
  '## Intro',
  '',
  'text',
  '',
  '# Intro',
  '',
  '[o]: /other',
  '',
  '## Intro',
  '',
  '# Intro-1',
  '',
  'tail [spec] and [o] and [missing]',
  '',
  '# Intro',
  '',
].join('\n');

describe('duplicate heading slugs and references', () => {
  const full = parse(DOC);
  const headingIds = (t: NodeTable) => {
    const ids: string[] = [];
    for (let i = 0; i < t.blockCount; i++) {
      const d = dump(t, t.blocks[i]!);
      if (d.type === 'Heading') ids.push((d.attrs as { id: string }).id);
    }
    return ids;
  };

  it('has the expected slugs in a full parse', () => {
    expect(headingIds(full)).toEqual([
      'intro',
      'intro-1',
      'intro-2',
      'intro-3',
      'intro-1-1',
      'intro-4',
    ]);
  });

  it('matches the full parse from every block that is a valid seed', () => {
    let checked = 0;
    for (let k = 1; k < full.blockCount; k++) {
      const offset = full.blockStart[k]!;
      const r = parseFrom(DOC, offset, carriedBefore(DOC, offset));
      if (!r.newReferences) {
        checkTail(DOC, full, k);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('seeds slug counters from the prefix', () => {
    const offset = DOC.indexOf('# Intro-1');
    const r = parseFrom(DOC, offset, carriedBefore(DOC, offset));
    expect(headingIds(r.table)).toEqual(['intro-1-1', 'intro-4']);
  });

  it('flags definitions found in the tail', () => {
    const offset = DOC.indexOf('## Intro\n\ntext');
    const r = parseFrom(DOC, offset, carriedBefore(DOC, offset));
    expect(r.newReferences).toBe(true);
  });

  it('seeds references so tail links resolve and context is merged', () => {
    const offset = DOC.indexOf('# Intro-1');
    const r = parseFrom(DOC, offset, carriedBefore(DOC, offset));
    expect(r.newReferences).toBe(false);
    expect(r.table.context).toBe(full.context);
    const paragraph = JSON.stringify(dump(r.table, r.table.blocks[1]!));
    expect(paragraph).toContain('https://example.com/spec');
    expect(paragraph).toContain('/other');
  });

  it('prefixCarried seeds the next append from the last block', () => {
    const first = parseFrom(DOC, 0, undefined);
    const last = first.table.blockCount - 1;
    // The resumption point is the last block; its seed is prefixCarried.
    const next = checkTail(DOC, full, last, undefined, first.prefixCarried);
    expect(next.table.blockStart[0]).toBe(full.blockStart[last]);
    expect(headingIds(next.table)).toEqual(['intro-4']);
  });

  it('carries a definition in the gap before the last block', () => {
    const src = 'para\n\n[a]: /x\n\n[a] link\n';
    const r = parseFrom(src, 0, undefined);
    expect(r.table.blockCount).toBe(2);
    const next = checkTail(src, parse(src), 1, undefined, r.prefixCarried);
    expect(next.newReferences).toBe(false);
    expect(JSON.stringify(dump(next.table))).toContain('"/x"');
  });

  it('a tail defining an existing label is not new (first wins)', () => {
    const src = '[a]: /x\n\nuse [a]\n\n[a]: /y\n\nuse [a]\n';
    const full2 = parse(src);
    const r = parseFrom(src, src.indexOf('[a]: /y'), carriedBefore(src, 8));
    expect(r.newReferences).toBe(false);
    expect(r.table.context).toBe(full2.context);
    expect(JSON.stringify(dump(r.table))).not.toContain('/y"');
  });

  it('keeps context equal across consecutive appends', () => {
    let carried: CarriedContext | undefined;
    let offset = 0;
    let text = 'a\n\n[x]: /u\n\n[x] one';
    const contexts = new Set<string>();
    for (let i = 0; i < 3; i++) {
      text += ' more';
      const r = parseFrom(text, offset, carried);
      contexts.add(r.table.context);
      carried = r.prefixCarried;
      offset = r.table.blockStart[r.table.blockCount - 1]!;
    }
    expect(contexts.size).toBe(1);
    expect([...contexts][0]).toBe(parse(text).context);
  });
});

describe('footnotes', () => {
  const src = [
    'First[^a] and [^b].',
    '',
    '[^a]: Note a.',
    '',
    '[^b]: Note b.',
    '',
    'Later [^b] and [^a] again.',
    '',
    'Last [^a].',
    '',
  ].join('\n');

  it('offset 0 equals parse()', () => {
    const r = parseFrom(src, 0, undefined);
    expect(view(r.table)).toEqual(view(parse(src)));
    expect(r.hasFootnoteDefinition).toBe(true);
  });

  it('rebuilds the section with prefix definitions and numbering', () => {
    const full = parse(src);
    const offset = src.indexOf('Later');
    const seed = parseFrom(src.slice(0, offset), 0, undefined).carried;
    const r = parseFrom(src, offset, seed);
    expect(r.hasFootnoteDefinition).toBe(false);
    expect(r.table.context).toBe(full.context);
    const first = full.blockCount - 3; // Later, Last, section
    expect(r.table.blockCount).toBe(3);
    for (let i = 0; i < r.table.blockCount; i++) {
      expect(blockView(r.table, i)).toEqual(blockView(full, first + i));
    }
    expect(isSection(r.table, 2)).toBe(true);
  });

  it('prefixCarried resumes at the last real block, not the section', () => {
    const full = parse(src);
    const r = parseFrom(src, 0, undefined);
    // "First", "Later", "Last", then the section.
    expect(r.table.blockCount).toBe(4);
    const next = parseFrom(src, r.table.blockStart[2]!, r.prefixCarried);
    expect(next.hasFootnoteDefinition).toBe(false);
    for (let i = 0; i < next.table.blockCount; i++) {
      expect(blockView(next.table, i)).toEqual(blockView(full, 2 + i));
    }
  });

  it('does not carry headings of the section', () => {
    const doc = 'a[^n]\n\n[^n]: # Title\n\n# Title\n';
    const full = parse(doc);
    const r = parseFrom(doc, 0, undefined);
    expect(view(r.table)).toEqual(view(full));
  });
});

describe('options and line endings', () => {
  it('works with CRLF sources', () => {
    const src = '# A\r\n\r\n# A\r\n\r\ntext\r\n';
    checkTail(src, parse(src), 2);
  });

  it('rejects carried context from another backend', () => {
    const bogus = {} as unknown as CarriedContext;
    expect(() => parseFrom('a\n\nb', 3, bogus)).toThrow(TypeError);
  });

  it('respects the html option and presets', () => {
    const src = 'a\n\n<b>x</b>\n\n# H\n\n# H\n';
    const o: ParseOptions = { preset: 'commonmark', html: 'text' };
    const full = parse(src, o);
    for (let k = 1; k < full.blockCount; k++) checkTail(src, full, k, o);
  });
});
