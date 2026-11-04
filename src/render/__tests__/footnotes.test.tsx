import { StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { getDefaultTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx, type RenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { backLinks } from '../defaults/block';
import type { Components } from '../elements';
import { tableFor } from './helpers';

/** Back-link mark (↩ in text presentation). */
const B = '↩\uFE0E';

const DOC = 'a[^1] b[^n] c[^1]\n\nmore\n\n[^1]: First.\n[^n]: Named.\n';

function mount(source: string, ctx: RenderCtx) {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<BlockList table={tableFor(source)} ctx={ctx} />);
  });
  return {
    root,
    update(next: string) {
      act(() => root.update(<BlockList table={tableFor(next)} ctx={ctx} />));
    },
  };
}

const defaultsCtx = (overrides: Partial<Components> = {}) =>
  createRenderCtx({
    components: Object.freeze({ ...defaultComponents, ...overrides }),
  });

const flat = (style: unknown) =>
  StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('footnote section', () => {
  it('renders the definitions in a footer after the document, in reference order', () => {
    const { root } = mount(DOC, defaultsCtx());
    const section = root.root.find(
      (n) => n.type === View && n.props.accessibilityLabel === 'Footnotes'
    );
    expect(flat(section.props.style)).toMatchObject(
      getDefaultTheme().footnoteSection.container
    );

    const texts = section
      .findAll((n) => n.type === Text)
      .map((n) => n.props.children);
    expect(texts).toEqual(['1.', 'First.', `${B} ${B}²`, '2.', 'Named.', B]);

    // The section is the last block.
    const top = root.toJSON() as { children: { props: object }[] };
    expect(top.children.at(-1)!.props).toMatchObject({
      accessibilityLabel: 'Footnotes',
    });
  });

  it('cascades the section text style into definition paragraphs', () => {
    const { root } = mount(DOC, defaultsCtx());
    const paragraph = root.root.find(
      (n) => n.type === Text && n.props.children === 'First.'
    );
    const { colors, fontSize } = getDefaultTheme().tokens;
    expect(flat(paragraph.props.style)).toMatchObject({
      color: colors.muted,
      fontSize: fontSize.base * 0.875,
    });
  });

  it('renders references with their number', () => {
    const { root } = mount(DOC, defaultsCtx());
    const refs = root.root
      .findAll((n) => n.type === Text && Array.isArray(n.props.children))
      .filter((n) => n.props.children[0] === '[');
    expect(refs.map((n) => n.props.children.join(''))).toEqual([
      '[1]',
      '[2]',
      '[1]',
    ]);
  });

  it('re-renders only when a definition or the numbering changes', () => {
    const labels: string[] = [];
    const FootnoteDefinition = ({ label }: { label: string }) => {
      labels.push(label);
      return null;
    };
    const view = mount(DOC, defaultsCtx({ FootnoteDefinition }));
    expect(labels).toEqual(['1', 'n']);

    // An unrelated edit: the section bails out.
    labels.length = 0;
    view.update(DOC.replace('more', 'more, edited'));
    expect(labels).toEqual([]);

    // A definition's text changed: the section re-renders.
    view.update(DOC.replace('Named.', 'Renamed.'));
    expect(labels).toEqual(['1', 'n']);
  });
});

describe('backLinks', () => {
  it('numbers repeated back-links with superscript digits', () => {
    expect(backLinks(1)).toBe(B);
    expect(backLinks(3)).toBe(`${B} ${B}² ${B}³`);
    expect(backLinks(12).split(' ').at(-1)).toBe(`${B}¹²`);
  });
});
