import { ScrollView, StyleSheet, View } from 'react-native';
import { Markdown } from '@docren/react-native-markdown';
import { highlight } from '@docren/react-native-markdown/highlight';
import {
  HIGHLIGHT_CODE,
  HIGHLIGHT_LARGE_CODE,
  WEB_FIXTURES,
} from '../../../test/web/fixtures';

const PLUGINS = [highlight()];
const fence = (code: string) => '```ts\n' + code + '\n```';

/**
 * Renders the shared web fixtures through the public `<Markdown>` and
 * nothing else, for the Playwright smoke test (`e2e/web.spec.ts`). Open it
 * at `/#smoke` in the web build. Each fixture sits in a `testID` container
 * (`data-testid` on web). The fixtures render without plugins; the extra
 * `highlight` block renders {@link HIGHLIGHT_CODE} with `highlight()`, and
 * {@link HIGHLIGHT_LARGE_CODE} renders highlighted (`highlight-large`) and
 * plain (`plain-large`), selectable, to compare.
 */
export function WebSmoke() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {WEB_FIXTURES.map((fixture) => (
        <View key={fixture.name} testID={fixture.name} style={styles.fixture}>
          <Markdown source={fixture.source} />
        </View>
      ))}
      <View testID="highlight" style={styles.fixture}>
        <Markdown source={fence(HIGHLIGHT_CODE)} plugins={PLUGINS} />
      </View>
      <View testID="highlight-large" style={styles.fixture}>
        <Markdown
          source={fence(HIGHLIGHT_LARGE_CODE)}
          plugins={PLUGINS}
          selectable
        />
      </View>
      <View testID="plain-large" style={styles.fixture}>
        <Markdown source={fence(HIGHLIGHT_LARGE_CODE)} selectable />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  fixture: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
});
