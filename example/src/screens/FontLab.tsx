import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BlockList,
  createRenderCtx,
  defaultComponents,
  parse,
  tableOf,
} from '../v1';

/** v1-rendered paragraphs that isolate the Android underline issue. */
const UNDERLINE_CASES = [
  '1. <u>underline</u> alone.',
  '2. x<sub>2</sub> then <u>underline</u>.',
  '3. y<sup>2</sup> then <u>underline</u>.',
  '4. <u>underline</u> then <mark>highlight</mark>.',
  '5. <u>underline</u> then <kbd>Ctrl</kbd>.',
  '6. `code` then <u>underline</u>.',
  '7. H<sub>2</sub>O and E = mc<sup>2</sup>, <u>underline</u>, <mark>highlight</mark>, press <kbd>Ctrl</kbd>.',
  '8. <u>underline</u> then soft\nbreak.',
  '9. <u>underline</u> then a<br>hard break.',
  '10. <u>underline</u> then <span>raw</span> HTML.',
  '11. <u>underline</u> then **bold**.',
  'H<sub>2</sub>O and E = mc<sup>2</sup>, <u>underline</u>, <mark>highlight</mark>,\npress <kbd>Ctrl</kbd> + <kbd>C</kbd>, a line<br>break, and <span>unknown tags</span> as text.',
].map((source) => tableOf(parse(source)));

const v1Ctx = createRenderCtx({ components: defaultComponents });

/**
 * Font lab: how italic and bold resolve on this device, with the system
 * font and with Inter loaded through expo-font (one family per face, as
 * Expo Go registers them).
 */
const ROWS: { label: string; base: object; inner: object }[] = [
  {
    label: 'System font + fontStyle italic',
    base: {},
    inner: { fontStyle: 'italic' },
  },
  {
    label: 'Inter Regular + fontStyle italic (what the theme does today)',
    base: { fontFamily: 'Inter_400Regular' },
    inner: { fontStyle: 'italic' },
  },
  {
    label: 'Inter Italic face (explicit fontFamily)',
    base: { fontFamily: 'Inter_400Regular' },
    inner: { fontFamily: 'Inter_400Regular_Italic' },
  },
  {
    label: 'Inter Regular + fontWeight 700',
    base: { fontFamily: 'Inter_400Regular' },
    inner: { fontWeight: '700' },
  },
  {
    label: 'Inter Bold face (explicit fontFamily)',
    base: { fontFamily: 'Inter_400Regular' },
    inner: { fontFamily: 'Inter_700Bold' },
  },
  {
    label: 'Inter Bold face + fontStyle italic',
    base: { fontFamily: 'Inter_400Regular' },
    inner: { fontFamily: 'Inter_700Bold', fontStyle: 'italic' },
  },
  {
    label: 'Inter Bold Italic face (explicit fontFamily)',
    base: { fontFamily: 'Inter_400Regular' },
    inner: { fontFamily: 'Inter_700Bold_Italic' },
  },
];

/** Decoration and super/subscript probes, nested like the renderer does. */
const PROBES: { label: string; inner: object; text: string }[] = [
  {
    label: 'Nested underline (theme Underline)',
    inner: { textDecorationLine: 'underline' },
    text: 'underlined',
  },
  {
    label: 'Nested underline + color (like Link)',
    inner: { textDecorationLine: 'underline', color: '#0969da' },
    text: 'underlined',
  },
  {
    label: 'Nested underline + textDecorationColor',
    inner: { textDecorationLine: 'underline', textDecorationColor: '#1f2328' },
    text: 'underlined',
  },
  {
    label: 'Nested underline + fontWeight 400',
    inner: { textDecorationLine: 'underline', fontWeight: '400' },
    text: 'underlined',
  },
  {
    label: 'Nested line-through (theme Strikethrough)',
    inner: { textDecorationLine: 'line-through' },
    text: 'struck',
  },
  {
    label: 'Smaller text, no offset (P1-5 default today)',
    inner: { fontSize: 12 },
    text: '2',
  },
  {
    label: 'Unicode superscript / subscript characters',
    inner: {},
    text: '² ₂ ⁽ⁿ⁺¹⁾ ₍ᵢ₋₁₎',
  },
];

export function FontLab() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.label}>v1 underline cases</Text>
      {UNDERLINE_CASES.map((table, i) => (
        <BlockList key={i} table={table} ctx={v1Ctx} />
      ))}
      {PROBES.map((probe) => (
        <View key={probe.label} style={styles.row}>
          <Text style={styles.label}>{probe.label}</Text>
          <Text style={styles.paragraph}>
            E = mc<Text style={probe.inner}>{probe.text}</Text> and text.
          </Text>
        </View>
      ))}
      {ROWS.map((row) => (
        <View key={row.label} style={styles.row} accessibilityLabel={row.label}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={[styles.sample, row.base]}>
            Upright text, <Text style={row.inner}>styled run</Text>, upright.
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  row: { marginBottom: 16 },
  label: { fontSize: 12, color: '#59636e', marginBottom: 4 },
  sample: { fontSize: 20, color: '#1f2328' },
  // Same as the theme's Paragraph text.
  paragraph: { fontSize: 16, lineHeight: 24, color: '#1f2328' },
});
