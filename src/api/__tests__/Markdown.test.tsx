import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { definePlugin } from '../../plugins/definePlugin';
import { markdownItBackend, type ParserBackendImpl } from '../../parse';
import { defaultComponents } from '../../render/defaults';
import { Markdown, type MarkdownProps } from '../Markdown';
import { mergeComponents } from '../mergeComponents';
import { parse } from '../parse';

function mount(props: MarkdownProps): {
  root: ReactTestRenderer;
  update(next: MarkdownProps): void;
} {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<Markdown {...props} />);
  });
  return {
    root,
    update: (next) => act(() => root.update(<Markdown {...next} />)),
  };
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object' && 'children' in node) {
    return ((node as { children: unknown[] | null }).children ?? [])
      .map(textOf)
      .join('');
  }
  return '';
}

function Heading({ children, level }: { children?: ReactNode; level: number }) {
  return createElement('Custom', { level }, children);
}

describe('<Markdown>', () => {
  it('renders source', () => {
    const { root } = mount({ source: '# Title\n\nbody' });
    expect(textOf(root.toJSON())).toContain('Title');
    expect(textOf(root.toJSON())).toContain('body');
  });

  it('renders a pre-parsed document without parsing', () => {
    const document = parse('hello **world**');
    const { root } = mount({ document });
    expect(textOf(root.toJSON())).toContain('hello world');
  });

  it('throws without source or document', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => mount({} as MarkdownProps)).toThrow(/source.*document/);
    spy.mockRestore();
  });

  it('applies the components prop', () => {
    const { root } = mount({
      source: '# Hi',
      components: { Heading: Heading as never },
    });
    const custom = root.root.findByType('Custom' as never);
    expect(custom.props.level).toBe(1);
  });

  it('applies the preset', () => {
    const gfm = mount({ source: '~~gone~~' });
    expect(JSON.stringify(gfm.root.toJSON())).toContain('line-through');
    const cm = mount({ source: '~~gone~~', preset: 'commonmark' });
    expect(JSON.stringify(cm.root.toJSON())).not.toContain('line-through');
  });

  describe('memoization', () => {
    it('keeps the render context for equal inline props', () => {
      let renders = 0;
      const Counting = ({ children }: { children?: ReactNode }) => {
        renders++;
        return createElement('Counting', null, children);
      };
      const props = (): MarkdownProps => ({
        source: 'one\n\ntwo',
        components: { Paragraph: Counting as never },
        theme: { colors: { text: '#123456' } },
        plugins: [],
        preset: { base: 'gfm', exclude: ['autolinks'] },
        html: { allow: ['b'] },
        onLinkPress: () => {},
      });
      const { update } = mount(props());
      const first = renders;
      expect(first).toBe(2);
      update(props());
      update(props());
      expect(renders).toBe(first);
    });

    it('re-renders when a component changes', () => {
      let renders = 0;
      const A = ({ children }: { children?: ReactNode }) => {
        renders++;
        return createElement('A', null, children);
      };
      const B = ({ children }: { children?: ReactNode }) => {
        renders++;
        return createElement('B', null, children);
      };
      const { update } = mount({
        source: 'x',
        components: { Paragraph: A as never },
      });
      update({ source: 'x', components: { Paragraph: B as never } });
      expect(renders).toBe(2);
    });

    it('reparses only when the source changes', () => {
      const backend: ParserBackendImpl = {
        name: 'counting',
        parse: jest.fn((source, options) =>
          markdownItBackend.parse(source, options)
        ),
      };
      const { update } = mount({ source: 'a', plugins: [], backend });
      update({ source: 'a', plugins: [], backend });
      update({ source: 'a', plugins: [], backend, theme: 'dark' });
      expect(backend.parse).toHaveBeenCalledTimes(1);
      update({ source: 'b', plugins: [], backend });
      expect(backend.parse).toHaveBeenCalledTimes(2);
    });
  });

  describe('theme', () => {
    it('applies plugin theme layers under the theme prop', () => {
      const plugin = definePlugin({
        name: 'accent',
        theme: { Paragraph: { text: { color: '#aaaaaa' } } },
      });
      const { root } = mount({ source: 'x', plugins: [plugin] });
      expect(JSON.stringify(root.toJSON())).toContain('#aaaaaa');
    });
  });
});

describe('mergeComponents', () => {
  const Plugin = () => null;
  const Prop = () => null;

  it('returns the defaults when nothing overrides them', () => {
    expect(mergeComponents([], undefined)).toBe(defaultComponents);
    expect(mergeComponents([definePlugin({ name: 'p' })], {})).toBe(
      defaultComponents
    );
  });

  it('merges defaults → plugins → prop', () => {
    const first = definePlugin({
      name: 'a',
      components: { Heading: Plugin, Paragraph: Plugin },
    });
    const second = definePlugin({
      name: 'b',
      components: { Paragraph: Prop },
    });
    const merged = mergeComponents([first, second], {
      Heading: Prop as never,
    });
    expect(merged.Heading).toBe(Prop);
    expect(merged.Paragraph).toBe(Prop);
    expect(merged.Blockquote).toBe(defaultComponents.Blockquote);
    expect(mergeComponents([first], undefined).Heading).toBe(Plugin);
  });

  it('skips undefined overrides', () => {
    expect(mergeComponents([], { Heading: undefined })).toBe(defaultComponents);
  });
});
