import { createElement, type ReactNode } from 'react';
import { definePlugin } from '../../plugins/definePlugin';
import { markdownItBackend, type ParserBackendImpl } from '../../parse';
import { defaultComponents } from '../../render/defaults';
import { renderTree, textOf, type Tree } from '../../__tests__/tree';
import { Markdown, type MarkdownProps } from '../Markdown';
import { mergeComponents } from '../mergeComponents';
import { parse } from '../parse';

async function mount(props: MarkdownProps): Promise<{
  root: Tree;
  update(next: MarkdownProps): Promise<void>;
}> {
  const root = await renderTree(<Markdown {...props} />);
  return {
    root,
    update: (next) => root.rerender(<Markdown {...next} />),
  };
}

function Heading({ children, level }: { children?: ReactNode; level: number }) {
  return createElement('Custom', { level }, children);
}

describe('<Markdown>', () => {
  it('renders source', async () => {
    const { root } = await mount({ source: '# Title\n\nbody' });
    expect(textOf(root.container)).toContain('Title');
    expect(textOf(root.container)).toContain('body');
  });

  it('renders a pre-parsed document without parsing', async () => {
    const document = parse('hello **world**');
    const { root } = await mount({ document });
    expect(textOf(root.container)).toContain('hello world');
  });

  it('throws without source or document', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(mount({} as MarkdownProps)).rejects.toThrow(
      /source.*document/
    );
    spy.mockRestore();
  });

  it('applies the components prop', async () => {
    const { root } = await mount({
      source: '# Hi',
      components: { Heading: Heading as never },
    });
    const custom = root.find('Custom');
    expect(custom.props.level).toBe(1);
  });

  it('applies the preset', async () => {
    const gfm = await mount({ source: '~~gone~~' });
    expect(JSON.stringify(gfm.root.toJSON())).toContain('line-through');
    const cm = await mount({ source: '~~gone~~', preset: 'commonmark' });
    expect(JSON.stringify(cm.root.toJSON())).not.toContain('line-through');
  });

  describe('html', () => {
    const source = 'a <b>bold</b> and <mark>marked</mark> b';
    const render = async (html?: MarkdownProps['html']) =>
      textOf((await mount({ source, html })).root.container);

    it("renders the safe subset as elements by default ('safe')", async () => {
      expect(await render()).toBe('a bold and marked b');
      expect(await render('safe')).toBe('a bold and marked b');
    });

    it("shows all tags as text with 'text'", async () => {
      expect(await render('text')).toBe(source);
    });

    it("removes tags and keeps their text with 'strip'", async () => {
      expect(await render('strip')).toBe('a bold and marked b');
    });

    it('renders only the allowed tags with { allow }', async () => {
      expect(await render({ allow: ['b'] })).toBe(
        'a bold and <mark>marked</mark> b'
      );
    });

    it('styles safe tags as elements, not text', async () => {
      const safe = JSON.stringify((await mount({ source })).root.toJSON());
      const literal = JSON.stringify(
        (await mount({ source, html: 'text' })).root.toJSON()
      );
      expect(safe).toContain('"fontWeight":"700"');
      expect(literal).not.toContain('"fontWeight":"700"');
    });
  });

  describe('memoization', () => {
    it('keeps the render context for equal inline props', async () => {
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
      const { update } = await mount(props());
      const first = renders;
      expect(first).toBe(2);
      await update(props());
      await update(props());
      expect(renders).toBe(first);
    });

    it('re-renders when a component changes', async () => {
      let renders = 0;
      const A = ({ children }: { children?: ReactNode }) => {
        renders++;
        return createElement('A', null, children);
      };
      const B = ({ children }: { children?: ReactNode }) => {
        renders++;
        return createElement('B', null, children);
      };
      const { update } = await mount({
        source: 'x',
        components: { Paragraph: A as never },
      });
      await update({ source: 'x', components: { Paragraph: B as never } });
      expect(renders).toBe(2);
    });

    it('reparses only when the source changes', async () => {
      const backend: ParserBackendImpl = {
        name: 'counting',
        parse: jest.fn((source, options) =>
          markdownItBackend.parse(source, options)
        ),
      };
      const { update } = await mount({ source: 'a', plugins: [], backend });
      await update({ source: 'a', plugins: [], backend });
      await update({ source: 'a', plugins: [], backend, theme: 'dark' });
      expect(backend.parse).toHaveBeenCalledTimes(1);
      await update({ source: 'b', plugins: [], backend });
      expect(backend.parse).toHaveBeenCalledTimes(2);
    });
  });

  describe('theme', () => {
    it('applies plugin theme layers under the theme prop', async () => {
      const plugin = definePlugin({
        name: 'accent',
        theme: { Paragraph: { text: { color: '#aaaaaa' } } },
      });
      const { root } = await mount({ source: 'x', plugins: [plugin] });
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
