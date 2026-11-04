import type { HtmlMode, Preset } from '../../parse';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { dumpBlocks, type Dumped } from '../../parse/__tests__/dump';

const blocks = (src: string, html: HtmlMode = 'text', preset: Preset = 'gfm') =>
  dumpBlocks(parseWithMarkdownIt(src, { preset, html }).table);

const html = (source: string, filteredHtml?: string): Dumped => ({
  type: 'HtmlInline',
  text: source,
  ...(filteredHtml === undefined ? {} : { attrs: { filteredHtml } }),
});

describe('tagfilter (GFM)', () => {
  it.each([
    'title',
    'textarea',
    'style',
    'xmp',
    'iframe',
    'noembed',
    'noframes',
    'script',
    'plaintext',
  ])('filters <%s>, keeping the source as the node text', (tag) => {
    const [paragraph] = blocks(`a <${tag}> b </${tag}>\n`);
    expect(paragraph!.children).toEqual([
      { type: 'Text', text: 'a ' },
      html(`<${tag}>`, `&lt;${tag}>`),
      { type: 'Text', text: ' b ' },
      html(`</${tag}>`, `&lt;/${tag}>`),
    ]);
  });

  it('matches any case, and only whole tag names', () => {
    // (At the start of a line, <script> would open an HTML block.)
    const [paragraph] = blocks(
      'a <SCRIPT> <scripts> <script/> <script x="1">\n'
    );
    expect(paragraph!.children!.filter((c) => c.type === 'HtmlInline')).toEqual(
      [
        html('<SCRIPT>', '&lt;SCRIPT>'),
        html('<scripts>'),
        html('<script/>', '&lt;script/>'),
        html('<script x="1">', '&lt;script x="1">'),
      ]
    );
  });

  it('leaves other tags alone', () => {
    const [paragraph] = blocks('<strong>a</strong> <div>\n');
    expect(paragraph!.children!.filter((c) => c.type === 'HtmlInline')).toEqual(
      [html('<strong>'), html('</strong>'), html('<div>')]
    );
  });

  it('filters every disallowed tag inside an HTML block', () => {
    const src = '<div>\n  <xmp> and <XMP>, but <b>\n</div>\n';
    expect(blocks(src)).toEqual([
      {
        type: 'HtmlBlock',
        text: src,
        attrs: {
          filteredHtml: '<div>\n  &lt;xmp> and &lt;XMP>, but <b>\n</div>\n',
        },
      },
    ]);
  });

  it('does not change what the safe subset renders', () => {
    const [paragraph] = blocks('<b>x</b> <script>\n', 'safe');
    expect(paragraph!.children).toEqual([
      { type: 'Strong', children: [{ type: 'Text', text: 'x' }] },
      { type: 'Text', text: ' ' },
      html('<script>', '&lt;script>'),
    ]);
  });

  it('is not applied without the plugin', () => {
    const preset: Preset = { base: 'gfm', exclude: ['tagfilter'] };
    const [paragraph] = blocks('a <script>\n', 'text', preset);
    expect(paragraph!.children![1]).toEqual(html('<script>'));
  });
});
