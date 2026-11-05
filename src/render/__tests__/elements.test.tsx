import { createElement, memo, type ComponentType, type ReactNode } from 'react';
import { Image } from 'react-native';
import { renderTree } from '../../__tests__/tree';
import { ELEMENT_NAMES, type ElementName } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx, type RenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import type { Components } from '../elements';
import { isInlineView, markInlineView } from '../inlineView';
import { tableFor } from './helpers';

/**
 * M3 done criteria (work-breakdown.md · M3):
 * - a snapshot for every element, with the default components;
 * - editing one block re-renders only that block;
 * - a user `memo` component bails out when its block is unchanged.
 *
 * The fixture list is checked against ELEMENT_NAMES, so a new element
 * without a fixture fails here.
 */
const FIXTURES: Record<ElementName, string> = {
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

/** A wrapper around a declared inline view must be declared too. */
function keepDeclaration<C extends object>(original: object, wrapper: C): C {
  return isInlineView(original) ? markInlineView(wrapper) : wrapper;
}

/** The default map with element `name` replaced by a counting wrapper. */
function spied(name: ElementName, seen: ElementName[]): Components {
  const Default = defaultComponents[name] as ComponentType<object>;
  const Spy = keepDeclaration(Default, (props: object) => {
    seen.push(name);
    return createElement(Default, props);
  });
  return Object.freeze({ ...defaultComponents, [name]: Spy }) as Components;
}

async function mount(source: string, ctx: RenderCtx) {
  const root = await renderTree(
    <BlockList table={tableFor(source)} ctx={ctx} />
  );
  return {
    root,
    update(next: string, nextCtx = ctx) {
      return root.rerender(<BlockList table={tableFor(next)} ctx={nextCtx} />);
    },
  };
}

// Image sizes stay unknown: snapshots don't depend on network timing.
let getSize: jest.SpyInstance;
beforeEach(() => {
  getSize = jest.spyOn(Image, 'getSize') as jest.SpyInstance;
  getSize.mockReturnValue(new Promise(() => {}));
});
afterEach(() => getSize.mockRestore());

describe('element snapshots', () => {
  it('has a fixture for every element', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...ELEMENT_NAMES].sort());
  });

  it.each(ELEMENT_NAMES)('%s', async (name) => {
    const seen: ElementName[] = [];
    const { root } = await mount(
      FIXTURES[name],
      createRenderCtx({ components: spied(name, seen) })
    );
    // The fixture really renders the element under test.
    expect(seen).toContain(name);
    expect(root.toJSON()).toMatchSnapshot();
  });
});

describe('memoization with the default elements', () => {
  const DOC = [
    '# Title',
    'First paragraph with **bold** and a [link](https://x).',
    '- item one\n- item two',
    '| a | b |\n|---|---|\n| 1 | 2 |',
    'Last paragraph.',
  ].join('\n\n');

  /** Counts renders of every element through wrappers around the defaults. */
  function counting() {
    const renders: string[] = [];
    const map: Record<string, ComponentType<object>> = {};
    for (const name of ELEMENT_NAMES) {
      const Default = defaultComponents[name] as ComponentType<object>;
      map[name] = keepDeclaration(Default, (props: object) => {
        renders.push(name);
        return createElement(Default, props);
      });
    }
    return { renders, components: Object.freeze(map) as Components };
  }

  it('editing one block re-renders only that block', async () => {
    const { renders, components } = counting();
    const view = await mount(DOC, createRenderCtx({ components }));
    expect(renders.length).toBeGreaterThan(10);

    renders.length = 0;
    await view.update(
      DOC.replace('Last paragraph.', 'Last paragraph, edited.')
    );
    expect(renders).toEqual(['Paragraph']);
  });

  it('re-rendering with the same document renders nothing', async () => {
    const { renders, components } = counting();
    const ctx = createRenderCtx({ components });
    const view = await mount(DOC, ctx);
    renders.length = 0;
    await view.update(DOC);
    expect(renders).toEqual([]);
  });

  it('a user memo component bails out when its block is unchanged', async () => {
    const renders: ReactNode[] = [];
    const Heading = memo(({ children }: { children: ReactNode }) => {
      renders.push(children);
      return null;
    });
    const components = Object.freeze({ ...defaultComponents, Heading });
    const view = await mount(DOC, createRenderCtx({ components }));
    expect(renders).toEqual(['Title']);

    // A new ctx makes every Block re-render; the heading's props are plain
    // values, equal to last time, so the user's memo bails out.
    renders.length = 0;
    await view.update(DOC, createRenderCtx({ components, selectable: true }));
    expect(renders).toEqual([]);
  });
});
