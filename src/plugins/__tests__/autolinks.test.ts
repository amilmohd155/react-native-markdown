import type { HtmlMode, Preset } from '../../parse';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { dumpBlocks, type Dumped } from '../../parse/__tests__/dump';

const inline = (
  src: string,
  preset: Preset = 'gfm',
  html?: HtmlMode
): Dumped[] =>
  dumpBlocks(parseWithMarkdownIt(src, { preset, html }).table)[0]!.children ??
  [];

const text = (t: string): Dumped => ({ type: 'Text', text: t });
const auto = (href: string, label: string): Dumped => ({
  type: 'Link',
  flags: ['AUTOLINK'],
  attrs: { href, title: null },
  children: [text(label)],
});

describe('autolinks (GFM)', () => {
  it.each([
    ['www.', 'www.example.com', 'http://www.example.com'],
    ['http://', 'http://example.com/a', 'http://example.com/a'],
    ['https://', 'https://example.com', 'https://example.com'],
    ['ftp://', 'ftp://example.com/f', 'ftp://example.com/f'],
    ['an email', 'me@example.com', 'mailto:me@example.com'],
    ['mailto:', 'mailto:me@example.com', 'mailto:me@example.com'],
    ['xmpp:', 'xmpp:me@example.com/home', 'xmpp:me@example.com/home'],
  ])('links %s', (_, url, href) => {
    expect(inline(`see ${url} now\n`)).toEqual([
      text('see '),
      auto(href, url),
      text(' now'),
    ]);
  });

  it.each([
    ['file names with real TLDs', 'README.md and file.js'],
    ['bare domains', 'example.com'],
    ['other schemes', 'foo://example.com'],
    ['a + in an email domain', 'me@exa+mple.com'],
    ['an _ in the last labels of a www host', 'www.exa_mple.com'],
    ['bare IPs', '192.168.0.1'],
  ])('does not link %s', (_, src) => {
    const children = inline(`${src}\n`);
    expect(children.some((c) => c.type === 'Link')).toBe(false);
  });

  it('trims trailing punctuation', () => {
    expect(inline('Visit www.example.com/a?b.\n')).toEqual([
      text('Visit '),
      auto('http://www.example.com/a?b', 'www.example.com/a?b'),
      text('.'),
    ]);
    expect(inline('(see https://example.com/x!)\n')).toEqual([
      text('(see '),
      auto('https://example.com/x', 'https://example.com/x'),
      text('!)'),
    ]);
  });

  it('keeps balanced parentheses and trims an unbalanced one', () => {
    expect(inline('www.example.com/a_(b)\n')).toEqual([
      auto('http://www.example.com/a_(b)', 'www.example.com/a_(b)'),
    ]);
    expect(inline('(www.example.com/a)\n')).toEqual([
      text('('),
      auto('http://www.example.com/a', 'www.example.com/a'),
      text(')'),
    ]);
  });

  it('trims a trailing entity reference', () => {
    expect(inline('www.example.com/a&hl;\n')).toEqual([
      auto('http://www.example.com/a', 'www.example.com/a'),
      text('&hl;'),
    ]);
  });

  it('keeps emphasis characters inside scheme URLs', () => {
    expect(inline('https://example.com/a_b_c\n')).toEqual([
      auto('https://example.com/a_b_c', 'https://example.com/a_b_c'),
    ]);
  });

  it('links inside strikethrough and emphasis', () => {
    const del = (link: Dumped): Dumped => ({
      type: 'Strikethrough',
      children: [link],
    });
    expect(inline('~~www.example.com~~\n')).toEqual([
      del(auto('http://www.example.com', 'www.example.com')),
    ]);
    expect(inline('~~https://example.com~~\n')).toEqual([
      del(auto('https://example.com', 'https://example.com')),
    ]);
    expect(inline('*www.example.com*\n')).toEqual([
      {
        type: 'Emphasis',
        children: [auto('http://www.example.com', 'www.example.com')],
      },
    ]);
  });

  it('does not link inside links, code or an HTML <a>', () => {
    expect(inline('[www.example.com](/u)\n')).toEqual([
      {
        type: 'Link',
        attrs: { href: '/u', title: null },
        children: [text('www.example.com')],
      },
    ]);
    expect(inline('`www.example.com`\n')).toEqual([
      { type: 'InlineCode', text: 'www.example.com' },
    ]);
    const html = inline('<a href="/u">www.example.com</a>\n', 'gfm', 'text');
    expect(html.some((c) => c.type === 'Link')).toBe(false);
  });

  it('keeps CommonMark <…> autolinks, also flagged AUTOLINK', () => {
    expect(inline('<https://example.com>\n', 'commonmark')).toEqual([
      auto('https://example.com', 'https://example.com'),
    ]);
  });

  it('is plain text without the plugin', () => {
    const preset: Preset = { base: 'gfm', exclude: ['autolinks'] };
    expect(inline('www.example.com https://example.com\n', preset)).toEqual([
      text('www.example.com https://example.com'),
    ]);
  });

  it('stays fast on long runs of URL-like text', () => {
    const src = 'www.example.com/a. '.repeat(5000) + '\n';
    const start = Date.now();
    const links = inline(src).filter((c) => c.type === 'Link');
    expect(Date.now() - start).toBeLessThan(2000);
    expect(links).toHaveLength(5000);
  });
});
