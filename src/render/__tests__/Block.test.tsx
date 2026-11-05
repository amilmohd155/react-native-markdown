import { createElement, memo, useEffect, type ReactNode } from 'react';
import { renderTree } from '../../__tests__/tree';
import type { NodeTable } from '../../model';
import { getDefaultTheme } from '../../theme';
import { BlockList, blockPropsEqual } from '../Block';
import { createRenderCtx, type RenderCtx } from '../context';
import type { Components } from '../elements';
import { hostComponents, tableFor } from './helpers';

async function mount(table: NodeTable, ctx: RenderCtx) {
  const root = await renderTree(<BlockList table={table} ctx={ctx} />);
  return {
    root,
    update(next: NodeTable, nextCtx = ctx) {
      return root.rerender(<BlockList table={next} ctx={nextCtx} />);
    },
  };
}

/** Paragraph component that counts renders and mounts by text. */
function trackParagraphs(components: (p: object) => Components) {
  const renders: string[] = [];
  const mounts: string[] = [];
  function Paragraph({ children }: { children: ReactNode }) {
    const text = String(children);
    renders.push(text);
    useEffect(() => {
      mounts.push(text);
    }, [text]);
    return createElement('Paragraph', null, children);
  }
  return { renders, mounts, components: components({ Paragraph }) };
}

describe('BlockList', () => {
  it('renders every block through the component map', async () => {
    const ctx = createRenderCtx({ components: hostComponents() });
    const { root } = await mount(
      tableFor('# Title\n\nSome *text*.\n\n- a\n- b\n\n---\n'),
      ctx
    );
    expect(root.toJSON()).toMatchSnapshot();
  });

  it('renders a lone image paragraph as a block Image', async () => {
    const ctx = createRenderCtx({ components: hostComponents() });
    const { root } = await mount(
      tableFor('![alt](a.png)\n\nx ![b](b.png)\n'),
      ctx
    );
    expect(root.findAll('Image')).toHaveLength(1);
    expect(root.findAll('Paragraph')).toHaveLength(1);
  });

  it('styles tight-list paragraphs and nested lists with their variants', async () => {
    const seen: { element: string; style: unknown }[] = [];
    const record =
      (element: string) =>
      ({ style, children }: { style: unknown; children?: ReactNode }) => {
        seen.push({ element, style });
        return <>{children}</>;
      };
    const ctx = createRenderCtx({
      components: hostComponents({
        Paragraph: record('Paragraph'),
        List: record('List'),
      }),
    });
    await mount(tableFor('- a\n  - b\n\nloose\n'), ctx);

    const theme = getDefaultTheme();
    expect(seen).toEqual([
      { element: 'List', style: theme.elements.List },
      { element: 'Paragraph', style: theme.tightParagraph },
      { element: 'List', style: theme.nestedList },
      { element: 'Paragraph', style: theme.tightParagraph },
      { element: 'Paragraph', style: theme.elements.Paragraph },
    ]);
  });

  it('applies the softBreak option to text', async () => {
    const table = tableFor('a\nb\n');
    const { root: space } = await mount(
      table,
      createRenderCtx({ components: hostComponents() })
    );
    const { root: newline } = await mount(
      table,
      createRenderCtx({ components: hostComponents(), softBreak: 'newline' })
    );
    expect(space.find('Paragraph').props.children).toBe('a b');
    expect(newline.find('Paragraph').props.children).toBe('a\nb');
  });
});

describe('Block memoization (P1-9)', () => {
  it('editing one block re-renders only that block', async () => {
    const t = trackParagraphs(hostComponents);
    const ctx = createRenderCtx({ components: t.components });
    const view = await mount(tableFor('one\n\ntwo\n\nthree\n'), ctx);
    expect(t.renders).toEqual(['one', 'two', 'three']);

    t.renders.length = 0;
    await view.update(tableFor('one\n\ntwo\n\nthree, edited\n'));
    expect(t.renders).toEqual(['three, edited']);
  });

  it('editing an earlier block keeps later blocks mounted and not re-rendered', async () => {
    const t = trackParagraphs(hostComponents);
    const ctx = createRenderCtx({ components: t.components });
    const view = await mount(tableFor('one\n\ntwo\n\nthree\n'), ctx);

    t.renders.length = 0;
    t.mounts.length = 0;
    // Longer first block: every later block's source offsets move.
    await view.update(tableFor('one, much longer\n\ntwo\n\nthree\n'));
    expect(t.renders).toEqual(['one, much longer']);
    // The edited block's effect re-runs for its new text; no remounts.
    expect(t.mounts).toEqual(['one, much longer']);
  });

  it('re-renders every block when ctx changes', async () => {
    const t = trackParagraphs(hostComponents);
    const table = tableFor('one\n\ntwo\n');
    const view = await mount(
      table,
      createRenderCtx({ components: t.components })
    );

    t.renders.length = 0;
    await view.update(
      table,
      createRenderCtx({ components: t.components, selectable: true })
    );
    expect(t.renders).toEqual(['one', 'two']);
  });

  it('re-renders a block whose context changed even if its text did not', async () => {
    // Adding an earlier "# A" changes the second heading's slug.
    const slugs: string[] = [];
    const Heading = ({ id }: { id: string }) => {
      slugs.push(id);
      return null;
    };
    const ctx = createRenderCtx({ components: hostComponents({ Heading }) });
    const view = await mount(tableFor('# A\n\ntext\n\n# B\n'), ctx);
    expect(slugs).toEqual(['a', 'b']);

    slugs.length = 0;
    await view.update(tableFor('# A\n\ntext\n\n# A\n'));
    expect(slugs).toEqual(['a-1']);
  });

  it('a user memo component bails out when its block is unchanged', async () => {
    const renders: string[] = [];
    const Heading = memo(({ children }: { children: ReactNode }) => {
      renders.push(String(children));
      return null;
    });
    const components = hostComponents({ Heading });
    const table = tableFor('# Title\n\npara\n');
    const view = await mount(table, createRenderCtx({ components }));
    expect(renders).toEqual(['Title']);

    // A new ctx forces every Block to re-render; the heading's props are
    // plain values (same text, same resolved style), so memo bails out.
    renders.length = 0;
    await view.update(table, createRenderCtx({ components, selectable: true }));
    expect(renders).toEqual([]);
  });

  it('blockPropsEqual compares ctx identity and block identity', () => {
    const ctx = createRenderCtx({ components: hostComponents() });
    const a = tableFor('x\n\ny\n');
    const b = tableFor('x\n\nz\n');
    expect(
      blockPropsEqual({ table: a, index: 0, ctx }, { table: b, index: 0, ctx })
    ).toBe(true);
    expect(
      blockPropsEqual({ table: a, index: 1, ctx }, { table: b, index: 1, ctx })
    ).toBe(false);
    expect(
      blockPropsEqual(
        { table: a, index: 0, ctx },
        {
          table: a,
          index: 0,
          ctx: createRenderCtx({ components: hostComponents() }),
        }
      )
    ).toBe(false);
  });
});
