import type { MarkdownIt } from 'markdown-it';
import { createElement, type ReactNode } from 'react';
import { act, create } from 'react-test-renderer';
import { Markdown, type MarkdownProps } from '../../api/Markdown';
import { resetPluginWarnings } from '../../render/pluginNodes';
import type { ElementStyle } from '../../theme';
import { definePlugin, type MarkdownPlugin } from '../definePlugin';

/** `@name` → self-contained inline `mention` token. */
function mentionSyntax(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'mention', (state, silent) => {
    const match = /^@(\w+)/.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push('mention', 'span', 0);
      token.content = match[1]!;
    }
    state.pos += match[0].length;
    return true;
  });
}

/** `[[text]]` → inline container `chip_open` … `chip_close`. */
function chipSyntax(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'chip', (state, silent) => {
    if (!state.src.startsWith('[[', state.pos)) return false;
    const end = state.src.indexOf(']]', state.pos + 2);
    if (end === -1) return false;
    if (!silent) {
      const max = state.posMax;
      state.push('chip_open', 'span', 1);
      state.pos += 2;
      state.posMax = end;
      state.md.inline.tokenize(state);
      state.posMax = max;
      state.push('chip_close', 'span', -1);
    }
    state.pos = end + 2;
    return true;
  });
}

/** `$$x$$` on its own line → leaf block `math_block`. */
function mathBlockSyntax(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'math_block', (state, start, _end, silent) => {
    const line = state.src.slice(
      state.bMarks[start]! + state.tShift[start]!,
      state.eMarks[start]
    );
    const match = /^\$\$(.+)\$\$$/.exec(line);
    if (!match) return false;
    if (silent) return true;
    const token = state.push('math_block', 'div', 0);
    token.content = match[1]!;
    token.map = [start, start + 1];
    state.line = start + 1;
    return true;
  });
}

/** `:::kind` … `:::` → block container `note_open` … `note_close`. */
function noteSyntax(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'note', (state, start, end, silent) => {
    const text = (line: number) =>
      state.src.slice(
        state.bMarks[line]! + state.tShift[line]!,
        state.eMarks[line]
      );
    const match = /^:::(\w+)\s*$/.exec(text(start));
    if (!match) return false;
    if (silent) return true;
    let next = start + 1;
    while (next < end && text(next).trim() !== ':::') next++;
    const open = state.push('note_open', 'div', 1);
    open.meta = { kind: match[1] };
    open.map = [start, Math.min(next + 1, end)];
    const lineMax = state.lineMax;
    state.lineMax = next;
    state.md.block.tokenize(state, start + 1, next);
    state.lineMax = lineMax;
    state.push('note_close', 'div', -1);
    state.line = Math.min(next + 1, end);
    return true;
  });
}

type Props = Record<string, unknown> & { children?: ReactNode };
const host =
  (name: string) =>
  ({ children, style: _style, ...props }: Props) =>
    createElement(name, props, children);

// A plugin package declares its elements like this, so `components` and
// `theme.elements` accept them.
declare module '@docren/react-native-markdown' {
  interface PluginElementPropsMap {
    Mention: { userId: string };
  }
}

// ── Definitions (these double as compile-time tests) ─────────────────────

const mentions = definePlugin({
  name: 'mentions',
  syntax: {
    markdownIt: (md) => {
      mentionSyntax(md);
      chipSyntax(md);
    },
  },
  nodes: {
    Mention: {
      kind: 'inline',
      token: 'mention',
      inlineView: true,
      from: (token) => ({ userId: token.content }),
    },
    Chip: {
      kind: 'inline',
      token: 'chip',
      from: () => ({ tone: 'info' }),
    },
  },
  components: {
    // `userId` is inferred as string from `from`.
    Mention: ({ userId, baseline }) =>
      createElement('Mention', { id: userId.toUpperCase(), baseline }),
    Chip: host('Chip'),
  },
  theme: {
    Mention: { text: { color: '#112233' } },
  },
});

const blocks = definePlugin({
  name: 'blocks',
  syntax: {
    markdownIt: (md) => {
      mathBlockSyntax(md);
      noteSyntax(md);
    },
  },
  nodes: {
    MathBlock: {
      kind: 'block',
      token: 'math_block',
      from: (token) => ({ tex: token.content }),
    },
    Note: {
      kind: 'block',
      token: 'note',
      from: (token) => ({ kind: (token.meta as { kind: string }).kind }),
    },
  },
  components: { MathBlock: host('MathBlock'), Note: host('Note') },
});

