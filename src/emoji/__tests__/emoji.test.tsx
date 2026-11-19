import { Markdown } from '../../api/Markdown';
import { renderTree, textOf } from '../../__tests__/tree';
import { dumpBlocks, type Dumped } from '../../parse/__tests__/dump';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { emoji } from '../index';

type Options = Parameters<typeof emoji>[0];

const parse = (src: string, options?: Options): Dumped[] =>
  dumpBlocks(
    parseWithMarkdownIt(src, { preset: 'gfm', plugins: [emoji(options)] }).table
  );

/** Text of the Text nodes below `node`, in order, joined (code excluded). */
const textIn = (node: Dumped): string =>
  node.type === 'Text'
    ? (node.text ?? '')
    : (node.children ?? []).map(textIn).join('');

const find = (node: Dumped, type: string): Dumped[] => [
  ...(node.type === type ? [node] : []),
  ...(node.children ?? []).flatMap((c) => find(c, type)),
];

/** The first block's text. */
const para = (src: string, options?: Options): string =>
  textIn(parse(src, options)[0]!);

describe('emoji: parse', () => {
  it('replaces known shortcodes', () => {
    expect(para(':smile: and :tada: and :rocket:')).toBe('😄 and 🎉 and 🚀');
  });

  it('handles underscore names', () => {
    expect(para(':white_check_mark:')).toBe('✅');
  });

  it('handles :+1: and :-1:', () => {
    expect(para(':+1: :-1:')).toBe('👍 👎');
  });

  it('handles adjacent shortcodes', () => {
    expect(para(':smile::tada:')).toBe('😄🎉');
  });

  it('handles shortcodes at the start and end of a paragraph', () => {
    expect(para(':fire: hot')).toBe('🔥 hot');
    expect(para('so hot :fire:')).toBe('so hot 🔥');
  });

  it('leaves times and URL schemes alone', () => {
    expect(para('at 10:30:00 today')).toBe('at 10:30:00 today');
    expect(para('see http://x.com now')).toBe('see http://x.com now');
  });

  it('leaves unknown names literal', () => {
    expect(para('a :nope: b')).toBe('a :nope: b');
  });

  it('leaves inline code alone', () => {
    const [p] = parse('`:smile:` :smile:');
    expect(find(p!, 'InlineCode').map((c) => c.text)).toEqual([':smile:']);
    expect(textIn(p!)).toBe(' 😄');
  });

  it('leaves an escaped shortcode raw', () => {
    expect(para('\\:smile:')).toBe(':smile:');
  });

  it('replaces inside bold, link labels, headings, list items and cells', () => {
    expect(para('**:tada:**')).toBe('🎉');
    const [link] = find(parse('[:tada: x](http://a.com)')[0]!, 'Link');
    expect(textIn(link!)).toBe('🎉 x');
    expect(para('# :rocket: go')).toBe('🚀 go');
    expect(para('- :heart: it')).toBe('❤️ it');
    expect(para('| a |\n| - |\n| :smile: |\n')).toBe('a😄');
  });

  it('leaves autolinked and linkified URLs alone', () => {
    expect(para('<https://x.com/:smile:>')).toBe('https://x.com/:smile:');
    expect(para('https://x.com/:smile:')).toBe('https://x.com/:smile:');
    expect(para('www.x.com/:smile:')).toBe('www.x.com/:smile:');
  });

  it('leaves literal Unicode emoji untouched', () => {
    const src = '👩‍💻 👍🏽 🇯🇵';
    expect(para(src)).toBe(src);
  });
});

describe('emoji: lookup order', () => {
  it('uses the user resolver before map and defaults', () => {
    const options = {
      resolve: (n: string) => (n === 'smile' ? 'R' : undefined),
      map: { smile: 'M' },
    };
    expect(para(':smile:', options)).toBe('R');
  });

  it('uses map before defaults', () => {
    expect(para(':smile: :tada:', { map: { smile: 'M' } })).toBe('M 🎉');
  });

  it('supports map-only names', () => {
    expect(para(':custom:', { map: { custom: '★' } })).toBe('★');
  });

  it('falls through when the resolver returns undefined', () => {
    const resolve = () => undefined;
    expect(para(':smile:', { resolve, map: { smile: 'M' } })).toBe('M');
    expect(para(':smile:', { resolve })).toBe('😄');
    expect(para(':nope:', { resolve })).toBe(':nope:');
  });

  it('defaults: false drops the built-in table', () => {
    expect(para(':smile:', { defaults: false })).toBe(':smile:');
    expect(
      para(':smile: :custom:', { defaults: false, map: { custom: '★' } })
    ).toBe(':smile: ★');
  });

  it('keeps the plugin name emoji whatever the options', () => {
    expect(emoji().name).toBe('emoji');
    expect(emoji({ map: { a: 'b' } }).name).toBe('emoji');
    expect(emoji({ defaults: false, resolve: () => 'x' }).name).toBe('emoji');
  });
});

describe('emoji: render', () => {
  it('renders the emoji character in the text', async () => {
    const tree = await renderTree(
      <Markdown source="ship it :rocket:" plugins={[emoji()]} />
    );
    expect(textOf(tree.container)).toBe('ship it 🚀');
  });
});
