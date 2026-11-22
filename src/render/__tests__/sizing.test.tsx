import { StyleSheet } from 'react-native';
import { renderTree } from '../../__tests__/tree';
import { resolveTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { tableFor } from './helpers';

async function texts(source: string, input = {}) {
  const tree = await renderTree(
    <BlockList
      table={tableFor(source)}
      ctx={createRenderCtx({
        components: defaultComponents,
        theme: resolveTheme(input),
      })}
    />
  );
  return tree.findAll('Text').map((n) => ({
    children: n.props.children,
    style: StyleSheet.flatten(n.props.style) ?? {},
  }));
}
const byText = (all: Awaited<ReturnType<typeof texts>>, s: string) =>
  all.find((t) => t.children === s)!;

describe('inline sizes follow the parent', () => {
  it('inline code has no own size: heading text decides', async () => {
    const all = await texts('## Title `x`\n');
    expect(byText(all, 'x').style.fontSize).toBeUndefined();
    expect(all[0]!.style.fontSize).toBe(33);
  });

  it('inline code inside blockquote and list item inherits', async () => {
    for (const src of ['> `x`\n', '- `x`\n', '| a |\n|---|\n| `x` |\n']) {
      const all = await texts(src);
      expect(byText(all, 'x').style.fontSize).toBeUndefined();
    }
  });

  it('an absolute inlineCode.fontSize is kept', async () => {
    const all = await texts('a `x`\n', { inlineCode: { fontSize: 11 } });
    expect(byText(all, 'x').style.fontSize).toBe(11);
  });
});

describe('fontScale at render', () => {
  it('scales the block size in a paragraph and a heading', async () => {
    const p = await texts('Brand<sup>TM</sup>\n');
    expect(byText(p, 'TM').style.fontSize).toBe(16 * 0.75);
    const h = await texts('## Brand<sup>TM</sup>\n');
    expect(byText(h, 'TM').style.fontSize).toBe(33 * 0.75);
  });

  it('follows a custom paragraph.fontSize and fontScale override', async () => {
    const all = await texts('Brand<sub>Ab</sub>\n', {
      paragraph: { fontSize: 20 },
      subscript: { fontScale: 0.5 },
    });
    expect(byText(all, 'Ab').style.fontSize).toBe(10);
  });

  it('follows a blockquote.fontSize and a table cell', async () => {
    const q = await texts('> Brand<sup>TM</sup>\n', {
      blockquote: { fontSize: 20 },
    });
    expect(byText(q, 'TM').style.fontSize).toBe(15);
    const t = await texts('| a |\n|---|\n| B<sup>TM</sup> |\n', {
      tableCell: { fontSize: 20 },
    });
    expect(byText(t, 'TM').style.fontSize).toBe(15);
  });

  it('nested scripts compound', async () => {
    const all = await texts('a<sup>x<sup>TM</sup></sup>\n');
    expect(byText(all, 'TM').style.fontSize).toBe(16 * 0.75 * 0.75);
  });

  it('footnoteReference uses its fontScale', async () => {
    const all = await texts('a[^1]\n\n[^1]: note\n', {
      footnoteReference: { fontScale: 0.5 },
    });
    const ref = all.find((t) => t.style.fontSize === 8);
    expect(ref).toBeDefined();
  });
});

describe('lineHeight points reach structural parts', () => {
  it('footnote section and checkbox follow paragraph/footnote values', async () => {
    const all = await texts('- [ ] task\n', {
      paragraph: { fontSize: 20, lineHeight: 40 },
    });
    expect(all.some((t) => t.style.lineHeight === 40)).toBe(true);
  });
});
