import { StyleSheet } from 'react-native';
import { clearThemeCache, resolveThemeProp } from '../index';

beforeEach(() => clearThemeCache());

const flat = (s: unknown) =>
  StyleSheet.flatten(s as never) as { color?: string };

describe('footnote.definition.color', () => {
  it('colours the section text and the definition entry', () => {
    const t = resolveThemeProp(
      { footnote: { definition: { color: '#a00' } } },
      'light'
    );
    expect(flat(t.footnoteSection.text).color).toBe('#a00');
    expect(flat(t.elements.FootnoteDefinition.text).color).toBe('#a00');
  });

  it('defaults to the muted colour', () => {
    const t = resolveThemeProp({}, 'light');
    expect(flat(t.footnoteSection.text).color).toBe(t.tokens.colors.muted);
  });
});
