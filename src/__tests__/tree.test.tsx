import { createElement, Fragment } from 'react';
import { find, findAll, renderTree, textOf } from './tree';

describe('renderTree', () => {
  it('queries host elements by type or predicate', async () => {
    const tree = await renderTree(
      createElement(
        'Outer',
        { id: 'o' },
        createElement('Item', { n: 1 }, 'one'),
        createElement('Item', { n: 2 }, 'two')
      )
    );
    expect(tree.findAll('Item')).toHaveLength(2);
    expect(tree.find('Outer').props.id).toBe('o');
    expect(tree.find((n) => n.props.n === 2).children).toEqual(['two']);
    expect(findAll(tree.find('Outer'), 'Item')).toHaveLength(2);
    expect(textOf(tree.find('Outer'))).toBe('onetwo');
  });

  it('find throws for none or several', async () => {
    const tree = await renderTree(
      createElement('A', null, createElement('B'), createElement('B'))
    );
    expect(() => tree.find('B')).toThrow(/found 2/);
    expect(() => tree.find('C')).toThrow(/found 0/);
    expect(() => find(tree.container, 'Z')).toThrow(/found 0/);
  });

  it('accepts text in any host element', async () => {
    await expect(
      renderTree(createElement('Paragraph', null, 'text'))
    ).resolves.toBeDefined();
  });

  it('rerenders and unmounts', async () => {
    const tree = await renderTree(createElement('A', null, 'one'));
    await tree.rerender(createElement('A', null, 'two'));
    expect(textOf(tree.find('A'))).toBe('two');
    await tree.unmount();
    expect(tree.toJSON()).toBeNull();
  });

  it('toJSON mirrors react-test-renderer: one root, an array, or null', async () => {
    const one = await renderTree(createElement('A', { x: 1 }, 'hi'));
    expect(one.toJSON()).toMatchObject({
      type: 'A',
      props: { x: 1 },
      children: ['hi'],
    });
    const several = await renderTree(
      createElement(
        Fragment,
        null,
        createElement('A', null, 'x'),
        createElement('B', null, 'y')
      )
    );
    expect(several.toJSON()).toHaveLength(2);
    expect(await renderTree(createElement(Fragment))).toMatchObject({
      toJSON: expect.any(Function),
    });
  });
});
