import {
  clearThemeCache,
  resolveThemeProp,
  type FlatThemeInput,
} from '../index';

beforeEach(() => clearThemeCache());

// One flat input with a prop from each M4 chunk and a dark block.
const make = (): FlatThemeInput => ({
  list: { bulletColor: '#ff0000', itemSpacing: 4 },
  table: { rowEvenBackgroundColor: '#eeeeee', headerColor: '#111111' },
  image: { maxHeight: 200 },
  checkbox: { checkmarkColor: '#abcdef', size: 20 },
  link: { color: '#0000ff', variants: { '^mailto:': { color: '#00aa00' } } },
  blockquote: { admonitions: { note: { color: '#123456' } } },
  dark: {
    list: { bulletColor: '#00ff00' },
    table: { rowEvenBackgroundColor: '#222222' },
    link: { variants: { '^mailto:': { color: '#55ff55' } } },
    blockquote: { admonitions: { note: { color: '#654321' } } },
  },
});

describe('M4 chunks combined', () => {
  it('resolves every chunk from one flat input (light)', () => {
    const t = resolveThemeProp(make(), 'light');
    expect(t.tokens.list.bulletStyle.color).toBe('#ff0000');
    expect(t.tokens.list.itemSpacing).toBe(4);
    expect(t.tableRowEven.container.backgroundColor).toBe('#eeeeee');
    expect(t.tokens.imageSizing).toMatchObject({
      mode: 'maxHeight',
      maxHeight: 200,
    });
    expect(t.tokens.checkbox).toMatchObject({
      checkmarkColor: '#abcdef',
      size: 20,
    });
    expect(t.linkVariants).toHaveLength(1);
    expect(t.linkVariants[0]!.test.test('mailto:a@b.c')).toBe(true);
    expect(t.linkVariants[0]!.style.text.color).toBe('#00aa00');
    expect(t.admonitions.note.accent).toBe('#123456');
    expect(t.admonitions.note.container.borderLeftColor).toBe('#123456');
  });

  it('warns about none of the props in dev', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resolveThemeProp(make(), 'light');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('applies the dark block over the shared props', () => {
    const t = resolveThemeProp(make(), 'dark');
    expect(t.tokens.list.bulletStyle.color).toBe('#00ff00');
    expect(t.tableRowEven.container.backgroundColor).toBe('#222222');
    expect(t.linkVariants[0]!.style.text.color).toBe('#55ff55');
    expect(t.admonitions.note.accent).toBe('#654321');
    // not overridden in dark: still the shared values
    expect(t.tokens.imageSizing.maxHeight).toBe(200);
    expect(t.tokens.checkbox.checkmarkColor).toBe('#abcdef');
    expect(t.tokens.list.itemSpacing).toBe(4);
  });

  it('returns the same object for an equal inline literal', () => {
    const first = resolveThemeProp(make(), 'light');
    expect(resolveThemeProp(make(), 'light')).toBe(first);
    const dark = resolveThemeProp(make(), 'dark');
    expect(dark).not.toBe(first);
    expect(resolveThemeProp(make(), 'dark')).toBe(dark);
  });
});
