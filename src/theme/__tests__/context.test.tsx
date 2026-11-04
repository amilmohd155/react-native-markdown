import { createElement, useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { act, create } from 'react-test-renderer';
import { BlockList } from '../../render/Block';
import { createRenderCtx, useRenderCtx } from '../../render/context';
import type { Components } from '../../render/elements';
import { hostComponents, tableFor } from '../../render/__tests__/helpers';
import {
  clearThemeCache,
  darkTheme,
  lightTheme,
  resolveThemeProp,
  useMarkdownTheme,
  useResolvedTheme,
  type MarkdownTheme,
  type ResolvedTheme,
  type ThemeProp,
} from '../index';

// React Native's jest setup replaces `useColorScheme` with a `jest.fn`.
const schemeMock = useColorScheme as unknown as jest.Mock;

beforeEach(() => {
  clearThemeCache();
  schemeMock.mockReturnValue('light');
});

afterAll(() => {
  schemeMock.mockReturnValue('light');
});

const TABLE = tableFor('Some *text*.\n\n# Title\n');

/** Renders `theme` through the real chain: hook → render ctx → BlockList. */
function Probe({
  theme,
  components,
  onTheme,
}: {
  theme?: ThemeProp;
  components: Components;
  onTheme?: (t: ResolvedTheme) => void;
}) {
  const resolved = useResolvedTheme(theme);
  useEffect(() => {
    onTheme?.(resolved);
  });
  const ctx = useRenderCtx({ theme: resolved, components });
  return <BlockList table={TABLE} ctx={ctx} />;
}

/** Mounts a `Probe`; `setScheme` flips the device scheme and re-renders. */
function mountProbe(theme?: ThemeProp, components = hostComponents()) {
  const seen: ResolvedTheme[] = [];
  const element = (t = theme) => (
    <Probe theme={t} components={components} onTheme={(r) => seen.push(r)} />
  );
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(element());
  });
  return {
    seen,
    root,
    rerender: (t?: ThemeProp) => act(() => root.update(element(t ?? theme))),
    setScheme(scheme: 'light' | 'dark') {
      schemeMock.mockReturnValue(scheme);
      act(() => root.update(element()));
    },
  };
}

describe('useResolvedTheme', () => {
  it("defaults to 'auto' and follows the color scheme", () => {
    const { seen, setScheme } = mountProbe();
    expect(seen.at(-1)).toBe(resolveThemeProp('light', 'light'));
    expect(seen.at(-1)!.tokens.colors).toEqual(lightTheme.colors);

    setScheme('dark');
    expect(seen.at(-1)).toBe(resolveThemeProp('dark', 'light'));
    expect(seen.at(-1)!.tokens.colors).toEqual(darkTheme.colors);

    setScheme('light');
    expect(seen.at(-1)).toBe(resolveThemeProp('light', 'dark'));
  });

  it("'light' and 'dark' ignore the color scheme", () => {
    schemeMock.mockReturnValue('dark');
    expect(mountProbe('light').seen.at(-1)!.tokens.colors).toEqual(
      lightTheme.colors
    );
    schemeMock.mockReturnValue('light');
    expect(mountProbe('dark').seen.at(-1)!.tokens.colors).toEqual(
      darkTheme.colors
    );
  });

  it('treats an unknown scheme (null) as light', () => {
    schemeMock.mockReturnValue(null);
    expect(mountProbe().seen.at(-1)).toBe(resolveThemeProp('light', 'light'));
  });

  it('merges a theme input onto the base of the current scheme', () => {
    const { seen, setScheme } = mountProbe({ colors: { link: 'red' } });
    expect(seen.at(-1)!.tokens.colors.text).toBe(lightTheme.colors.text);
    setScheme('dark');
    const dark = seen.at(-1)!;
    expect(dark.tokens.colors.text).toBe(darkTheme.colors.text);
    expect(dark.tokens.colors.link).toBe('red');
    expect(dark.elements.Link.text.color).toBe('red');
  });
});

