import {
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { findAll, renderTree, type TestInstance } from '../../__tests__/tree';
import { RenderCtxContext } from '../contexts';
import { createRenderCtx, type RenderCtxInput } from '../context';
import { defaultComponents } from '../defaults';
import {
  CodeGutter,
  CodeRow,
  codeLayout,
  useGutterWidth,
} from '../defaults/codeBlockLayout';

const CODE = 'const a = 1;\n\nlet b = a + 1;';

type Input = Omit<RenderCtxInput, 'components'>;

function block(input: Input, props: { code?: string; open?: boolean } = {}) {
  const ctx = createRenderCtx({ ...input, components: defaultComponents });
  return {
    ctx,
    element: (
      <RenderCtxContext.Provider value={ctx}>
        <defaultComponents.CodeBlock
          code={props.code ?? CODE}
          language="ts"
          meta={null}
          open={props.open ?? false}
          style={ctx.theme.elements.CodeBlock}
        />
      </RenderCtxContext.Provider>
    ),
  };
}

async function renderBlock(
  input: Input,
  props?: { code?: string; open?: boolean }
) {
  const { ctx, element } = block(input, props);
  const view = await render(element);
  const all = (match: (n: TestInstance) => boolean) =>
    findAll(view.container, match);
  return { ctx, view, all };
}

const isScroll = (n: TestInstance) => n.type === 'RCTScrollView';
const isText = (n: TestInstance) => n.type === 'Text';
const isGutter = (n: TestInstance) =>
  n.type === 'Text' &&
  n.props.selectable === false &&
  n.props.style !== undefined &&
  Array.isArray(n.props.style) &&
  n.props.style.some(
    (s: unknown) => typeof s === 'object' && s !== null && 'minWidth' in s
  );
const isCode = (n: TestInstance) => isText(n) && !isGutter(n);
const isWrapButton = (n: TestInstance) =>
  n.type === 'View' && n.props.accessibilityLabel === 'Wrap lines';
const isLabelled = (n: TestInstance) =>
  n.type === 'View' &&
  n.props.accessible === true &&
  n.props.accessibilityRole !== 'button';

function hiddenFromA11y(node: TestInstance): boolean {
  for (let n: TestInstance | null = node; n !== null; n = n.parent) {
    if (
      n.props.accessibilityElementsHidden === true &&
      n.props.importantForAccessibility === 'no-hide-descendants'
    ) {
      return true;
    }
  }
  return false;
}

/** Web: `aria-hidden` on an ancestor (react-native-web ignores the native props). */
function ariaHidden(node: TestInstance): boolean {
  for (let n: TestInstance | null = node; n !== null; n = n.parent) {
    if (n.props['aria-hidden'] === true) return true;
  }
  return false;
}

function inside(node: TestInstance, ancestor: TestInstance): boolean {
  for (let n = node.parent; n !== null; n = n.parent) {
    if (n === ancestor) return true;
  }
  return false;
}

/** Text of a host Text: its string children joined. */
const textOfNode = (n: TestInstance) =>
  n.children.filter((c) => typeof c === 'string').join('');

describe('codeLayout', () => {
  it('maps numbers and wrap to the four modes', () => {
    expect(codeLayout({ lineNumbers: false, wrap: false })).toBe('scroll');
    expect(codeLayout({ lineNumbers: false, wrap: true })).toBe('wrap');
    expect(codeLayout({ lineNumbers: true, wrap: false })).toBe('gutter');
    expect(codeLayout({ lineNumbers: true, wrap: true })).toBe('rows');
  });
});

describe('default CodeBlock layouts (P3-35)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('numbers off, wrap off, header off: the tree is unchanged', async () => {
    const { ctx, element } = block({});
    const tree = await renderTree(element);
    const style = ctx.theme.elements.CodeBlock;
    const today = await renderTree(
      <View style={style.container}>
        <ScrollView
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
        >
          <Text style={style.text} selectable={false}>
            {CODE}
          </Text>
        </ScrollView>
      </View>
    );
    expect(tree.toJSON()).toEqual(today.toJSON());
  });

  it('numbers off, wrap on: one wrapping Text, no ScrollView', async () => {
    const { ctx, element } = block({ codeBlock: { wrap: true } });
    const tree = await renderTree(element);
    const style = ctx.theme.elements.CodeBlock;
    const expected = await renderTree(
      <View style={style.container}>
        <Text style={style.text} selectable={false}>
          {CODE}
        </Text>
      </View>
    );
    expect(tree.toJSON()).toEqual(expected.toJSON());
  });

  it('numbers on, wrap off: a gutter column outside the ScrollView', async () => {
    const { ctx, all } = await renderBlock({
      codeBlock: { lineNumbers: true },
      selectable: true,
    });
    const [scroll] = all(isScroll);
    expect(all(isScroll)).toHaveLength(1);
    const gutters = all(isGutter);
    expect(gutters).toHaveLength(1);
    const gutter = gutters[0]!;
    expect(textOfNode(gutter)).toBe('1\n2\n3');
    expect(inside(gutter, scroll!)).toBe(false);
    expect(gutter.props.selectable).toBe(false);
    expect(hiddenFromA11y(gutter)).toBe(true);
    // Web: the gutter column carries aria-hidden, the code does not.
    expect(gutter.parent!.props['aria-hidden']).toBe(true);
    expect(gutter.props.style[0]).toBe(ctx.theme.codeBlockGutter.text);

    const codes = all(isCode);
    expect(codes).toHaveLength(1);
    expect(textOfNode(codes[0]!)).toBe(CODE);
    expect(codes[0]!.props.selectable).toBe(true);
    expect(inside(codes[0]!, scroll!)).toBe(true);
    expect(ariaHidden(codes[0]!)).toBe(false);
  });

  it('sizes the gutter from the digits of the last line number', async () => {
    const code = Array.from({ length: 120 }, (_, i) => `x${i}`).join('\n');
    const nine = Array.from({ length: 9 }, (_, i) => `x${i}`).join('\n');
    const width = async (c: string) => {
      const { all } = await renderBlock(
        { codeBlock: { lineNumbers: true } },
        { code: c }
      );
      return all(isGutter)[0]!.props.style[1].minWidth as number;
    };
    const [three, one] = [await width(code), await width(nine)];
    expect(three).toBeGreaterThan(one);
    expect(await width(`${nine}\nx9`)).toBeGreaterThan(one);
  });

  it('numbers on, wrap on: one row per line, gutter beside wrapping code', async () => {
    const { all } = await renderBlock({
      codeBlock: { lineNumbers: true, wrap: true },
      selectable: true,
    });
    expect(all(isScroll)).toEqual([]);
    const gutters = all(isGutter);
    expect(gutters.map(textOfNode)).toEqual(['1', '2', '3']);
    for (const g of gutters) {
      expect(g.props.selectable).toBe(false);
      expect(hiddenFromA11y(g)).toBe(true);
      expect(g.parent!.props['aria-hidden']).toBe(true);
    }
    const codes = all(isCode);
    // Native: the blank line holds ' '.
    expect(codes.map(textOfNode)).toEqual([
      'const a = 1;',
      ' ',
      'let b = a + 1;',
    ]);
    for (const [i, c] of codes.entries()) {
      expect(c.props.selectable).toBe(true);
      expect(c.props.style).toContainEqual(
        expect.objectContaining({ flex: 1 })
      );
      // Row: a View holding the gutter column and the code Text.
      const row = c.parent!;
      expect(row.props.style).toEqual({ flexDirection: 'row' });
      expect(findAll(row, isGutter)).toEqual([gutters[i]]);
      expect(ariaHidden(c)).toBe(false);
    }
  });

  it('numbers on, wrap on: web rows keep their newline and concatenate to the code', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const code = `${CODE}\n`;
    const { all } = await renderBlock(
      { codeBlock: { lineNumbers: true, wrap: true } },
      { code }
    );
    const texts = all(isCode).map(textOfNode);
    expect(texts).toEqual(['const a = 1;\n', '\n', 'let b = a + 1;\n']);
    expect(texts.join('')).toBe(code);
  });

  it('labels the numbered body with the code only, header off or on', async () => {
    for (const header of [false, true]) {
      for (const wrap of [false, true]) {
        const { all } = await renderBlock({
          codeBlock: { header, wrap, lineNumbers: true },
        });
        const labelled = all(isLabelled);
        expect(labelled).toHaveLength(1);
        expect(labelled[0]!.props.accessibilityLabel).toBe(CODE);
      }
    }
  });

  it('keeps numbers out of the copied code', async () => {
    const onCopyPress = jest.fn();
    const { all } = await renderBlock({
      codeBlock: { header: true, lineNumbers: true, wrap: true },
      handlers: { onCopyPress },
    });
    const [copy] = all(
      (n) => n.type === 'View' && n.props.accessibilityLabel === 'Copy code'
    );
    await fireEvent.press(copy!);
    expect(onCopyPress).toHaveBeenCalledWith({
      code: CODE,
      language: 'ts',
      meta: null,
    });
  });
});

