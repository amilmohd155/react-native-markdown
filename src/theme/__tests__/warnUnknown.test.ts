import { resolveThemeProp, clearThemeCache } from '../cache';
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

// Plain JS callers and casts can pass props the types would reject.
const bad = (theme: object) => theme as never;

describe('unknown theme props (dev only)', () => {
  it('warns once per distinct key.prop', () => {
    resolveTheme(bad({ paragraph: { colour: 'red' }, h1: { padding: 3 } }));
    resolveTheme(bad({ paragraph: { colour: 'blue' } }));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toContain(
      '"colour" is not a prop of "paragraph"'
    );
    expect(warn.mock.calls[1]![0]).toContain('"padding" is not a prop of "h1"');
  });

  it('checks the dark and light blocks and syntax names', () => {
    resolveTheme(
      bad({
        dark: { link: { underline: true } },
        light: { codeBlock: { syntax: { nope: '#000' } } },
      })
    );
    const messages = warn.mock.calls.map((c) => c[0] as string);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('"underline" is not a prop of "link"');
    expect(messages[1]).toContain('"nope" is not a syntax token type');
  });

  it('accepts every whitelisted prop and leaves plugin keys alone', () => {
    resolveTheme({
      paragraph: { color: 'red', marginTop: 1 },
      blockquote: { borderLeftColor: 'red', admonitions: {} },
      list: { bullets: ['-'], itemSpacing: 2 },
      link: { variants: {} },
      codeBlock: { syntax: { variable: '#000', embedded: '#000' } },
      checkbox: { checkedText: false },
      mention: { color: 'red' },
    } as never);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does nothing outside __DEV__', () => {
    g.__DEV__ = false;
    resolveTheme(bad({ paragraph: { colour: 'red' } }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on a cache miss only, not on a hit', () => {
    const input = bad({ paragraph: { colour: 'red' } });
    resolveThemeProp(input, 'light');
    expect(warn).toHaveBeenCalledTimes(1);
    resetThemeWarnings();
    resolveThemeProp(bad({ paragraph: { colour: 'red' } }), 'light');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
