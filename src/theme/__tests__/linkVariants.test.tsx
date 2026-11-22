import { StyleSheet } from 'react-native';
import { clearThemeCache, resolveThemeProp } from '../cache';
import { linkStyleFor } from '../linkVariants';
import { resolveTheme } from '../resolve';
import { resetThemeWarnings } from '../warn';

const g = globalThis as { __DEV__?: unknown };
const original = g.__DEV__;
let warn: jest.SpyInstance;

beforeEach(() => {
  g.__DEV__ = true;
  clearThemeCache();
  resetThemeWarnings();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  g.__DEV__ = original;
  warn.mockRestore();
});

const text = (theme: ReturnType<typeof resolveTheme>, href: string) =>
  StyleSheet.flatten(linkStyleFor(theme, href).text) ?? {};

describe('link.variants', () => {
  const theme = resolveTheme({
    link: {
      color: '#2563EB',
      variants: {
        '^user:': { color: '#111111', textDecorationLine: 'none' },
        '^user:admin': { color: '#222222' },
        '^channel:': { backgroundColor: '#D1FAE5' },
      },
    },
  });

  it('uses plain link without a match', () => {
    expect(linkStyleFor(theme, 'https://x.com')).toBe(theme.elements.Link);
  });

  it('first match in object order wins', () => {
    expect(text(theme, 'user:admin1').color).toBe('#111111');
  });

  it('merges over link', () => {
    const style = text(theme, 'channel:dev');
    expect(style.backgroundColor).toBe('#D1FAE5');
    expect(style.color).toBe('#2563EB');
    expect(style.textDecorationLine).toBe('underline');
  });

  it('tests the href as written, scheme or not', () => {
    const t = resolveTheme({
      link: { variants: { '^/docs': { color: 'red' } } },
    });
    expect(text(t, '/docs/a').color).toBe('red');
    expect(text(t, 'https://x.com/docs').color).not.toBe('red');
  });

  it('is stateless across calls', () => {
    expect(text(theme, 'user:a').color).toBe('#111111');
    expect(text(theme, 'user:a').color).toBe('#111111');
  });

  it('a dark block overrides a variant, per pattern', () => {
    const t = resolveTheme(
      {
        link: { variants: { '^user:': { color: '#111111' } } },
        dark: { link: { variants: { '^user:': { color: '#EEEEEE' } } } },
      },
      'dark'
    );
    expect(text(t, 'user:a').color).toBe('#EEEEEE');
    const light = resolveTheme(
      { link: { variants: { '^user:': { color: '#111111' } } } },
      'light'
    );
    expect(text(light, 'user:a').color).toBe('#111111');
  });

  it('a dark block adds patterns after the base ones', () => {
    const t = resolveTheme(
      {
        link: { variants: { '^a:': { color: 'red' } } },
        dark: { link: { variants: { '^b:': { color: 'blue' } } } },
      },
      'dark'
    );
    expect(text(t, 'a:x').color).toBe('red');
    expect(text(t, 'b:x').color).toBe('blue');
  });

  it('skips an invalid regex and warns once in development', () => {
    const input = {
      link: { variants: { '(': { color: 'red' }, '^ok:': { color: 'blue' } } },
    };
    const t = resolveTheme(input);
    resolveTheme(input);
    expect(t.linkVariants).toHaveLength(1);
    expect(text(t, 'ok:1').color).toBe('blue');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"(" in link.variants');
  });

  it('skips an invalid regex silently outside development', () => {
    g.__DEV__ = false;
    const t = resolveTheme({ link: { variants: { '(': { color: 'red' } } } });
    expect(t.linkVariants).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('compiles once per resolve: a cache hit keeps the same RegExp', () => {
    const input = { link: { variants: { '^user:': { color: 'red' } } } };
    const a = resolveThemeProp(input, 'light');
    const b = resolveThemeProp(
      { link: { variants: { '^user:': { color: 'red' } } } },
      'light'
    );
    expect(b).toBe(a);
    expect(b.linkVariants[0]!.test).toBe(a.linkVariants[0]!.test);
  });

  it('a different variant misses the cache', () => {
    const a = resolveThemeProp(
      { link: { variants: { '^user:': { color: 'red' } } } },
      'light'
    );
    const b = resolveThemeProp(
      { link: { variants: { '^user:': { color: 'blue' } } } },
      'light'
    );
    expect(b).not.toBe(a);
  });

  it('is empty without variants', () => {
    expect(resolveTheme().linkVariants).toEqual([]);
  });
});
