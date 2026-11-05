import { Image } from 'react-native';
import { renderTree } from '../../__tests__/tree';
import { GFM_PLUGINS, type GfmPluginName } from '../../plugins/gfm';
import {
  darkTheme,
  ELEMENT_NAMES,
  lightTheme,
  resolveTheme,
  type ElementName,
} from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { tableFor } from './helpers';

/**
 * 06-testing.md · Renderer tests: snapshots of every element in light and
 * dark themes, plus each built-in plugin. `elements.test.tsx` covers the
 * light theme with a render-count spy; this file adds the dark theme and
 * the plugins in both.
 */
const THEMES = {
  light: resolveTheme(lightTheme),
  dark: resolveTheme(darkTheme),
};

const ELEMENTS: Record<ElementName, string> = {
  Heading: '## A heading',
  Paragraph: 'A paragraph.',
  Blockquote: '> A quote.',
  List: '1. one\n2. two',
  ListItem: '- [x] done\n- plain',
  CodeBlock: '```ts title="a.ts"\nconst a = 1;\n```',
  Table: '| a | b |\n|:--|--:|\n| 1 | 2 |',
  TableRow: '| a |\n|---|\n| 1 |',
  TableCell: '| a |\n|:-:|\n| 1 |',
  Divider: '---',
  Image: '![An image](https://example.com/a.png "Title")',
  HtmlBlock: '<div>\nBlock HTML\n</div>',
  FootnoteDefinition: 'Text[^1].\n\n[^1]: The note.',
  Strong: 'Some **strong** text.',
  Emphasis: 'Some *emphasis*.',
  Strikethrough: 'Some ~~deleted~~ text.',
  InlineCode: 'Some `code`.',
  Link: 'A [link](https://example.com "Title").',
  InlineImage: 'An ![icon](https://example.com/i.png) inline.',
  LineBreak: 'Line one\\\nline two',
  FootnoteReference: 'A reference[^n].\n\n[^n]: Note.',
  Underline: 'Some <u>underlined</u> text.',
  Highlight: 'Some <mark>highlighted</mark> text.',
  Superscript: 'E = mc<sup>2</sup>',
  Subscript: 'H<sub>2</sub>O',
  Kbd: 'Press <kbd>Ctrl</kbd>.',
  HtmlInline: 'An <span>unknown</span> tag.',
};

const PLUGINS: Record<GfmPluginName, string> = {
  tables: '| a | b |\n|---|---|\n| 1 | 2 |',
  strikethrough: 'a ~~b~~ c ~d~',
  taskLists: '- [ ] open\n- [x] done',
  autolinks: 'See www.example.com, https://example.com/a and a@b.co.',
  footnotes: 'Text[^1] and more[^1].\n\n[^1]: The note.',
  tagfilter: '<title>no</title>\n\na <script>x</script> b',
};

async function render(source: string, theme: keyof typeof THEMES) {
  const ctx = createRenderCtx({
    components: defaultComponents,
    theme: THEMES[theme],
  });
  const tree = await renderTree(
    <BlockList table={tableFor(source)} ctx={ctx} />
  );
  return tree.toJSON();
}

// Image sizes stay unknown: snapshots don't depend on network timing.
let getSize: jest.SpyInstance;
beforeEach(() => {
  getSize = jest.spyOn(Image, 'getSize') as jest.SpyInstance;
  getSize.mockReturnValue(new Promise(() => {}));
});
afterEach(() => getSize.mockRestore());

describe('theme snapshots', () => {
  it('has a fixture for every element and built-in plugin', () => {
    expect(Object.keys(ELEMENTS).sort()).toEqual([...ELEMENT_NAMES].sort());
    expect(Object.keys(PLUGINS).sort()).toEqual(
      GFM_PLUGINS.map((p) => p.name).sort()
    );
  });

  describe.each(['light', 'dark'] as const)('%s', (theme) => {
    it.each(ELEMENT_NAMES)('element %s', async (name) => {
      expect(await render(ELEMENTS[name], theme)).toMatchSnapshot();
    });

    it.each(Object.keys(PLUGINS) as GfmPluginName[])(
      'plugin %s',
      async (name) => {
        expect(await render(PLUGINS[name], theme)).toMatchSnapshot();
      }
    );
  });

  it('the dark theme changes the output', async () => {
    expect(await render(ELEMENTS.Link, 'dark')).not.toEqual(
      await render(ELEMENTS.Link, 'light')
    );
  });
});