describe('wrap toggle (P3-35)', () => {
  it('switches the layout and tracks the button state', async () => {
    const { all } = await renderBlock({
      codeBlock: { header: true, lineNumbers: true },
    });
    const button = () => all(isWrapButton)[0]!;
    expect(button().props.accessibilityState.selected).toBe(false);
    expect(all(isScroll)).toHaveLength(1);

    await fireEvent.press(button());
    expect(button().props.accessibilityState.selected).toBe(true);
    expect(all(isScroll)).toEqual([]);
    expect(all(isGutter)).toHaveLength(3);

    await fireEvent.press(button());
    expect(button().props.accessibilityState.selected).toBe(false);
    expect(all(isScroll)).toHaveLength(1);
    expect(all(isGutter)).toHaveLength(1);
  });

  it('starts from codeBlock.wrap', async () => {
    const { all } = await renderBlock({
      codeBlock: { header: true, wrap: true },
    });
    expect(all(isWrapButton)[0]!.props.accessibilityState.selected).toBe(true);
    expect(all(isScroll)).toEqual([]);
  });

  it('is hidden while open, wrap still applies', async () => {
    const { all } = await renderBlock(
      { codeBlock: { header: true, wrap: true } },
      { open: true }
    );
    expect(all(isWrapButton)).toEqual([]);
    expect(all(isScroll)).toEqual([]);
  });

  it('is not offered without the header', async () => {
    const { all } = await renderBlock({ codeBlock: { wrap: true } });
    expect(all(isWrapButton)).toEqual([]);
    expect(all(isScroll)).toEqual([]);
  });
});

