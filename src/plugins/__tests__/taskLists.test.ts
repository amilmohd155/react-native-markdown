import type { Preset } from '../../parse';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { dumpBlocks, type Dumped } from '../../parse/__tests__/dump';

const items = (src: string, preset: Preset = 'gfm'): Dumped[] =>
  dumpBlocks(parseWithMarkdownIt(src, { preset }).table)[0]!.children ?? [];

/** Flags and the first paragraph's children of each item. */
const summary = (src: string, preset?: Preset) =>
  items(src, preset).map((item) => ({
    flags: item.flags ?? [],
    content: item.children?.[0]?.children,
  }));

const text = (t: string): Dumped => ({ type: 'Text', text: t });

describe('task list items', () => {
  it('flags unchecked and checked items and strips the marker', () => {
    expect(summary('- [ ] a\n- [x] b\n- [X] c\n')).toEqual([
      { flags: ['TASK'], content: [text('a')] },
      { flags: ['TASK', 'CHECKED'], content: [text('b')] },
      { flags: ['TASK', 'CHECKED'], content: [text('c')] },
    ]);
  });

  it('keeps ORDERED on ordered task items', () => {
    expect(summary('1. [x] a\n')).toEqual([
      { flags: ['ORDERED', 'TASK', 'CHECKED'], content: [text('a')] },
    ]);
  });

  it('keeps inline content after the marker', () => {
    expect(summary('- [x] *a* b\n')).toEqual([
      {
        flags: ['TASK', 'CHECKED'],
        content: [{ type: 'Emphasis', children: [text('a')] }, text(' b')],
      },
    ]);
  });

  it('accepts a line ending after the marker', () => {
    expect(summary('- [ ]\n  a\n')).toEqual([
      { flags: ['TASK'], content: [text('a')] },
    ]);
  });

  it.each([
    ['other characters in the brackets', '- [@] a\n', '[@] a'],
    ['two characters in the brackets', '- [xx] a\n', '[xx] a'],
    ['no whitespace after the marker', '- [x]a\n', '[x]a'],
    ['a marker with nothing after it', '- [ ]\n', '[ ]'],
    ['an escaped bracket', '- \\[x] a\n', '[x] a'],
    ['a marker after other text', '- a [x] b\n', 'a [x] b'],
  ])('ignores %s', (_, src, content) => {
    expect(summary(src)).toEqual([{ flags: [], content: [text(content)] }]);
  });

  it('only looks at the start of the first block, a paragraph', () => {
    const [item] = items('- > [x] a\n');
    expect(item!.flags).toBeUndefined();
    const [loose] = items('- a\n\n  [x] b\n');
    expect(loose!.flags).toBeUndefined();
    expect(loose!.children![1]!.children).toEqual([text('[x] b')]);
  });

  it('works in nested lists', () => {
    const [outer] = items('- [x] a\n  - [ ] b\n');
    expect(outer!.flags).toEqual(['TASK', 'CHECKED']);
    const nested = outer!.children![1]!.children![0]!;
    expect(nested.flags).toEqual(['TASK']);
    expect(nested.children![0]!.children).toEqual([text('b')]);
  });

  it('is plain text without the plugin', () => {
    expect(
      summary('- [x] a\n', { base: 'gfm', exclude: ['taskLists'] })
    ).toEqual([{ flags: [], content: [text('[x] a')] }]);
  });
});
