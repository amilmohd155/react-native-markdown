import { resolveTheme } from '../resolve';
import { resetThemeWarnings } from '../warn';

describe('image.fadeDuration', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    resetThemeWarnings();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('defaults to 150', () => {
    expect(resolveTheme({}).tokens.imageSizing.fadeDuration).toBe(150);
  });

  it('takes an override', () => {
    const t = resolveTheme({ image: { fadeDuration: 400 } });
    expect(t.tokens.imageSizing.fadeDuration).toBe(400);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps 0 (fade off)', () => {
    const t = resolveTheme({ image: { fadeDuration: 0 } });
    expect(t.tokens.imageSizing.fadeDuration).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([-1, NaN, Infinity])('warns and uses 150 for %p', (v) => {
    resetThemeWarnings();
    const t = resolveTheme({ image: { fadeDuration: v } });
    expect(t.tokens.imageSizing.fadeDuration).toBe(150);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('image.fadeDuration');
  });
});
