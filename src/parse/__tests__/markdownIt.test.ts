import type { Token } from 'markdown-it';
import { getMarkdownIt, MAX_NESTING } from '../markdownIt';

const tokenTypes = (md: ReturnType<typeof getMarkdownIt>, src: string) =>
  md.parse(src, {}).map((t) => t.type);

describe('getMarkdownIt', () => {
  it('returns one shared instance per preset', () => {
    expect(getMarkdownIt('commonmark')).toBe(getMarkdownIt('commonmark'));
    expect(getMarkdownIt('gfm')).toBe(getMarkdownIt('gfm'));
    expect(getMarkdownIt('gfm')).not.toBe(getMarkdownIt('commonmark'));
  });

  it.each(['commonmark', 'gfm'] as const)(
    // `linkify` stays off: the autolinks plugin replaces markdown-it's linkify rules.
    '%s: tokenizes HTML, no linkify option or typographer, capped nesting',
    (preset) => {
      const { options } = getMarkdownIt(preset);
      expect(options).toMatchObject({
        html: true,
        linkify: false,
        typographer: false,
        maxNesting: MAX_NESTING,
      });
    }
  );

  it('commonmark: no GFM tables or strikethrough', () => {
    const md = getMarkdownIt('commonmark');
    expect(tokenTypes(md, '| a |\n|---|\n| b |\n')).not.toContain('table_open');
    const inline = md
      .parseInline('~~x~~', {})[0]!
      .children!.map((t: Token) => t.type);
    expect(inline).not.toContain('s_open');
  });

  it('gfm: tables and strikethrough', () => {
    const md = getMarkdownIt('gfm');
    expect(tokenTypes(md, '| a |\n|---|\n| b |\n')).toContain('table_open');
    const inline = md
      .parseInline('~~x~~', {})[0]!
      .children!.map((t: Token) => t.type);
    expect(inline).toContain('s_open');
  });

  it('autolinks bare URLs only through the autolinks plugin (gfm)', () => {
    const types = (preset: 'gfm' | 'commonmark') =>
      getMarkdownIt(preset)
        .parseInline('see https://example.com', {})[0]!
        .children!.map((t: Token) => t.type);
    expect(types('commonmark')).not.toContain('link_open');
    expect(types('gfm')).toContain('link_open');
  });

  it('survives very deep nesting instead of overflowing the stack', () => {
    const md = getMarkdownIt('commonmark');
    const tokens = md.parse('> '.repeat(25000) + 'a', {});
    const depth = tokens.filter((t) => t.type === 'blockquote_open').length;
    expect(depth).toBe(MAX_NESTING);
  });
});
