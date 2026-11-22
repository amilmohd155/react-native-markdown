import { clearThemeCache } from '../cache';
import { resolveTheme } from '../resolve';
import { resetThemeWarnings } from '../warn';
import type { FlatThemeInput } from '../flatTypes';

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

const note = (color: string, backgroundColor?: string): FlatThemeInput => ({
  blockquote: { admonitions: { note: { color, backgroundColor } } },
});
const bg = (input: FlatThemeInput) =>
  resolveTheme(input).admonitions.note.container.backgroundColor;

describe('admonition tint', () => {
  it('derives a tint from a hex color, without a warning', () => {
    expect(bg(note('#123456'))).toBe('#1234561a');
    expect(bg(note('#abc'))).toBe('#aabbcc1a');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['red', 'rgb(1, 2, 3)', 'hsl(10, 50%, 50%)'])(
    'derives no tint from %s and warns once',
    (color) => {
      expect(bg(note(color))).toBeUndefined();
      resolveTheme(note(color));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain(
        'admonitions.note.color is not a hex color; set backgroundColor, no tint is derived'
      );
    }
  );

  it('keeps an explicit backgroundColor and still warns for a non-hex color', () => {
    expect(bg(note('red', '#fee'))).toBe('#fee');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns per distinct color and checks the dark block', () => {
    resolveTheme(note('red'));
    resolveTheme(note('blue'));
    resolveTheme({
      dark: { blockquote: { admonitions: { tip: { color: 'green' } } } },
    });
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('is silent outside dev', () => {
    g.__DEV__ = false;
    resolveTheme(note('red'));
    expect(warn).not.toHaveBeenCalled();
  });
});
