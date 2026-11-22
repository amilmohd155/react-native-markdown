/**
 * M3 (Phase 3a): consumers of flat theme props that are not plain styles:
 * list bullets, image radius, syntax colours (new types included) and the
 * footnote flash colour. Checkbox colours/size and imageRatio are covered in
 * `taskToggle.test.tsx` and `images.test.tsx`.
 */
import { act } from 'react';
import { AccessibilityInfo, Image, StyleSheet } from 'react-native';
import { find, findAll, renderTree, textOf } from '../../__tests__/tree';
import { Markdown } from '../../api/Markdown';
import { highlight } from '../../highlight';
import { resolveTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { createFootnoteFocusStore } from '../footnoteFocus';
import { clearImageSizeCache, loadImageSize } from '../imageSize';
import { tableFor } from './helpers';

afterEach(() => jest.restoreAllMocks());

const getSize = (): jest.SpyInstance => jest.spyOn(Image, 'getSize');

const mount = (source: string, theme = resolveTheme()) =>
  renderTree(
    <BlockList
      table={tableFor(source)}
      ctx={createRenderCtx({ components: defaultComponents, theme })}
    />
  );

describe('list.bullets', () => {
  it('draws the theme bullets by depth', async () => {
    const root = await mount(
      '- a\n  - b\n    - c\n',
      resolveTheme({ list: { bullets: ['A', 'B', 'C'] } })
    );
    const markers = findAll(root.container, 'Text')
      .map((n) => textOf(n))
      .filter((t) => ['A', 'B', 'C'].includes(t));
    expect(markers).toEqual(['A', 'B', 'C']);
  });
});

describe('image.borderRadius', () => {
  beforeEach(() => {
    clearImageSizeCache();
  });

  const radiusOf = (root: Awaited<ReturnType<typeof mount>>) =>
    (
      StyleSheet.flatten(find(root.container, 'Image').props.style) as {
        borderRadius?: number;
      }
    ).borderRadius;

  it('clips the loaded image, not only its container', async () => {
    getSize().mockResolvedValue({ width: 40, height: 20 });
    await loadImageSize('r.png');
    const root = await mount(
      '![a](r.png)\n',
      resolveTheme({ image: { borderRadius: 12 } })
    );
    expect(radiusOf(root)).toBe(12);
  });

  it('leaves a loaded image square by default, the placeholder rounded', async () => {
    getSize().mockResolvedValue({ width: 40, height: 20 });
    await loadImageSize('d.png');
    expect(radiusOf(await mount('![a](d.png)\n'))).toBeUndefined();
    getSize().mockReturnValue(new Promise(() => {}));
    expect(radiusOf(await mount('![a](pending.png)\n'))).toBe(
      resolveTheme().tokens.radius.code
    );
  });

  it('applies to the placeholder too', async () => {
    getSize().mockReturnValue(new Promise(() => {}));
    const root = await mount(
      '![a](p2.png)\n',
      resolveTheme({ image: { borderRadius: 3 } })
    );
    expect(radiusOf(root)).toBe(3);
  });
});

describe('codeBlock.syntax through the highlight plugin', () => {
  // A tokenizer that emits the types the bundled ones do not: `variable`
  // and `embedded`.
  const plugin = highlight({
    languages: {
      demo: (code) => [
        { type: 'variable', text: code.slice(0, 1) },
        { type: 'embedded', text: code.slice(1, 2) },
        { type: 'operator', text: code.slice(2) },
      ],
    },
  });

  const colourOf = (
    root: Awaited<ReturnType<typeof renderTree>>,
    text: string
  ) =>
    (
      StyleSheet.flatten(
        root.find((n) => n.type === 'Text' && textOf(n) === text).props.style
      ) as { color?: string } | undefined
    )?.color;

  it('colours variable, embedded and operator from the theme', async () => {
    const root = await renderTree(
      <Markdown
        source={'```demo\nxy+\n```\n'}
        plugins={[plugin]}
        theme={{
          codeBlock: {
            syntax: {
              variable: '#aa0000',
              embedded: '#00aa00',
              operator: '#0000aa',
            },
          },
        }}
      />
    );
    expect(colourOf(root, 'x')).toBe('#aa0000');
    expect(colourOf(root, 'y')).toBe('#00aa00');
    expect(colourOf(root, '+')).toBe('#0000aa');
  });

  it('draws them in the block colour by default (no span colour)', async () => {
    const root = await renderTree(
      <Markdown source={'```demo\nxy+\n```\n'} plugins={[plugin]} />
    );
    const block = resolveTheme().elements.CodeBlock.text.color;
    // One merged run: no coloured span for any of the three types.
    expect(
      root.findAll((n) => n.type === 'Text' && textOf(n) === 'xy+')
    ).not.toHaveLength(0);
    for (const t of ['x', 'y', '+']) {
      expect(
        root.findAll((n) => n.type === 'Text' && textOf(n) === t)
      ).toHaveLength(0);
    }
    expect(block).toBe(resolveTheme().tokens.syntax.operator);
  });
});

describe('footnoteDefinition.highlightColor', () => {
  it('is the flash colour when the app sets none', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const store = createFootnoteFocusStore();
    const ctx = createRenderCtx({
      components: defaultComponents,
      theme: resolveTheme({
        footnoteDefinition: { highlightColor: '#abcdef' },
      }),
      handlers: { onFootnotePress: () => {} },
      footnoteFocus: {
        store,
        target: 'definition',
        highlight: { color: null, duration: 1000 },
      },
    });
    const root = await renderTree(
      <BlockList table={tableFor('a[^1]\n\n[^1]: Note.\n')} ctx={ctx} />
    );
    await act(async () => store.flash({ kind: 'definition', label: '1' }));
    await act(async () => {});
    expect(JSON.stringify(root.toJSON())).toContain('#abcdef');
  });
});
