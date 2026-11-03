import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Linking, Text } from 'react-native';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { Markdown } from '../index';
import renderRules from '../libs/renderRules';
import ASTRenderer from '../components/ASTRenderer';
import type { RenderRules } from '../components/ASTRenderer.types';

jest.mock('mdast-util-from-markdown', () => {
  const actual = jest.requireActual('mdast-util-from-markdown');
  return { ...actual, fromMarkdown: jest.fn(actual.fromMarkdown) };
});

const fromMarkdownMock = fromMarkdown as jest.MockedFunction<
  typeof fromMarkdown
>;

// A GFM-style table tree, without needing the GFM parser extension.
const tableTree = {
  type: 'root',
  key: 'root',
  children: [
    {
      type: 'table',
      key: 'table',
      align: [null],
      children: [
        {
          type: 'tableRow',
          key: 'row',
          children: [
            {
              type: 'tableCell',
              key: 'cell',
              children: [{ type: 'text', key: 'text', value: 'cell' }],
            },
          ],
        },
      ],
    },
  ],
} as any;

function renderTree(element: ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('link press', () => {
  const linkNode = { type: 'link', url: 'https://example.com', children: [] };

  function pressLink(extras?: Record<string, unknown>) {
    const element = renderRules.link!({
      node: linkNode as any,
      styles: {},
      children: [],
      parentStack: [],
      extras,
    });
    element.props.onPress();
  }

  it('calls onLinkPress instead of opening the URL', () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    const onPress = jest.fn();

    pressLink({ onPress });

    expect(onPress).toHaveBeenCalledWith('https://example.com');
    expect(openURL).not.toHaveBeenCalled();
  });

  it('opens the URL when no onLinkPress is given', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    pressLink();

    expect(openURL).toHaveBeenCalledWith('https://example.com');
  });

  it('does not throw when opening the URL fails', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    pressLink();
    await new Promise(process.nextTick);

    expect(warn).toHaveBeenCalledWith(
      'Unable to open URL: https://example.com',
      expect.any(Error)
    );
  });
});

describe('tables', () => {
  it('skips tables when no render rule is provided', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const output = new ASTRenderer({}).render(tableTree);

    expect(output.props.children).toEqual([null]);
  });

  it('uses user-provided table render rules', () => {
    const rules: RenderRules = {
      table: ({ children }) => <Text testID="table">{children}</Text>,
      tableRow: ({ children }) => <Text testID="row">{children}</Text>,
      tableCell: ({ children }) => <Text testID="cell">{children}</Text>,
    };

    const tree = renderTree(
      new ASTRenderer({ renderRules: rules }).render(tableTree)
    );

    expect(tree.root.findByProps({ testID: 'table' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'cell' })).toBeTruthy();
  });
});

describe('<Markdown> memoization', () => {
  it('does not re-parse when re-rendered with the same markdown', () => {
    const tree = renderTree(<Markdown markdown="# Hello" />);
    expect(fromMarkdownMock).toHaveBeenCalledTimes(1);

    // New props object, same markdown: the parse must be reused.
    act(() => {
      tree.update(<Markdown markdown="# Hello" onLinkPress={() => {}} />);
    });
    expect(fromMarkdownMock).toHaveBeenCalledTimes(1);

    act(() => {
      tree.update(<Markdown markdown="# Changed" onLinkPress={() => {}} />);
    });
    expect(fromMarkdownMock).toHaveBeenCalledTimes(2);
  });
});
