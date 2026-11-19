import { fireEvent, render, screen } from '@testing-library/react-native';
import { Markdown } from '../../api/Markdown';
import { renderTree, textOf } from '../../__tests__/tree';
import { dumpBlocks, type Dumped } from '../../parse/__tests__/dump';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { Text } from 'react-native';
import { mentions, useMentionPress } from '../index';
import type { MentionAttrs } from '../Mention';

const parse = (src: string, schemes: string[] = ['user']): Dumped[] =>
  dumpBlocks(
    parseWithMarkdownIt(src, {
      preset: 'gfm',
      plugins: [mentions({ schemes })],
    }).table
  );

const find = (node: Dumped, type: string): Dumped[] => [
  ...(node.type === type ? [node] : []),
  ...(node.children ?? []).flatMap((c) => find(c, type)),
];

/** Plugin nodes dump as `Plugin(<type id>)`; Mention is the only one here. */
const findPlugin = (node: Dumped): Dumped[] => [
  ...(node.type.startsWith('Plugin(') ? [node] : []),
  ...(node.children ?? []).flatMap(findPlugin),
];

const mentionsIn = (src: string, schemes?: string[]): Dumped[] =>
  parse(src, schemes).flatMap(findPlugin);
const linksIn = (src: string, schemes?: string[]): Dumped[] =>
  parse(src, schemes).flatMap((b) => find(b, 'Link'));

describe('mentions: parse', () => {
  it('converts a configured scheme', () => {
    const [m] = mentionsIn('hi [@Alice](user://alice) there');
    expect(m!.attrs).toEqual({
      scheme: 'user',
      id: 'alice',
      label: '@Alice',
      url: 'user://alice',
    });
    expect(linksIn('hi [@Alice](user://alice)')).toHaveLength(0);
  });

  it('matches the scheme case-insensitively', () => {
    expect(mentionsIn('[A](USER://alice)')[0]!.attrs).toMatchObject({
      scheme: 'user',
      id: 'alice',
      url: 'USER://alice',
    });
    expect(mentionsIn('[A](user://alice)', ['USER'])).toHaveLength(1);
  });

  it('leaves other schemes as links', () => {
    expect(mentionsIn('[A](http://x.com)')).toHaveLength(0);
    expect(linksIn('[A](http://x.com)')).toHaveLength(1);
    expect(linksIn('[A](team://x)')).toHaveLength(1);
  });

  it('needs the // form', () => {
    expect(mentionsIn('[A](user:alice)')).toHaveLength(0);
    expect(linksIn('[A](user:alice)')).toHaveLength(1);
  });

  it('leaves autolinks alone', () => {
    expect(mentionsIn('<user://alice>')).toHaveLength(0);
    expect(linksIn('<user://alice>')).toHaveLength(1);
  });

  it('ignores code spans', () => {
    expect(mentionsIn('`[A](user://alice)`')).toHaveLength(0);
  });

  it('leaves email text alone', () => {
    expect(mentionsIn('mail a@user.com now')).toHaveLength(0);
  });

  it('converts reference links', () => {
    const [m] = mentionsIn('[@A][ref]\n\n[ref]: user://alice');
    expect(m!.attrs).toMatchObject({ id: 'alice', label: '@A' });
  });

  it('flattens the label to plain text', () => {
    expect(mentionsIn('[**@Alice**](user://alice)')[0]!.attrs).toMatchObject({
      label: '@Alice',
    });
    expect(mentionsIn('[a `b` *c*](user://x)')[0]!.attrs).toMatchObject({
      label: 'a b c',
    });
  });

  it('percent-decodes the id, keeping the path', () => {
    expect(mentionsIn('[A](user://team/alice%20b)')[0]!.attrs).toMatchObject({
      id: 'team/alice b',
      url: 'user://team/alice%20b',
    });
  });

  it('keeps a malformed percent escape raw', () => {
    expect(mentionsIn('[A](user://a%zz)')[0]!.attrs).toMatchObject({
      id: 'a%zz',
    });
    // markdown-it normalizes the stray `%` to `%25`; the invalid UTF-8
    // sequence then fails to decode, so the id stays as the href has it.
    expect(mentionsIn('[A](user://a%E0%A4%A)')[0]!.attrs).toMatchObject({
      id: 'a%E0%A4%25A',
    });
  });

  it('keeps a link whose label is an image', () => {
    const src = '[![avatar](https://e.com/a.png)](user://img)';
    expect(mentionsIn(src)).toHaveLength(0);
    expect(linksIn(src)).toHaveLength(1);
  });

  it('keeps a link with an image next to text', () => {
    const src = '[![a](https://e.com/a.png) Bob](user://bob)';
    expect(mentionsIn(src)).toHaveLength(0);
    expect(linksIn(src)).toHaveLength(1);
  });

  it('keeps a link with an empty label', () => {
    expect(mentionsIn('[](user://x)')).toHaveLength(0);
    expect(linksIn('[](user://x)')).toHaveLength(1);
  });

  it('keeps the query and hash in the id', () => {
    const [m] = mentionsIn('[a](user://u/1?tab=x#top)');
    expect(m!.attrs).toMatchObject({ id: 'u/1?tab=x#top' });
  });

  it('converts nothing with no schemes', () => {
    expect(mentionsIn('[A](user://alice)', [])).toHaveLength(0);
    expect(linksIn('[A](user://alice)', [])).toHaveLength(1);
    const noOptions = parseWithMarkdownIt('[A](user://a)', {
      preset: 'gfm',
      plugins: [mentions()],
    });
    expect(
      dumpBlocks(noOptions.table).flatMap((b) => find(b, 'Link'))
    ).toHaveLength(1);
  });

  it('converts several mentions in one paragraph', () => {
    expect(
      mentionsIn('[A](user://a) and [B](user://b)').map(
        (m) => (m.attrs as { id: string }).id
      )
    ).toEqual(['a', 'b']);
  });
});

