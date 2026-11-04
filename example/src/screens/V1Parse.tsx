import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { parse } from '../v1';
import { mdxString } from '../example';

/**
 * Smoke screen for the v1 wiring: parses the demo source with v1 and shows
 * the result. Replaced by the Gallery screen once the renderer lands (M3).
 */
export function V1Parse() {
  const result = useMemo(() => {
    const start = performance.now();
    const doc = parse(mdxString);
    return { blockCount: doc.blockCount, ms: performance.now() - start };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.line}>v1 parse() OK</Text>
      <Text style={styles.line}>Blocks: {result.blockCount}</Text>
      <Text style={styles.line}>
        Parse: {result.ms.toFixed(2)} ms ({__DEV__ ? 'dev' : 'release'} build)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  line: { fontSize: 16, marginBottom: 8 },
});