describe('building blocks for the highlighted block', () => {
  const gutter = createRenderCtx({ components: defaultComponents }).theme
    .codeBlockGutter;

  it('CodeGutter: one hidden, unselectable Text per entry', async () => {
    const tree = await renderTree(
      <CodeGutter
        texts={['1\n2', '3\n4']}
        style={gutter}
        width={20}
        maxFontSizeMultiplier={1.5}
      />
    );
    const texts = tree.findAll(isText);
    expect(texts.map(textOfNode)).toEqual(['1\n2', '3\n4']);
    for (const t of texts) {
      expect(t.props.selectable).toBe(false);
      expect(t.props.maxFontSizeMultiplier).toBe(1.5);
      expect(t.props.style).toEqual([gutter.text, { minWidth: 20 }]);
      expect(hiddenFromA11y(t)).toBe(true);
    }
  });

  it('CodeRow: the number beside a code Text holding the children', async () => {
    const tree = await renderTree(
      <CodeRow
        number={7}
        gutterStyle={gutter}
        gutterWidth={20}
        textStyle={{ fontSize: 14 }}
        selectable
        maxFontSizeMultiplier={undefined}
      >
        <Text style={{ color: 'red' }}>{'let'}</Text>
        {' x'}
      </CodeRow>
    );
    const [number, code] = tree.findAll(
      (n) => isText(n) && n.parent?.type === 'View'
    );
    expect(textOfNode(number!)).toBe('7');
    expect(code!.props.selectable).toBe(true);
    expect(hiddenFromA11y(code!)).toBe(false);
    expect(findAll(code!, isText).map(textOfNode)).toEqual(['let']);
  });

  it('useGutterWidth: digits times the scaled digit width plus the padding', async () => {
    let fontScale = 0;
    const style = { text: { fontSize: 10, paddingRight: 6 }, container: {} };
    const widths: number[] = [];
    function Probe({ last, max }: { last: number; max?: number }) {
      fontScale = useWindowDimensions().fontScale;
      widths.push(useGutterWidth(style, last, max));
      return null;
    }
    await renderTree(<Probe last={9} />);
    await renderTree(<Probe last={100} />);
    await renderTree(<Probe last={0} />);
    await renderTree(<Probe last={100} max={1} />);
    expect(widths).toEqual([
      Math.ceil(10 * fontScale * 0.62) + 6,
      Math.ceil(30 * fontScale * 0.62) + 6,
      Math.ceil(10 * fontScale * 0.62) + 6,
      Math.ceil(30 * Math.min(fontScale, 1) * 0.62) + 6,
    ]);
  });
});
