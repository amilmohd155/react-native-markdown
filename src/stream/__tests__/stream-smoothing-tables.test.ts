/**
 * Tables in the smoothed view (P2b-3), streamed one character at a time
 * through the core with `hide-incomplete`. Spec:
 * docs/rewrite/phase-2/smoothing.md#tables
 *
 * Oracle: for a table whose header line starts at `header` and whose
 * delimiter row ends with the newline at `delimiterEnd - 1`, the text shown
 * at a prefix inside the table is
 * - the text before the header, until the delimiter row has its newline;
 * - after that, everything through the last `\n`.
 * The view must render like a full parse of that text.
 */
import type { NodeTable } from '../../model';
import { parseWithMarkdownIt } from '../../parse';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import { diffDocuments, diffTables } from '../../../test/stream/harness';
import { createMarkdownStreamCoreWith } from '../createMarkdownStream';

const html = (t: NodeTable) => documentToHtml(t);
const parseHtml = (s: string) => html(parseWithMarkdownIt(s).table);

/** Body rows rendered in the last table of `h`. */
const bodyRows = (h: string): number => {
  const table = h.slice(h.lastIndexOf('<table>'));
  const body = table.indexOf('<tbody>');
  if (body < 0) return 0;
  return table.slice(body).split('<tr>').length - 1;
};

interface TableSpan {
  /** Offset of the header line's first `|` (after any list or quote marker). */
  readonly header: number;
  /** Offset just after the delimiter row's newline. */
  readonly delimiterEnd: number;
  /** Offset where the table's run of lines ends (after the blank line, or the end). */
  readonly end: number;
}

/** The tables of `doc`, found by their header text. */
function spans(doc: string, headers: readonly string[]): TableSpan[] {
  let from = 0;
  return headers.map((h) => {
    const header = doc.indexOf(h, from);
    expect(header).toBeGreaterThanOrEqual(0);
    const firstNl = doc.indexOf('\n', header);
    const delimiterEnd = doc.indexOf('\n', firstNl + 1) + 1;
    const blank = doc.indexOf('\n\n', delimiterEnd - 1);
    const end = blank < 0 ? doc.length : blank + 2;
    from = end;
    return { header, delimiterEnd, end };
  });
}

/** Expected visible text at `prefix`, or null outside every table. */
function expectedView(prefix: string, tables: TableSpan[]): string | null {
  const p = prefix.length;
  for (const t of tables) {
    if (p <= t.header || p > t.end) continue;
    if (p < t.delimiterEnd) return prefix.slice(0, t.header);
    return prefix.slice(0, prefix.lastIndexOf('\n') + 1);
  }
  return null;
}

/** Streams `doc` one character at a time; calls `check` with each view. */
function streamChars(
  doc: string,
  check: (view: NodeTable, prefix: string) => void
): NodeTable {
  const core = createMarkdownStreamCoreWith({ smoothing: 'hide-incomplete' });
  for (let i = 1; i <= doc.length; i++) {
    const view = core.append(doc[i - 1]!);
    expect(view.source).toBe(doc.slice(0, i));
    check(view, doc.slice(0, i));
  }
  return core.done();
}

const CASES: Array<[string, string, string[]]> = [
  [
    'after a blank line',
    'Intro para.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n',
    ['| a |'],
  ],
  [
    'directly after a paragraph line',
    'Intro para.\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n',
    ['| a |'],
  ],
  [
    'two tables, aligned columns, a paragraph between',
    '| a | b |\n|:-:|--:|\n| 1 | 2 |\n\nBetween.\n\n| x |\n|---|\n| y |\n| z |\n',
    ['| a |', '| x |'],
  ],
  [
    'emphasis and code in cells, then a paragraph',
    '| a | b |\n| - | - |\n| **x** | `y` |\n| **u | v |\n\nNext **bold** and [link](http://x.dev) end.\n',
    ['| a |'],
  ],
  ['in a list item', '- | a |\n  |---|\n  | 1 |\n  | 2 |\n', ['| a |']],
  ['in a quote', '> | a |\n> |---|\n> | 1 |\n> | 2 |\n', ['| a |']],
  [
    'no trailing newline',
    'Text.\n\n| a | b |\n|---|---|\n| 1 | 2 |',
    ['| a |'],
  ],
];

