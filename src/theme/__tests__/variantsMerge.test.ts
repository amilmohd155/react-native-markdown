import { StyleSheet } from 'react-native';
import { clearThemeCache, resolveThemeProp } from '../cache';
import { linkStyleFor } from '../linkVariants';
import { resolveTheme } from '../resolve';
import type { FlatThemeInput } from '../flatTypes';

const flat = (t: ReturnType<typeof resolveTheme>, href: string) =>
  StyleSheet.flatten(linkStyleFor(t, href).text) ?? {};

const input: FlatThemeInput = {
  link: {
    variants: {
      '^user:': { color: 'blue', textDecorationLine: 'none' },
      '^chan:': { color: 'green' },
    },
  },
  dark: {
    link: {
      variants: {
        '^user:': { color: 'lightblue', backgroundColor: 'navy' },
        '^new:': { color: 'pink' },
      },
    },
  },
};

describe('link.variants merge per pattern', () => {
  it('dark overrides one prop of a top-level variant and keeps the rest', () => {
    const t = resolveTheme(input, 'dark');
    expect(flat(t, 'user:1')).toMatchObject({
      color: 'lightblue',
      backgroundColor: 'navy',
      textDecorationLine: 'none',
    });
    const light = resolveTheme(input, 'light');
    expect(flat(light, 'user:1').color).toBe('blue');
  });

  it('appends new patterns after the base ones, same key keeps its place', () => {
    const t = resolveTheme(input, 'dark');
    expect(t.linkVariants.map((v) => v.test.source)).toEqual([
      '^user:',
      '^chan:',
      '^new:',
    ]);
  });

  it('first match still wins by merged order', () => {
    const t = resolveTheme(
      {
        link: { variants: { '^a': { color: 'one' }, '^ab': { color: 'two' } } },
        dark: { link: { variants: { '^ab': { color: 'three' } } } },
      },
      'dark'
    );
    expect(flat(t, 'abc').color).toBe('one');
    expect(flat(t, 'xab').color).not.toBe('three');
  });

  it('merges plugin defaults under the user', () => {
    const t = resolveTheme(
      { link: { variants: { '^p:': { color: 'user' } } } },
      'light',
      [{ link: { variants: { '^p:': { textDecorationLine: 'none' } } } }]
    );
    expect(flat(t, 'p:1')).toMatchObject({
      color: 'user',
      textDecorationLine: 'none',
    });
  });
});

describe('cache compares variants per pattern, per prop', () => {
  beforeEach(() => clearThemeCache());
  const make = (c: string): FlatThemeInput => ({
    dark: { link: { variants: { '^u:': { color: c, fontWeight: '700' } } } },
  });
  it('hits for equal literals, misses for a changed nested prop', () => {
    const a = resolveThemeProp(make('x'), 'dark');
    expect(resolveThemeProp(make('x'), 'dark')).toBe(a);
    expect(resolveThemeProp(make('y'), 'dark')).not.toBe(a);
  });
});
