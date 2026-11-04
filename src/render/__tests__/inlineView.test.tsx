import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { getDefaultTheme, lightTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx, type RenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { resetInlineViewWarnings } from '../devInline';
import type { Components } from '../elements';
import {
  baselineOf,
  inlineView,
  inlineViewOffset,
  isInlineView,
  type InlineBaseline,
} from '../inlineView';
import { tableFor } from './helpers';

function mount(source: string, ctx: RenderCtx) {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<BlockList table={tableFor(source)} ctx={ctx} />);
  });
  return {
    root,
    update(next: string, nextCtx = ctx) {
      act(() =>
        root.update(<BlockList table={tableFor(next)} ctx={nextCtx} />)
      );
    },
  };
}

function withComponents(overrides: Partial<Components>): RenderCtx {
  return createRenderCtx({
    components: Object.freeze({ ...defaultComponents, ...overrides }),
  });
}

describe('inlineView()', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    resetInlineViewWarnings();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('marks the component as a declared inline view', () => {
    const Chip = () => <View />;
    expect(isInlineView(Chip)).toBe(false);
    expect(inlineView<'Link'>(Chip)).toBe(Chip);
    expect(isInlineView(Chip)).toBe(true);
  });

  it('lets a declared element render a View without a dev warning', () => {
    const LinkChip = inlineView<'Link'>(({ children }) => (
      <View testID="chip">{children}</View>
    ));
    const { root } = mount(
      'see [docs](https://x)\n',
      withComponents({ Link: LinkChip })
    );
    expect(root.root.findByProps({ testID: 'chip' })).toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
  });

  it('still warns for an undeclared View', () => {
    const Chip = ({ children }: { children: ReactNode }) => (
      <View>{children}</View>
    );
    mount('see [docs](https://x)\n', withComponents({ Link: Chip }));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('passes the block’s font metrics as baseline', () => {
    const seen: InlineBaseline[] = [];
    const Code = inlineView<'InlineCode'>(({ baseline }) => {
      seen.push(baseline);
      return null;
    });
    mount(
      '# `a`\n\nx `b`\n\n| h |\n|---|\n| `c` |\n',
      withComponents({ InlineCode: Code })
    );
    const theme = getDefaultTheme();
    expect(seen).toEqual([
      { fontSize: 40, lineHeight: theme.headings[0].text.lineHeight },
      { fontSize: 16, lineHeight: 24 },
      { fontSize: 16, lineHeight: 24 },
    ]);
  });

  it('passes baseline inside nested inline elements too', () => {
    const seen: InlineBaseline[] = [];
    const Code = inlineView<'InlineCode'>(({ baseline }) => {
      seen.push(baseline);
      return null;
    });
    mount('## **[`a`](https://x)**\n', withComponents({ InlineCode: Code }));
    expect(seen).toEqual([expect.objectContaining({ fontSize: 33 })]);
  });

  it('does not pass baseline to undeclared components', () => {
    const props: object[] = [];
    const Code = ({ code }: { code: string }) => {
      props.push({ code });
      return null;
    };
    const Spy = (p: object) => {
      props.push(p);
      return null;
    };
    mount('`a` **b**\n', withComponents({ InlineCode: Code, Strong: Spy }));
    expect(props.some((p) => 'baseline' in p)).toBe(false);
  });

  it('gives a declared memo component the same baseline object, so it bails out', () => {
    const renders: string[] = [];
    const Code = inlineView<'InlineCode'>(
      memo(({ code }) => {
        renders.push(code);
        return null;
      })
    );
    const components = Object.freeze({
      ...defaultComponents,
      InlineCode: Code,
    });
    const view = mount('x `a`\n', createRenderCtx({ components }));
    expect(renders).toEqual(['a']);

    // A new ctx (same theme) re-renders the block; equal props → no render.
    renders.length = 0;
    view.update('x `a`\n', createRenderCtx({ components, selectable: true }));
    expect(renders).toEqual([]);
  });
});

describe('baselineOf', () => {
  it('reads fontSize and lineHeight from the block text style, cached', () => {
    const text = { fontSize: 20, lineHeight: 30 };
    expect(baselineOf(text, lightTheme)).toEqual({
      fontSize: 20,
      lineHeight: 30,
    });
    expect(baselineOf(text, lightTheme)).toBe(baselineOf(text, lightTheme));
  });

  it('falls back to the tokens', () => {
    expect(baselineOf(undefined, lightTheme)).toEqual({
      fontSize: 16,
      lineHeight: 24,
    });
    expect(baselineOf({ fontSize: 20 }, lightTheme)).toEqual({
      fontSize: 20,
      lineHeight: 30,
    });
  });
});

describe('inlineViewOffset', () => {
  it('centres a view on the cap height of the text', () => {
    const baseline = { fontSize: 20, lineHeight: 30 };
    // Cap height 14: a 14-high view needs no shift; taller views move down.
    expect(inlineViewOffset(baseline, 14)).toBe(0);
    expect(inlineViewOffset(baseline, 24)).toBe(5);
    expect(inlineViewOffset(baseline, 10)).toBe(-2);
  });
});
