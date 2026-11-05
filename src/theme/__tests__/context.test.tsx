import { createElement, useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { renderTree } from '../../__tests__/tree';
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
async function mountProbe(theme?: ThemeProp, components = hostComponents()) {
  const seen: ResolvedTheme[] = [];
  const element = (t = theme) => (
    <Probe theme={t} components={components} onTheme={(r) => seen.push(r)} />
  );
  const root = await renderTree(element());
  return {
    seen,
    root,
    rerender: (t?: ThemeProp) => root.rerender(element(t ?? theme)),
    async setScheme(scheme: 'light' | 'dark') {
      schemeMock.mockReturnValue(scheme);
      await root.rerender(element());
    },
  };
}

describe('useResolvedTheme', () => {
  it("defaults to 'auto' and follows the color scheme", async () => {
    const { seen, setScheme } = await mountProbe();
    expect(seen.at(-1)).toBe(resolveThemeProp('light', 'light'));
    expect(seen.at(-1)!.tokens.colors).toEqual(lightTheme.colors);

    await setScheme('dark');
    expect(seen.at(-1)).toBe(resolveThemeProp('dark', 'light'));
    expect(seen.at(-1)!.tokens.colors).toEqual(darkTheme.colors);

    await setScheme('light');
    expect(seen.at(-1)).toBe(resolveThemeProp('light', 'dark'));
  });

  it("'light' and 'dark' ignore the color scheme", async () => {
    schemeMock.mockReturnValue('dark');
    expect((await mountProbe('light')).seen.at(-1)!.tokens.colors).toEqual(
      lightTheme.colors
    );
    schemeMock.mockReturnValue('light');
    expect((await mountProbe('dark')).seen.at(-1)!.tokens.colors).toEqual(
      darkTheme.colors
    );
  });

  it('treats an unknown scheme (null) as light', async () => {
    schemeMock.mockReturnValue(null);
    expect((await mountProbe()).seen.at(-1)).toBe(
      resolveThemeProp('light', 'light')
    );
  });

  it('merges a theme input onto the base of the current scheme', async () => {
    const { seen, setScheme } = await mountProbe({ colors: { link: 'red' } });
    expect(seen.at(-1)!.tokens.colors.text).toBe(lightTheme.colors.text);
    await setScheme('dark');
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

  it('re-renders every block once when the scheme changes', async () => {
    const { renders, components } = counted();
    const { setScheme } = await mountProbe(undefined, components);
    expect(renders).toEqual({ Paragraph: 1, Heading: 1 });
    await setScheme('dark');
    expect(renders).toEqual({ Paragraph: 2, Heading: 2 });
    await setScheme('light');
    expect(renders).toEqual({ Paragraph: 3, Heading: 3 });
  });

  it('does not re-render blocks for an equal inline theme object', async () => {
    const { renders, components } = counted();
    const { rerender } = await mountProbe(
      { colors: { link: 'red' } },
      components
    );
    expect(renders).toEqual({ Paragraph: 1, Heading: 1 });

    // A new object literal with equal values: cache hit, same ctx, no work.
    await rerender({ colors: { link: 'red' } });
    expect(renders).toEqual({ Paragraph: 1, Heading: 1 });

    // A real change re-renders.
    await rerender({ colors: { link: 'blue' } });
    expect(renders).toEqual({ Paragraph: 2, Heading: 2 });
  });

  it('does not re-render blocks when a fixed theme sees the scheme change', async () => {
    const { renders, components } = counted();
    const { setScheme } = await mountProbe('light', components);
    await setScheme('dark');
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

  it('gives custom components the tokens and resolved styles', async () => {
    const { seen, components } = capture();
    const theme = resolveThemeProp('light', 'light');
    const ctx = createRenderCtx({ components, theme });
    await renderTree(<BlockList table={TABLE} ctx={ctx} />);
    const got = seen.at(-1)!;
    expect(got.tokens).toBe(theme.tokens);
    expect(got.styles).toBe(theme.elements);
    expect(got.headings).toBe(theme.headings);
    expect(got.styles.Link.text.color).toBe(lightTheme.colors.link);
    expect(got.headings[0]!.text.fontSize).toBe(40);
  });

  it('keeps the same reference until the theme changes', async () => {
    const { seen, components } = capture();
    const light = createRenderCtx({
      components,
      theme: resolveThemeProp('light', 'light'),
    });
    const root = await renderTree(<BlockList table={TABLE} ctx={light} />);
    const first = seen.at(-1)!;

    // New ctx, same theme (e.g. an option changed): same hook result.
    const sameTheme = createRenderCtx({
      components,
      theme: light.theme,
      softBreak: 'newline',
    });
    await root.rerender(<BlockList table={TABLE} ctx={sameTheme} />);
    expect(seen.at(-1)).toBe(first);

    const dark = createRenderCtx({
      components,
      theme: resolveThemeProp('dark', 'light'),
    });
    await root.rerender(<BlockList table={TABLE} ctx={dark} />);
    expect(seen.at(-1)).not.toBe(first);
    expect(seen.at(-1)!.tokens.colors).toEqual(darkTheme.colors);
  });

  it('throws outside <Markdown>', async () => {
    function Bare() {
      useMarkdownTheme();
      return null;
    }
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderTree(<Bare />)).rejects.toThrow(
      /useMarkdownTheme\(\) must be called/
    );
    error.mockRestore();
  });
});
