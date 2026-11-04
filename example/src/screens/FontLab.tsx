import { ScrollView, StyleSheet, Text, View } from 'react-native';

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

export function FontLab() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
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
});
