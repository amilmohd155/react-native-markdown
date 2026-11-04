import { StyleSheet, Text, View } from 'react-native';
import { inlineView, inlineViewOffset } from '../v1';

/**
 * Example declared inline views (D8): Views laid out as inline attachments
 * inside a paragraph's <Text>, aligned with the `baseline` metrics.
 */

/** Links as pill-shaped chips, centred on the text. */
export const LinkChip = inlineView<'Link'>(({ children, baseline }) => {
  const height = Math.round(baseline.fontSize * 1.4);
  return (
    <View
      style={[
        styles.chip,
        {
          height,
          borderRadius: height / 2,
          transform: [{ translateY: inlineViewOffset(baseline, height) }],
        },
      ]}
    >
      <Text style={[styles.chipText, { fontSize: baseline.fontSize * 0.85 }]}>
        {children}
      </Text>
    </View>
  );
});

/** True superscript: smaller text raised above the baseline (P1-5 option). */
export const RaisedSuperscript = inlineView<'Superscript'>(
  ({ children, baseline }) => (
    <View style={{ transform: [{ translateY: -baseline.fontSize * 0.4 }] }}>
      <Text style={{ fontSize: baseline.fontSize * 0.7 }}>{children}</Text>
    </View>
  )
);

/** True subscript: smaller text lowered below the baseline. */
export const LoweredSubscript = inlineView<'Subscript'>(
  ({ children, baseline }) => (
    <View style={{ transform: [{ translateY: baseline.fontSize * 0.2 }] }}>
      <Text style={{ fontSize: baseline.fontSize * 0.7 }}>{children}</Text>
    </View>
  )
);

const styles = StyleSheet.create({
  chip: {
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#ddf4ff',
  },
  chipText: { color: '#0969da', fontWeight: '600' },
});
