import { createTheme, resolveThemeProp, type FlatThemeInput } from '../index';

describe('createTheme', () => {
  it('is a typed identity: equal in value, a frozen copy', () => {
    const input: FlatThemeInput = {
      link: { color: 'red' },
      codeBlock: { syntax: { keyword: 'k' } },
      list: { bullets: ['-', '*'] },
      dark: { link: { color: 'blue' } },
    };
    const theme = createTheme(input);
    expect(theme).toEqual(input);
    expect(theme).not.toBe(input);
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.link)).toBe(true);
    expect(Object.isFrozen(theme.codeBlock!.syntax)).toBe(true);
    expect(Object.isFrozen(theme.list!.bullets)).toBe(true);
    expect(Object.isFrozen(theme.dark!.link)).toBe(true);
  });

  it('never freezes or mutates the input', () => {
    const input: FlatThemeInput = { link: { color: 'red' } };
    const copy = JSON.parse(JSON.stringify(input));
    createTheme(input);
    expect(input).toEqual(copy);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.link)).toBe(false);
  });

  it('composes with a spread', () => {
    const brand = createTheme({ link: { color: 'red' }, h1: { fontSize: 30 } });
    const next = createTheme({ ...brand, link: { color: 'blue' } });
    expect(next.link).toEqual({ color: 'blue' });
    expect(next.h1).toEqual({ fontSize: 30 });
  });

  it('is a valid theme prop: it merges onto the built-in theme of the scheme', () => {
    const theme = createTheme({ link: { color: 'red' } });
    const light = resolveThemeProp(theme, 'light');
    const dark = resolveThemeProp(theme, 'dark');
    expect(light.elements.Link.text.color).toBe('red');
    expect(dark.elements.Link.text.color).toBe('red');
    expect(light.tokens.colors.text).not.toBe(dark.tokens.colors.text);
  });

  it('takes the flat whitelist, no base argument', () => {
    // @ts-expect-error divider takes no text props
    createTheme({ divider: { color: 'red' } });
    // @ts-expect-error there is no `base`
    createTheme({}, {});
  });
});
