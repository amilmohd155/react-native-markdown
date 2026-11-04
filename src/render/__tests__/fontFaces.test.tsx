import { createElement, type ReactNode } from 'react';
import type { TextStyle } from 'react-native';
import { act, create, type ReactTestRendererJSON } from 'react-test-renderer';
import {
  createTheme,
  resolveTheme,
  type FontFaces,
  type ThemeInput,
} from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import type { Components } from '../elements';
import { hostComponents, tableFor } from './helpers';

const inter: FontFaces = {
  regular: 'Inter_400Regular',
  italic: 'Inter_400Regular_Italic',
  bold: 'Inter_700Bold',
  boldItalic: 'Inter_700Bold_Italic',
};
const display: FontFaces = {
  regular: 'Display_400',
  italic: 'Display_400_Italic',
  bold: 'Display_700',
  boldItalic: 'Display_700_Italic',
};

type StyledProps = { style: { text: TextStyle }; children?: ReactNode };

/** Host components that expose their text style as props, to assert on. */
function components(): Components {
  const expose = (name: string) =>
    function Exposed({ style, children }: StyledProps) {
      return createElement(
        name,
        {
          family: style.text.fontFamily,
          weight: style.text.fontWeight,
          fontStyle: style.text.fontStyle,
        },
        children
      );
    };
  return hostComponents({
    Strong: expose('Strong'),
    Emphasis: expose('Emphasis'),
  } as never);
}

function render(source: string, input: ThemeInput) {
  const ctx = createRenderCtx({
    components: components(),
    theme: resolveTheme(createTheme(input)),
  });
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<BlockList table={tableFor(source)} ctx={ctx} />);
  });
  return root;
}

/** The `family` of each Strong/Emphasis in document order, depth first. */
function faces(root: ReturnType<typeof create>): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRendererJSON | string) => {
    if (typeof node === 'string') return;
    if (node.type === 'Strong' || node.type === 'Emphasis') {
      out.push(
        `${node.type}:${String(node.props.family ?? '-')}/${String(
          node.props.weight ?? '-'
        )}/${String(node.props.fontStyle ?? '-')}`
      );
    }
    for (const child of node.children ?? []) walk(child);
  };
  const json = root.toJSON();
  for (const node of Array.isArray(json) ? json : [json]) {
    if (node) walk(node);
  }
  return out;
}

describe('inline flattener with font faces (P1-16)', () => {
  const theme: ThemeInput = { fonts: { body: inter } };

  it('picks the bold or italic face for Strong and Emphasis', () => {
    expect(faces(render('a **b** *c*', theme))).toEqual([
      'Strong:Inter_700Bold/-/-',
      'Emphasis:Inter_400Regular_Italic/-/-',
    ]);
  });

  it('picks the combined face for nesting, either way round', () => {
    expect(faces(render('***x***', theme))).toEqual([
      'Emphasis:Inter_400Regular_Italic/-/-',
      'Strong:Inter_700Bold_Italic/-/-',
    ]);
    expect(faces(render('**a *b* c**', theme))).toEqual([
      'Strong:Inter_700Bold/-/-',
      'Emphasis:Inter_700Bold_Italic/-/-',
    ]);
    expect(faces(render('*a **b** c*', theme))).toEqual([
      'Emphasis:Inter_400Regular_Italic/-/-',
      'Strong:Inter_700Bold_Italic/-/-',
    ]);
  });

  it('starts headings bold: Strong adds nothing, Emphasis picks boldItalic', () => {
    expect(faces(render('# a **b** *c*', theme))).toEqual([
      'Strong:-/-/-',
      'Emphasis:Inter_700Bold_Italic/-/-',
    ]);
  });

  it('uses the heading faces inside a heading and the body faces elsewhere', () => {
    const both: ThemeInput = { fonts: { body: inter, heading: display } };
    expect(faces(render('# *a*\n\n*b*', both))).toEqual([
      'Emphasis:Display_700_Italic/-/-',
      'Emphasis:Inter_400Regular_Italic/-/-',
    ]);
  });

  it('starts table head cells bold', () => {
    expect(faces(render('| *a* |\n| --- |\n| *b* |\n', theme))).toEqual([
      'Emphasis:Inter_700Bold_Italic/-/-',
      'Emphasis:Inter_400Regular_Italic/-/-',
    ]);
  });

  it('falls back to fontWeight/fontStyle when a face is missing', () => {
    // No bold or italic face: the regular face stays (inherited, so no
    // family is repeated) and the missing axes come from the style props.
    expect(
      faces(render('***x***', { fonts: { body: { regular: 'R' } } }))
    ).toEqual(['Emphasis:-/-/italic', 'Strong:-/700/italic']);
  });

  it('keeps the family-name behaviour: weight and style props only', () => {
    expect(faces(render('# ***x***', { fonts: { body: 'Inter' } }))).toEqual([
      'Emphasis:-/-/italic',
      'Strong:-/700/-',
    ]);
  });

  it('renders equal output for equal input (blocks stay memoizable)', () => {
    const a = render('a ***b*** **c**', theme).toJSON();
    const b = render('a ***b*** **c**', theme).toJSON();
    expect(a).toEqual(b);
  });
});
