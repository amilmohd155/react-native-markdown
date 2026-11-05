import { memo, type ComponentType, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { renderTree, type JsonElement } from '../../__tests__/tree';
import { NodeType } from '../../model';
import { getDefaultTheme, type ElementName } from '../../theme';
import { createRenderCtx, type SoftBreak } from '../context';
import { resetInlineViewWarnings } from '../devInline';
import { renderInline } from '../inline';
import { hostComponents, nodesOfType, tableFor } from './helpers';

type Overrides = Partial<Record<ElementName, ComponentType<never>>>;

/** Inline children of the first paragraph (or heading) of `source`. */
function inlineOf(
  source: string,
  options: { softBreak?: SoftBreak; components?: Overrides } = {}
): ReactNode {
  const table = tableFor(source);
  const [block] = [
    ...nodesOfType(table, NodeType.Paragraph),
    ...nodesOfType(table, NodeType.Heading),
  ];
  const ctx = createRenderCtx({
    components: hostComponents(options.components),
    softBreak: options.softBreak,
  });
  return renderInline(table, block!, ctx);
}

async function json(node: ReactNode) {
  const tree = await renderTree(<>{node}</>);
  return tree.toJSON() as JsonElement | JsonElement[];
}

describe('inline flattener', () => {
  it('returns a single string for plain text', async () => {
    expect(inlineOf('just some text')).toBe('just some text');
    expect(inlineOf('a &amp; b \\* c')).toBe('a & b * c');
  });

  it('renders soft breaks as spaces by default, or newlines (P1-2)', async () => {
    expect(inlineOf('one\ntwo\nthree')).toBe('one two three');
    expect(inlineOf('one\ntwo', { softBreak: 'newline' })).toBe('one\ntwo');
  });

  it('merges text around inline elements into one run per gap', async () => {
    const node = inlineOf('a *b* c **d** e');
    expect(Array.isArray(node)).toBe(true);
    expect(node).toHaveLength(5);
    expect(await json(node)).toMatchSnapshot();
  });

  it('merges literal HTML text into the surrounding run', async () => {
    // An unclosed allowlisted tag becomes text and joins the run.
    expect(inlineOf('a <sup>x')).toBe('a <sup>x');
  });

  it('nests inline elements and their props', async () => {
    expect(
      await json(
        inlineOf('**bold [link *em*](https://x "T") `code`** ~~gone~~')
      )
    ).toMatchSnapshot();
  });

  it('renders hard breaks as LineBreak elements', async () => {
    expect(await json(inlineOf('a  \nb'))).toMatchSnapshot();
    expect(await json(inlineOf('a<br>b'))).toMatchSnapshot();
  });

  it('renders inline images, footnote references and raw inline HTML', async () => {
    expect(
      await json(
        inlineOf('see ![i](i.png "T") ref[^n] <span>x</span>\n\n[^n]: n\n')
      )
    ).toMatchSnapshot();
  });

  it('renders the safe HTML subset as elements', async () => {
    expect(
      await json(
        inlineOf(
          'x<sup>2</sup> H<sub>2</sub>O <u>u</u> <mark>m</mark> <kbd>K</kbd>'
        )
      )
    ).toMatchSnapshot();
  });

  it('passes each element its resolved theme style', async () => {
    const styles: unknown[] = [];
    const record = ({ style }: { style: unknown }) => {
      styles.push(style);
      return null;
    };
    const node = inlineOf('**a** [b](x)', {
      components: { Strong: record, Link: record },
    });
    await json(node);
    const { elements } = getDefaultTheme();
    expect(styles).toEqual([elements.Strong, elements.Link]);
  });

  it('returns null for empty inline content', async () => {
    expect(inlineOf('#')).toBeNull();
  });
});

describe('undeclared inline View warning (D8)', () => {
  const g = globalThis as { __DEV__?: unknown };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    resetInlineViewWarnings();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    g.__DEV__ = true;
  });

  const ViewStrong = ({ children }: { children: ReactNode }) => (
    <View>{children}</View>
  );

  it('warns once per element when an inline component returns a View', async () => {
    await json(
      inlineOf('**a** and **b**', { components: { Strong: ViewStrong } })
    );
    await json(inlineOf('**c**', { components: { Strong: ViewStrong } }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"Strong" returned a <View>');
  });

  it('checks memo components too, keeping their memo behaviour', async () => {
    await json(inlineOf('[a](x)', { components: { Link: memo(ViewStrong) } }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"Link"');
  });

  it('does not warn for Text-compatible output', async () => {
    const TextStrong = ({ children }: { children: ReactNode }) => (
      <Text>{children}</Text>
    );
    await json(inlineOf('**a**', { components: { Strong: TextStrong } }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not check outside dev', async () => {
    g.__DEV__ = false;
    await json(inlineOf('**a**', { components: { Strong: ViewStrong } }));
    expect(warn).not.toHaveBeenCalled();
  });
});
