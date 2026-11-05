import { parseWithMarkdownIt } from '../../parse';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import { diffDocuments, diffTables } from '../../../test/stream/harness';
import { createMarkdownStreamCoreWith } from '../createMarkdownStream';
import { hideIncomplete } from '../smoothing';

/** Documents whose completed constructs all render (no literal markers). */
const DOCS = [
  'Hello **bold** and *it* and `code` and [a link](http://example.com/x) end.\n\n' +
    'Second ~~del~~ para with ![img](http://x/y.png) done.\n\n',
  '# Title\n\nText **a *b* c** and [x](http://y).\n\n- item **one**\n- item `two`\n\n> quote *q*\n',
  'Intro line\n\n[ref]: http://example.com\n\nSee [ref] and **strong** <b>tag</b> here',
  'A **a [b](http://c) d** tail with `x` and more',
];

const html = (t: Parameters<typeof documentToHtml>[0]) => documentToHtml(t);

const plain = (h: string) => h.replace(/<[^>]*>/g, '');

describe('stream smoothing option', () => {
  it("'none' is identical to a core created without the option", () => {
    const text = DOCS.join('');
    const a = createMarkdownStreamCoreWith();
    const b = createMarkdownStreamCoreWith({ smoothing: 'none' });
    for (let i = 0; i < text.length; i += 7) {
      const ta = a.append(text.slice(i, i + 7));
      const tb = b.append(text.slice(i, i + 7));
      expect(diffTables(tb, ta)).toBeNull();
      expect(tb.source).toBe(ta.source);
      expect(tb.stableCount).toBe(ta.stableCount);
      expect(b.table).toBe(tb);
      expect(b.lastFlush).toEqual(a.lastFlush);
    }
  });

  it('shows the open block minus the dangling fragment, closed blocks exact', () => {
    for (const doc of DOCS) {
      for (let at = 1; at < doc.length; at++) {
        const exact = createMarkdownStreamCoreWith();
        const core = createMarkdownStreamCoreWith({
          smoothing: 'hide-incomplete',
        });
        for (const c of [doc.slice(0, at), doc.slice(at)]) {
          exact.append(c);
          const view = core.append(c);
          const t = exact.table;
          const closed = t.stableCount ?? 0;
          const openStart = t.blockCount > 0 ? t.blockStart[closed]! : 0;
          const src = exact.source;
          const hidden = hideIncomplete(src.slice(openStart));
          const expected = parseWithMarkdownIt(
            src.slice(0, openStart) + hidden
          ).table;
          expect(html(view)).toBe(html(expected));
          if (hidden === src.slice(openStart)) {
            expect(diffTables(view, t)).toBeNull();
          }
          for (let i = 0; i < closed; i++) {
            expect(view.blockStart[i]).toBe(t.blockStart[i]);
            expect(view.blockEnd[i]).toBe(t.blockEnd[i]);
          }
          // Offsets stay inside the real source.
          for (let i = 0; i < view.blockCount; i++) {
            expect(view.blockEnd[i]!).toBeLessThanOrEqual(src.length);
          }
          expect(core.table).toBe(view);
        }
      }
    }
  });

  it('never shows a dangling marker', () => {
    const doc = DOCS[0]! + DOCS[3]!;
    const core = createMarkdownStreamCoreWith({ smoothing: 'hide-incomplete' });
    for (let i = 0; i < doc.length; i++) {
      const text = plain(html(core.append(doc[i]!)));
      expect(text).not.toMatch(/\*\*/);
      expect(text).not.toMatch(/`/);
      expect(text).not.toMatch(/\[[^\]]*\]\(http/);
      expect(text).not.toMatch(/~~/);
    }
  });

  it('keeps source real, and done() equals the full parse after any partial input', () => {
    for (const doc of DOCS) {
      for (let end = 0; end <= doc.length; end++) {
        const part = doc.slice(0, end);
        const core = createMarkdownStreamCoreWith({
          smoothing: 'hide-incomplete',
        });
        const half = Math.floor(part.length / 2);
        if (half > 0) core.append(part.slice(0, half));
        const view = core.append(part.slice(half));
        expect(view.source).toBe(part);
        expect(core.source).toBe(part);
        const done = core.done();
        expect(diffDocuments(done, parseWithMarkdownIt(part).table)).toBeNull();
        expect(core.table).toBe(done);
        expect(core.source).toBe(part);
      }
    }
  });

  it('reset returns the exact parse', () => {
    const core = createMarkdownStreamCoreWith({ smoothing: 'hide-incomplete' });
    const t = core.reset('text **open');
    expect(
      diffDocuments(t, parseWithMarkdownIt('text **open').table)
    ).toBeNull();
  });

  it('later appends after a smoothed view reach the same final table', () => {
    for (const doc of DOCS) {
      const exact = createMarkdownStreamCoreWith();
      const core = createMarkdownStreamCoreWith({
        smoothing: 'hide-incomplete',
      });
      for (let i = 0; i < doc.length; i += 3) {
        exact.append(doc.slice(i, i + 3));
        core.append(doc.slice(i, i + 3));
      }
      expect(core.source).toBe(exact.source);
      expect(core.lastFlush).toEqual(exact.lastFlush);
      expect(diffDocuments(core.done(), exact.done())).toBeNull();
    }
  });
});
