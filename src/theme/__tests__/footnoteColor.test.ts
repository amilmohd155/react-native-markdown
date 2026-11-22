import { StyleSheet } from 'react-native';
import { clearThemeCache, resolveThemeProp } from '../index';

beforeEach(() => clearThemeCache());

const flat = (s: unknown) =>
  StyleSheet.flatten(s as never) as { color?: string };

describe('footnoteDefinition.color', () => {
  it('colours the section text and the definition entry', () => {
    const t = resolveThemeProp(
      { footnoteDefinition: { color: '#a00' } },
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