describe('dark mode re-renders', () => {
  /** A Paragraph and Heading that count renders. */
  function counted() {
    const renders = { Paragraph: 0, Heading: 0 };
    const count =
      (name: 'Paragraph' | 'Heading') =>
      ({ children }: { children?: ReactNode }) => {
        renders[name]++;
        return createElement(name, null, children);
      };
    return {
      renders,
      components: hostComponents({
        Paragraph: count('Paragraph'),
        Heading: count('Heading'),
      } as never),
    };
  }

  it('re-renders every block once when the scheme changes', () => {
    const { renders, components } = counted();
    const { setScheme } = mountProbe(undefined, components);
    expect(renders).toEqual({ Paragraph: 1, Heading: 1 });
    setScheme('dark');
    expect(renders).toEqual({ Paragraph: 2, Heading: 2 });
    setScheme('light');
    expect(renders).toEqual({ Paragraph: 3, Heading: 3 });
  });

  it('does not re-render blocks for an equal inline theme object', () => {
    const { renders, components } = counted();
    const { rerender } = mountProbe({ colors: { link: 'red' } }, components);
    expect(renders).toEqual({ Paragraph: 1, Heading: 1 });

    // A new object literal with equal values: cache hit, same ctx, no work.
    rerender({ colors: { link: 'red' } });
    expect(renders).toEqual({ Paragraph: 1, Heading: 1 });

    // A real change re-renders.
    rerender({ colors: { link: 'blue' } });
    expect(renders).toEqual({ Paragraph: 2, Heading: 2 });
  });

  it('does not re-render blocks when a fixed theme sees the scheme change', () => {
    const { renders, components } = counted();
    const { setScheme } = mountProbe('light', components);
    setScheme('dark');
    expect(renders).toEqual({ Paragraph: 1, Heading: 1 });
  });
});

describe('useMarkdownTheme', () => {
  function capture() {
    const seen: MarkdownTheme[] = [];
    function Paragraph({ children }: { children?: ReactNode }) {
      seen.push(useMarkdownTheme());
      return createElement('Paragraph', null, children);
    }
    return {
      seen,
      components: hostComponents({ Paragraph } as never),
    };
  }

  it('gives custom components the tokens and resolved styles', () => {
    const { seen, components } = capture();
    const theme = resolveThemeProp('light', 'light');
    const ctx = createRenderCtx({ components, theme });
    act(() => {
      create(<BlockList table={TABLE} ctx={ctx} />);
    });
    const got = seen.at(-1)!;
    expect(got.tokens).toBe(theme.tokens);
    expect(got.styles).toBe(theme.elements);
    expect(got.headings).toBe(theme.headings);
    expect(got.styles.Link.text.color).toBe(lightTheme.colors.link);
    expect(got.headings[0]!.text.fontSize).toBe(40);
  });

  it('keeps the same reference until the theme changes', () => {
    const { seen, components } = capture();
    const light = createRenderCtx({
      components,
      theme: resolveThemeProp('light', 'light'),
    });
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<BlockList table={TABLE} ctx={light} />);
    });
    const first = seen.at(-1)!;

    // New ctx, same theme (e.g. an option changed): same hook result.
    const sameTheme = createRenderCtx({
      components,
      theme: light.theme,
      softBreak: 'newline',
    });
    act(() => root.update(<BlockList table={TABLE} ctx={sameTheme} />));
    expect(seen.at(-1)).toBe(first);

    const dark = createRenderCtx({
      components,
      theme: resolveThemeProp('dark', 'light'),
    });
    act(() => root.update(<BlockList table={TABLE} ctx={dark} />));
    expect(seen.at(-1)).not.toBe(first);
    expect(seen.at(-1)!.tokens.colors).toEqual(darkTheme.colors);
  });

  it('throws outside <Markdown>', () => {
    function Bare() {
      useMarkdownTheme();
      return null;
    }
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      act(() => {
        create(<Bare />);
      })
    ).toThrow(/useMarkdownTheme\(\) must be called/);
    error.mockRestore();
  });
});
