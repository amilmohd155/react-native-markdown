import { StyleSheet } from 'react-native';
import { find, renderTree, type Tree } from '../../__tests__/tree';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { toSubscript, toSuperscript } from '../scripts';
import { tableFor } from './helpers';

describe('Unicode scripts (P1-17)', () => {
  it('converts digits, signs, parentheses and letters', () => {
    expect(toSuperscript('2')).toBe('²');
    expect(toSuperscript('n+1')).toBe('ⁿ⁺¹');
    expect(toSuperscript('(x-y)')).toBe('⁽ˣ⁻ʸ⁾');
    expect(toSubscript('2')).toBe('₂');
    expect(toSubscript('i-1')).toBe('ᵢ₋₁');
  });

  it('converts nothing when any character has no Unicode form', () => {
    expect(toSuperscript('TM')).toBeNull();
    expect(toSuperscript('q')).toBeNull();
    expect(toSubscript('b')).toBeNull();
    expect(toSuperscript('[1]')).toBeNull();
    expect(toSuperscript(' ')).toBeNull();
    expect(toSuperscript('')).toBeNull();
  });
});

describe('default Superscript and Subscript', () => {
  async function texts(source: string) {
    const tree = await renderTree(
      <BlockList
        table={tableFor(source)}
        ctx={createRenderCtx({ components: defaultComponents })}
      />
    );
    // The block's Text, then the inline element's Text.
    return tree.findAll('Text');
  }

  it('renders convertible text as Unicode characters at the block size', async () => {
    const [, sup] = await texts('E = mc<sup>2</sup>\n');
    expect(sup!.props.children).toBe('²');
    expect(StyleSheet.flatten(sup!.props.style).fontSize).toBeUndefined();

    const [, sub] = await texts('H<sub>2</sub>O\n');
    expect(sub!.props.children).toBe('₂');
  });

  it('falls back to smaller text otherwise (P1-5)', async () => {
    const [, sup] = await texts('Brand<sup>TM</sup>\n');
    expect(sup!.props.children).toBe('TM');
    expect(StyleSheet.flatten(sup!.props.style).fontSize).toBe(12);
  });

  it('falls back when the content is not plain text', async () => {
    const [, sup] = await texts('x<sup>**2**</sup>\n');
    expect(sup!.props.children).not.toBe('²');
  });
});

describe("scriptFallback: 'raised'", () => {
  function render(source: string, scriptFallback?: 'smaller' | 'raised') {
    return renderTree(
      <BlockList
        table={tableFor(source)}
        ctx={createRenderCtx({
          components: defaultComponents,
          scriptFallback,
        })}
      />
    );
  }

  const views = (root: Tree) =>
    root.findAll((n) => n.type === 'View' && n.props.style?.transform);

  it('shifts non-Unicode content in an inline view, sized from the block', async () => {
    const root = await render(
      '## Brand<sup>TM</sup> and H<sub>Ab</sub>\n',
      'raised'
    );
    const [sup, sub] = views(root);
    // h2 is 33: up by 0.4, down by 0.2 of the block size.
    expect(sup!.props.style.transform).toEqual([{ translateY: -33 * 0.4 }]);
    expect(sub!.props.style.transform).toEqual([{ translateY: 33 * 0.2 }]);
    const inner = find(sup!, 'Text');
    expect(inner.props.children).toBe('TM');
    expect(StyleSheet.flatten(inner.props.style)).toMatchObject({
      fontSize: 33 * 0.75,
      color: '#1f2328',
    });
  });

  it('still uses Unicode characters where they exist', async () => {
    const root = await render('mc<sup>2</sup>\n', 'raised');
    expect(views(root)).toHaveLength(0);
    expect(JSON.stringify(root.toJSON())).toContain('²');
  });

  it('keeps smaller text by default', async () => {
    expect(views(await render('Brand<sup>TM</sup>\n'))).toHaveLength(0);
  });
});
