import {
  createTheme,
  darkTheme,
  lightTheme,
  mergeElements,
  type ElementOverride,
  type HeadingLevel,
  type ThemeInput,
} from '../index';

describe('createTheme', () => {
  it('merges onto the light theme by default', () => {
    const theme = createTheme({ colors: { link: 'red' } });
    expect(theme.colors).toEqual({ ...lightTheme.colors, link: 'red' });
    expect(theme.fontSize).toBe(lightTheme.fontSize);
    expect(theme.spacing).toBe(lightTheme.spacing);
    expect(theme.listBullets).toBe(lightTheme.listBullets);
    expect(theme.elements).toEqual({});
  });

  it('merges token groups key by key and replaces scalars and listBullets', () => {
    const theme = createTheme({
      colors: { text: '#000' },
      fontSize: { base: 18 },
      lineHeight: 1.4,
      spacing: { block: 8 },
      radius: { code: 2 },
      listBullets: ['-', '*'],
    });
    expect(theme.colors).toEqual({ ...lightTheme.colors, text: '#000' });
    expect(theme.fontSize).toEqual({ base: 18, scale: 1.2 });
    expect(theme.lineHeight).toBe(1.4);
    expect(theme.spacing).toEqual({ block: 8, listIndent: 20 });
    expect(theme.radius).toEqual({ code: 2 });
    expect(theme.listBullets).toEqual(['-', '*']);
  });

  it('builds on any base: a built-in theme or another created theme', () => {
    const dark = createTheme({ fontSize: { base: 15 } }, darkTheme);
    expect(dark.colors).toBe(darkTheme.colors);
    expect(dark.fontSize.base).toBe(15);

    const first = createTheme({
      colors: { link: 'red' },
      elements: { Link: { text: { fontWeight: '700' } } },
    });
    const second = createTheme(
      {
        colors: { muted: 'gray' },
        elements: { Link: { text: { textDecorationLine: 'none' } } },
      },
      first
    );
    expect(second.colors.link).toBe('red');
    expect(second.colors.muted).toBe('gray');
    expect(second.elements.Link).toEqual({
      text: { fontWeight: '700', textDecorationLine: 'none' },
    });
  });

  it('skips undefined token values, except fonts (undefined = system font)', () => {
    const base = createTheme({ fonts: { body: 'Inter' } });
    const theme = createTheme(
      { colors: { link: undefined }, fonts: { body: undefined } },
      base
    );
    expect(theme.colors.link).toBe(lightTheme.colors.link);
    expect(theme.fonts.body).toBeUndefined();
    expect(theme.fonts.mono).toBe(lightTheme.fonts.mono);
  });

  it('does not mutate the base or the input', () => {
    const input: ThemeInput = {
      colors: { link: 'red' },
      elements: { Link: { text: { color: 'red' } } },
    };
    const copy = JSON.parse(JSON.stringify(input));
    createTheme(input, darkTheme);
    expect(input).toEqual(copy);
    expect(darkTheme.colors.link).not.toBe('red');
  });

  it('returns a frozen theme that is also a valid ThemeInput', () => {
    const theme = createTheme({ colors: { link: 'red' } });
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.colors)).toBe(true);
    expect(Object.isFrozen(theme.elements)).toBe(true);
    const asInput: ThemeInput = theme;
    expect(createTheme(asInput).colors).toEqual(theme.colors);
  });
});

describe('element overrides', () => {
  it('merge per element, text and container separately, input winning', () => {
    const base = createTheme({
      elements: {
        CodeBlock: {
          text: { fontSize: 12 },
          container: { padding: 8, borderRadius: 2 },
        },
        Link: { text: { color: 'red' } },
      },
    });
    const theme = createTheme(
      {
        elements: {
          CodeBlock: { container: { padding: 16 } },
          Paragraph: { text: { color: 'blue' } },
        },
      },
      base
    );
    expect(theme.elements.CodeBlock).toEqual({
      text: { fontSize: 12 },
      container: { padding: 16, borderRadius: 2 },
    });
    expect(theme.elements.Link).toEqual({ text: { color: 'red' } });
    expect(theme.elements.Paragraph).toEqual({ text: { color: 'blue' } });
  });

  it('keeps a function Heading override and calls it per level', () => {
    const fn = jest.fn(
      (level: HeadingLevel): ElementOverride => ({
        text: { fontWeight: level <= 2 ? '700' : '600' },
      })
    );
    const theme = createTheme({ elements: { Heading: fn } });
    expect(theme.elements.Heading).toBe(fn);
  });

  it('composes Heading overrides when either side is a function', () => {
    const fromFn = createTheme({
      elements: {
        Heading: (level) => ({ text: { letterSpacing: level } }),
      },
    });
    // object over function: object wins on shared keys, function fills in.
    const objOverFn = createTheme(
      {
        elements: {
          Heading: { text: { letterSpacing: 9 }, container: { margin: 1 } },
        },
      },
      fromFn
    );
    const h = objOverFn.elements.Heading;
    expect(typeof h).toBe('function');
    if (typeof h !== 'function') return;
    expect(h(1)).toEqual({
      text: { letterSpacing: 9 },
      container: { margin: 1 },
    });

    // function over object: the function result wins per level.
    const fnOverObj = mergeElements(
      { Heading: { text: { color: 'red', letterSpacing: 0 } } },
      { Heading: (level) => ({ text: { letterSpacing: level } }) }
    );
    const g = fnOverObj.Heading;
    expect(typeof g).toBe('function');
    if (typeof g !== 'function') return;
    expect(g(3)).toEqual({ text: { color: 'red', letterSpacing: 3 } });
  });

  it('mergeElements ignores undefined entries and reuses a side when the other is missing', () => {
    const a = { Link: { text: { color: 'red' } } };
    expect(mergeElements(a, undefined)).toBe(a);
    expect(mergeElements(undefined, a)).toBe(a);
    expect(mergeElements(undefined, undefined)).toEqual({});
    expect(mergeElements(a, { Link: undefined })).toEqual(a);
  });
});
