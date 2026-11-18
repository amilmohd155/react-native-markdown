import { StyleSheet } from 'react-native';
import { renderTree, textOf } from '../../__tests__/tree';
import { getDefaultTheme } from '../../theme';
import { BlockList } from '../Block';
import {
  createRenderCtx,
  DEFAULT_FOOTNOTE_BACK_LINK_MARK,
  type RenderCtx,
} from '../context';
import { defaultComponents } from '../defaults';
import type { Components } from '../elements';
import { tableFor } from './helpers';

/** Back-link mark (↩ in text presentation). */
const B = '↩\uFE0E';

const DOC = 'a[^1] b[^n] c[^1]\n\nmore\n\n[^1]: First.\n[^n]: Named.\n';

async function mount(source: string, ctx: RenderCtx) {
  const root = await renderTree(
    <BlockList table={tableFor(source)} ctx={ctx} />
  );
  return {
    root,
    update(next: string) {
      return root.rerender(<BlockList table={tableFor(next)} ctx={ctx} />);
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
  it('renders the definitions in a footer after the document, in reference order', async () => {
    const { root } = await mount(DOC, defaultsCtx());
    const section = root.find(
      (n) => n.type === 'View' && n.props.accessibilityLabel === 'Footnotes'
    );
    expect(flat(section.props.style)).toMatchObject(
      getDefaultTheme().footnoteSection.container
    );

    // The back-links end each definition's last paragraph, after a space.
    expect(textOf(section)).toBe(`1.First. ${B} ${B}²2.Named. ${B}`);

    // The section is the last block.
    const top = root.toJSON() as { children: { props: object }[] };
    expect(top.children.at(-1)!.props).toMatchObject({
      accessibilityLabel: 'Footnotes',
    });
  });

  it('cascades the section text style into definition paragraphs', async () => {
    const { root } = await mount(DOC, defaultsCtx());
    const paragraph = root.find(
      (n) => n.type === 'Text' && textOf(n) === `First. ${B} ${B}²`
    );
    const { colors, fontSize } = getDefaultTheme().tokens;
    expect(flat(paragraph.props.style)).toMatchObject({
      color: colors.muted,
      fontSize: fontSize.base * 0.875,
    });
  });

  it('renders references with their number', async () => {
    const { root } = await mount(DOC, defaultsCtx());
    const refs = root
      .findAll((n) => n.type === 'Text' && Array.isArray(n.props.children))
      .filter((n) => n.props.children[0] === '[');
    expect(refs.map((n) => n.props.children.join(''))).toEqual([
      '[1]',
      '[2]',
      '[1]',
    ]);
  });

  it('re-renders only when a definition or the numbering changes', async () => {
    const labels: string[] = [];
    const FootnoteDefinition = ({ label }: { label: string }) => {
      labels.push(label);
      return null;
    };
    const view = await mount(DOC, defaultsCtx({ FootnoteDefinition }));
    expect(labels).toEqual(['1', 'n']);

    // An unrelated edit: the section bails out.
    labels.length = 0;
    await view.update(DOC.replace('more', 'more, edited'));
    expect(labels).toEqual([]);

    // A definition's text changed: the section re-renders.
    await view.update(DOC.replace('Named.', 'Renamed.'));
    expect(labels).toEqual(['1', 'n']);
  });
});

describe('back-links', () => {
  it('are inline at the end of the last paragraph', async () => {
    const { root } = await mount(DOC, defaultsCtx());
    const paragraph = root.find(
      (n) => n.type === 'Text' && textOf(n) === `Named. ${B}`
    );
    // The paragraph's own text, then the link as a nested Text.
    expect(paragraph.children[0]).toBe('Named.');
    expect(paragraph.children[1]).toBe(' ');
    expect(textOf(paragraph.children[2]!)).toBe(B);
  });

  it('take a definition that ends in a list into a paragraph of their own', async () => {
    const source = 'a[^1] b[^1]\n\n[^1]: Intro.\n\n    - one\n    - two\n';
    const { root } = await mount(source, defaultsCtx());
    const section = root.find(
      (n) => n.type === 'View' && n.props.accessibilityLabel === 'Footnotes'
    );
    const own = section.queryAll(
      (n) => n.type === 'Text' && textOf(n) === `${B} ${B}²`
    );
    // No space before the first link: it starts its own line.
    expect(own).toHaveLength(1);
    expect(textOf(own[0]!.children[0]!)).toBe(B);
  });

  it('show the text of footnoteBackLinkMark', async () => {
    const ctx = createRenderCtx({
      components: defaultComponents,
      footnoteBackLinkMark: (reference, total) => `^${reference}/${total}`,
    });
    const { root } = await mount(DOC, ctx);
    const section = root.find(
      (n) => n.type === 'View' && n.props.accessibilityLabel === 'Footnotes'
    );
    expect(textOf(section)).toBe('1.First. ^1/2 ^2/22.Named. ^1/1');
  });

  it('are inert, and hidden from accessibility, without a handler', async () => {
    const { root } = await mount(DOC, defaultsCtx());
    const links = root.findAll(
      (n) => n.type === 'Text' && textOf(n).startsWith('↩')
    );
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.props.onPress).toBeUndefined();
      expect(link.props.accessible).toBe(false);
    }
  });
});

describe('default back-link text', () => {
  it('numbers repeated back-links with superscript digits', () => {
    expect(DEFAULT_FOOTNOTE_BACK_LINK_MARK(1, 3)).toBe(B);
    expect(DEFAULT_FOOTNOTE_BACK_LINK_MARK(2, 3)).toBe(`${B}²`);
    expect(DEFAULT_FOOTNOTE_BACK_LINK_MARK(12, 12)).toBe(`${B}¹²`);
  });
});
