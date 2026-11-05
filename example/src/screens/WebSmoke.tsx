import { ScrollView, StyleSheet, View } from 'react-native';
import { Markdown } from '@docren/react-native-markdown';
import { WEB_FIXTURES } from '../../../test/web/fixtures';

/**
 * Renders the shared web fixtures through the public `<Markdown>` and
 * nothing else, for the Playwright smoke test (`e2e/web.spec.ts`). Open it
 * at `/#smoke` in the web build. Each fixture sits in a `testID` container
 * (`data-testid` on web).
 */
export function WebSmoke() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {WEB_FIXTURES.map((fixture) => (
        <View key={fixture.name} testID={fixture.name} style={styles.fixture}>
          <Markdown source={fixture.source} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  fixture: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
});