describe('smoothed tables, split at every position', () => {
  it.each(CASES)('%s: matches the oracle', (_name, doc, headers) => {
    const tables = spans(doc, headers);
    let inside = 0;
    const done = streamChars(doc, (view, prefix) => {
      const expected = expectedView(prefix, tables);
      if (expected === null) return;
      inside++;
      expect({ prefix, html: html(view) }).toEqual({
        prefix,
        html: parseHtml(expected),
      });
    });
    expect(inside).toBeGreaterThan(20);
    expect(diffDocuments(done, parseWithMarkdownIt(doc).table)).toBeNull();
  });

  it.each(CASES)(
    '%s: no literal pipes, no partial or padded rows',
    (_name, doc, headers) => {
      const tables = spans(doc, headers);
      streamChars(doc, (view, prefix) => {
        const h = html(view);
        // Header text never shows as a paragraph (or list item) of pipes.
        expect(h).not.toMatch(/<(p|li)>[^<]*\|/);
        // Body rows: exactly the finished row lines of the streaming table.
        const t = tables.find(
          (s) => prefix.length > s.header && prefix.length <= s.end
        );
        if (t && prefix.length >= t.delimiterEnd) {
          const finished = prefix
            .slice(t.delimiterEnd, prefix.lastIndexOf('\n') + 1)
            .split('\n')
            .filter((line) => line.trim().length > 0).length;
          expect({ prefix, rows: bodyRows(h) }).toEqual({
            prefix,
            rows: finished,
          });
          // No cell padded for a half-written row.
          expect(h).not.toMatch(/<td[^>]*><\/td>/);
        }
      });
    }
  );

  it('done() at any prefix equals the full parse', () => {
    for (const [, doc] of CASES) {
      for (let end = 0; end <= doc.length; end++) {
        const part = doc.slice(0, end);
        const core = createMarkdownStreamCoreWith({
          smoothing: 'hide-incomplete',
        });
        for (const ch of part) core.append(ch);
        expect(
          diffDocuments(core.done(), parseWithMarkdownIt(part).table)
        ).toBeNull();
      }
    }
  });

  it("'none' shows the exact parse at every prefix", () => {
    for (const [, doc] of CASES) {
      const core = createMarkdownStreamCoreWith({ smoothing: 'none' });
      for (let i = 1; i <= doc.length; i++) {
        const view = core.append(doc[i - 1]!);
        expect(
          diffTables(view, parseWithMarkdownIt(doc.slice(0, i)).table)
        ).toBeNull();
      }
    }
  });

  it('inline hiding still works in a paragraph after a table', () => {
    const doc = '| a |\n|---|\n| 1 |\n\nNext **bo';
    const core = createMarkdownStreamCoreWith({ smoothing: 'hide-incomplete' });
    core.append(doc);
    expect(html(core.table)).toBe(parseHtml('| a |\n|---|\n| 1 |\n\nNext '));
  });
});

describe('smoothed tables: what is not a table', () => {
  it('a delimiter row with a different column count leaves a paragraph', () => {
    // markdown-it needs exactly the header's column count.
    // A line that starts with `|` waits for the next line (it could head a
    // table that interrupts the paragraph), so the documents end in `more`.
    for (const doc of [
      '| a | b |\n|---|\nmore\n',
      '| a | b |\n|---|---|---|\nmore\n',
    ]) {
      const exact = parseWithMarkdownIt(doc).table;
      expect(html(exact)).toMatch(/^<p>/);
      streamChars(doc, (view, prefix) => {
        expect(html(view)).not.toContain('<table>');
        if (prefix === doc) expect(html(view)).toBe(html(exact));
      });
    }
  });

  it('rows without a leading pipe are not detected (shown as parsed)', () => {
    const doc = 'a | b\n--|--\n1 | 2\n3 | 4\n';
    streamChars(doc, (view, prefix) => {
      expect(html(view)).toBe(parseHtml(prefix));
    });
    // So a partial row shows, padded.
    const core = createMarkdownStreamCoreWith({ smoothing: 'hide-incomplete' });
    core.append('a | b\n--|--\n1');
    expect(html(core.table)).toContain('<td>1</td>\n<td></td>');
  });
});