definePlugin({
  name: 'bad-props',
  nodes: {
    Mention: {
      kind: 'inline',
      token: 'mention',
      from: (token) => ({ userId: token.content }),
    },
  },
  components: {
    // @ts-expect-error: `userId` is a string, not a number
    Mention: ({ userId }: { userId: number }) => userId,
  },
});

definePlugin({
  name: 'bad-attrs',
  nodes: {
    Mention: {
      kind: 'inline',
      token: 'mention',
      // @ts-expect-error: attrs must be plain values
      from: () => ({ fn: () => 1 }),
    },
  },
});

it('keeps the plugin name as a literal type', () => {
  const name: 'mentions' = mentions.name;
  expect(name).toBe('mentions');
});

// ── Rendering ────────────────────────────────────────────────────────────

function render(
  source: string,
  plugins: readonly MarkdownPlugin[] = [mentions, blocks],
  extra: {
    components?: MarkdownProps['components'];
    theme?: MarkdownProps['theme'];
  } = {}
) {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<Markdown source={source} plugins={plugins} {...extra} />);
  });
  return root;
}

describe('plugin nodes', () => {
  beforeEach(resetPluginWarnings);

  it('renders a leaf inline node with its props', () => {
    const root = render('hi @ada!');
    const mention = root.root.findByType('Mention' as never);
    expect(mention.props.id).toBe('ADA');
  });

  it('gives declared inline views a baseline, and others none', () => {
    const root = render('@ada and [[chip]]');
    expect(root.root.findByType('Mention' as never).props.baseline).toEqual({
      fontSize: expect.any(Number),
      lineHeight: expect.any(Number),
    });
    expect(root.root.findByType('Chip' as never).props).not.toHaveProperty(
      'baseline'
    );
  });

  it('renders inline containers with children', () => {
    const root = render('a [[**b**]] c');
    const chip = root.root.findByType('Chip' as never);
    expect(chip.props.tone).toBe('info');
    expect(JSON.stringify(root.toJSON())).toContain('"b"');
  });

  it('renders a leaf block node', () => {
    const root = render('$$x^2$$');
    const math = root.root.findByType('MathBlock' as never);
    expect(math.props.tex).toBe('x^2');
    expect(math.props.children).toBeUndefined();
  });

  it('renders block containers with their blocks as children', () => {
    const root = render(':::tip\nhello\n:::');
    const note = root.root.findByType('Note' as never);
    expect(note.props.kind).toBe('tip');
    expect(JSON.stringify(root.toJSON())).toContain('hello');
  });

  it('passes the plugin theme as style', () => {
    let style: unknown;
    const probe = definePlugin({
      name: 'probe',
      syntax: { markdownIt: mentionSyntax },
      nodes: {
        Mention: {
          kind: 'inline',
          token: 'mention',
          from: (t) => ({ userId: t.content }),
        },
      },
      components: {
        Mention: (props) => {
          style = props.style;
          return null;
        },
      },
      theme: { Mention: { text: { color: '#112233' } } },
    });
    render('@ada', [probe]);
    expect(style).toEqual({ text: { color: '#112233' }, container: {} });
  });

  it('lets the theme prop override the plugin theme', () => {
    let style: ElementStyle | undefined;
    const probe = definePlugin({
      name: 'probe',
      syntax: { markdownIt: mentionSyntax },
      nodes: {
        Mention: {
          kind: 'inline',
          token: 'mention',
          from: (t) => ({ userId: t.content }),
        },
      },
      components: {
        Mention: (props) => {
          style = props.style;
          return null;
        },
      },
      theme: { Mention: { text: { color: '#112233' } } },
    });
    render('@ada', [probe], {
      theme: { elements: { Mention: { text: { color: '#ffffff' } } } },
    });
    expect(style?.text.color).toBe('#ffffff');
  });

  it('lets the components prop override a plugin component', () => {
    const root = render('@ada', [mentions], {
      components: { Mention: host('Replaced') },
    });
    expect(root.root.findAllByType('Replaced' as never)).toHaveLength(1);
    expect(root.root.findAllByType('Mention' as never)).toHaveLength(0);
  });

  it('renders children and warns once when a component is missing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bare = definePlugin({
      name: 'bare',
      syntax: { markdownIt: chipSyntax },
      nodes: {
        Chip: { kind: 'inline', token: 'chip', from: () => ({}) },
      },
    });
    const root = render('[[a]] and [[b]]', [bare]);
    expect(JSON.stringify(root.toJSON())).toContain('a');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"Chip"');
    warn.mockRestore();
  });
});
