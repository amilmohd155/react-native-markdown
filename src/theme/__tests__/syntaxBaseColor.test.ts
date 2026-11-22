import { clearThemeCache, resolveThemeProp } from '../index';

beforeEach(() => clearThemeCache());

describe('syntax base colour (P3a-4)', () => {
  it('operator, punctuation, variable, embedded and plain follow codeBlock.color', () => {
    const { syntax } = resolveThemeProp(
      {
        codeBlock: {
          backgroundColor: '#112233',
          color: '#bde',
          syntax: { keyword: '#f00' },
        },
      },
      'light'
    ).tokens;
    expect(syntax.keyword).toBe('#f00');
    for (const type of [
      'operator',
      'punctuation',
      'variable',
      'embedded',
      'plain',
    ] as const) {
      expect(syntax[type]).toBe('#bde');
    }
    expect(syntax.string).toBe('#0a3069');
  });

  it('an explicit syntax entry wins over codeBlock.color', () => {
    const { syntax } = resolveThemeProp(
      { codeBlock: { color: '#bde', syntax: { operator: '#123456' } } },
      'dark'
    ).tokens;
    expect(syntax.operator).toBe('#123456');
    expect(syntax.punctuation).toBe('#bde');
  });

  it('built-ins keep their constants when codeBlock.color is unset', () => {
    const light = resolveThemeProp({}, 'light').tokens.syntax;
    const dark = resolveThemeProp({}, 'dark').tokens.syntax;
    expect(light.operator).toBe('#1f2328');
    expect(dark.embedded).toBe('#e6edf3');
  });

  it('a paragraph colour does not change them', () => {
    const { syntax } = resolveThemeProp(
      { paragraph: { color: '#000000' } },
      'light'
    ).tokens;
    expect(syntax.operator).toBe('#1f2328');
  });
});