describe('mentions: parse context', () => {
  const context = (schemes: string[]): string =>
    parseWithMarkdownIt('x', {
      preset: 'gfm',
      plugins: [mentions({ schemes })],
    }).table.context;

  it('differs for different schemes, not for their order or case', () => {
    expect(context(['user'])).not.toBe(context(['team']));
    expect(context(['a', 'B'])).toBe(context(['b', 'A']));
  });
});

describe('mentions: render', () => {
  it('renders the label text', async () => {
    const tree = await renderTree(
      <Markdown
        source="hi [@Alice](user://alice)"
        plugins={[mentions({ schemes: ['user'] })]}
      />
    );
    expect(textOf(tree.container)).toBe('hi @Alice');
  });

  const SRC = 'hi [@Alice](user://team/alice)';

  it('calls onMentionPress with the mention info', async () => {
    const onMentionPress = jest.fn();
    await render(
      <Markdown
        source={SRC}
        plugins={[mentions({ schemes: ['user'] })]}
        onMentionPress={onMentionPress}
      />
    );
    await fireEvent.press(screen.getByRole('link'));
    expect(onMentionPress).toHaveBeenCalledWith({
      scheme: 'user',
      id: 'team/alice',
      url: 'user://team/alice',
      label: '@Alice',
    });
  });

  it('falls through to onLinkPress with the raw url', async () => {
    const onLinkPress = jest.fn();
    await render(
      <Markdown
        source={SRC}
        plugins={[mentions({ schemes: ['user'] })]}
        onLinkPress={onLinkPress}
      />
    );
    await fireEvent.press(screen.getByRole('link'));
    expect(onLinkPress).toHaveBeenCalledWith(
      'user://team/alice',
      expect.anything()
    );
  });

  describe('custom component', () => {
    const SRC2 = 'hi [@Alice](user://team/alice)';
    function Custom({ scheme, id, label, url }: MentionAttrs) {
      const press = useMentionPress();
      return (
        <Text
          accessibilityRole="link"
          onPress={() => press({ scheme, id, url, label })}
        >
          {`custom ${label}`}
        </Text>
      );
    }

    it('reaches onMentionPress through useMentionPress', async () => {
      const onMentionPress = jest.fn();
      await render(
        <Markdown
          source={SRC2}
          plugins={[mentions({ schemes: ['user'] })]}
          components={{ Mention: Custom }}
          onMentionPress={onMentionPress}
        />
      );
      await fireEvent.press(screen.getByText('custom @Alice'));
      expect(onMentionPress).toHaveBeenCalledWith({
        scheme: 'user',
        id: 'team/alice',
        url: 'user://team/alice',
        label: '@Alice',
      });
    });

    it('falls through to onLinkPress without onMentionPress', async () => {
      const onLinkPress = jest.fn();
      await render(
        <Markdown
          source={SRC2}
          plugins={[mentions({ schemes: ['user'] })]}
          components={{ Mention: Custom }}
          onLinkPress={onLinkPress}
        />
      );
      await fireEvent.press(screen.getByText('custom @Alice'));
      expect(onLinkPress).toHaveBeenCalledWith(
        'user://team/alice',
        expect.anything()
      );
    });
  });
});
