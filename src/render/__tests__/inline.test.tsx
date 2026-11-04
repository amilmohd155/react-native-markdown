import { memo, type ComponentType, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { act, create, type ReactTestRendererJSON } from 'react-test-renderer';
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

function json(node: ReactNode) {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<>{node}</>);
  });
  return root.toJSON() as ReactTestRendererJSON | ReactTestRendererJSON[];
}

describe('inline flattener', () => {
  it('returns a single string for plain text', () => {
    expect(inlineOf('just some text')).toBe('just some text');
    expect(inlineOf('a &amp; b \\* c')).toBe('a & b * c');
  });

  it('renders soft breaks as spaces by default, or newlines (P1-2)', () => {
    expect(inlineOf('one\ntwo\nthree')).toBe('one two three');
    expect(inlineOf('one\ntwo', { softBreak: 'newline' })).toBe('one\ntwo');
  });

  it('merges text around inline elements into one run per gap', () => {
    const node = inlineOf('a *b* c **d** e');
    expect(Array.isArray(node)).toBe(true);
    expect(node).toHaveLength(5);
    expect(json(node)).toMatchSnapshot();
  });

  it('merges literal HTML text into the surrounding run', () => {
    // An unclosed allowlisted tag becomes text and joins the run.
    expect(inlineOf('a <sup>x')).toBe('a <sup>x');
  });

  it('nests inline elements and their props', () => {
    expect(
      json(inlineOf('**bold [link *em*](https://x "T") `code`** ~~gone~~'))
    ).toMatchSnapshot();
  });

  it('renders hard breaks as LineBreak elements', () => {
    expect(json(inlineOf('a  \nb'))).toMatchSnapshot();
    expect(json(inlineOf('a<br>b'))).toMatchSnapshot();
  });

  it('renders inline images, footnote references and raw inline HTML', () => {
    expect(
      json(inlineOf('see ![i](i.png "T") ref[^n] <span>x</span>\n\n[^n]: n\n'))
    ).toMatchSnapshot();
  });

  it('renders the safe HTML subset as elements', () => {
    expect(
      json(
        inlineOf(
          'x<sup>2</sup> H<sub>2</sub>O <u>u</u> <mark>m</mark> <kbd>K</kbd>'
        )
      )
    ).toMatchSnapshot();
  });

  it('passes each element its resolved theme style', () => {
    const styles: unknown[] = [];
    const record = ({ style }: { style: unknown }) => {
      styles.push(style);
      return null;
    };
    const node = inlineOf('**a** [b](x)', {
      components: { Strong: record, Link: record },
    });
    json(node);
    const { elements } = getDefaultTheme();
    expect(styles).toEqual([elements.Strong, elements.Link]);
  });

  it('returns null for empty inline content', () => {
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

  it('warns once per element when an inline component returns a View', () => {
    json(inlineOf('**a** and **b**', { components: { Strong: ViewStrong } }));
    json(inlineOf('**c**', { components: { Strong: ViewStrong } }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"Strong" returned a <View>');
  });

  it('checks memo components too, keeping their memo behaviour', () => {
    json(inlineOf('[a](x)', { components: { Link: memo(ViewStrong) } }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"Link"');
  });

  it('does not warn for Text-compatible output', () => {
    const TextStrong = ({ children }: { children: ReactNode }) => (
      <Text>{children}</Text>
    );
    json(inlineOf('**a**', { components: { Strong: TextStrong } }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not check outside dev', () => {
    g.__DEV__ = false;
    json(inlineOf('**a**', { components: { Strong: ViewStrong } }));
    expect(warn).not.toHaveBeenCalled();
  });
});
