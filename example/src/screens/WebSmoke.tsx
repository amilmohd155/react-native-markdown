import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Markdown,
  type CodeBlockOptions,
  type CodeCopyInfo,
} from '@docren/react-native-markdown';
import { highlight } from '@docren/react-native-markdown/highlight';
import {
  HIGHLIGHT_CODE,
  HIGHLIGHT_LARGE_CODE,
  LONG_LINE_CODE,
  NUMBERED_CODE,
  NUMBERED_SMALL_CODE,
  NUMBERED_TRAILING_CODE,
  WEB_FIXTURES,
} from '../../../test/web/fixtures';

const PLUGINS = [highlight()];
const fence = (code: string) => '```ts\n' + code + '\n```';
const HEADER = { header: true } as const;
const NUMBERS = { header: true, lineNumbers: true } as const;
const WRAP = { header: true, wrap: true } as const;
const NUMBERS_WRAP = { header: true, lineNumbers: true, wrap: true } as const;

/**
 * A fence with the code block header on (P3-35), or the given `codeBlock`
 * options, whose Copy writes the clipboard and records the call in a status
 * line (`<testID>-status`). `selectable` makes the code selectable, so a
 * mouse drag can select it.
 */
function HeaderFixture({
  testID,
  code,
  highlighted = false,
  codeBlock = HEADER,
  selectable = false,
}: {
  testID: string;
  code: string;
  highlighted?: boolean;
  codeBlock?: CodeBlockOptions;
  selectable?: boolean;
}) {
  const [status, setStatus] = useState('not copied');
  const onCopyPress = ({ code: copied }: CodeCopyInfo) => {
    // Async; the test polls the clipboard, not this promise.
    navigator.clipboard?.writeText(copied).catch(() => {});
    setStatus(`copied ${copied.length} chars`);
  };
  return (
    <View testID={testID} style={styles.fixture}>
      <Markdown
        source={fence(code)}
        plugins={highlighted ? PLUGINS : undefined}
        codeBlock={codeBlock}
        selectable={selectable}
        onCopyPress={onCopyPress}
      />
      <Text testID={`${testID}-status`}>{status}</Text>
    </View>
  );
}

/**
 * Renders the shared web fixtures through the public `<Markdown>` and
 * nothing else, for the Playwright smoke test (`e2e/web.spec.ts`). Open it
 * at `/#smoke` in the web build. Each fixture sits in a `testID` container
 * (`data-testid` on web). The fixtures render without plugins; the extra
 * `highlight` block renders {@link HIGHLIGHT_CODE} with `highlight()`, and
 * {@link HIGHLIGHT_LARGE_CODE} renders highlighted (`highlight-large`) and
 * plain (`plain-large`), selectable, to compare. The `codeblock-header*`
 * blocks turn the code block header on with a Copy that writes the
 * clipboard: plain, highlighted, and one long line (`LONG_LINE_CODE`).
 * The `codeblock-numbers*` and `codeblock-*wrap*` blocks add line numbers
 * and wrap to {@link NUMBERED_CODE} (selectable), plain and highlighted;
 * `codeblock-numbers-highlight-small` numbers {@link NUMBERED_SMALL_CODE}
 * (one code Text); `codeblock-numbers-trailing*` number
 * {@link NUMBERED_TRAILING_CODE} (ends in 2 blank lines), plain and
 * highlighted; `codeblock-wrap` wraps without numbers.
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
      <HeaderFixture testID="codeblock-header" code={HIGHLIGHT_CODE} />
      <HeaderFixture
        testID="codeblock-header-highlight"
        code={HIGHLIGHT_CODE}
        highlighted
      />
      <HeaderFixture testID="codeblock-header-long" code={LONG_LINE_CODE} />
      <HeaderFixture
        testID="codeblock-numbers"
        code={NUMBERED_CODE}
        codeBlock={NUMBERS}
        selectable
      />
      <HeaderFixture
        testID="codeblock-numbers-highlight"
        code={NUMBERED_CODE}
        codeBlock={NUMBERS}
        highlighted
        selectable
      />
      <HeaderFixture
        testID="codeblock-numbers-highlight-small"
        code={NUMBERED_SMALL_CODE}
        codeBlock={NUMBERS}
        highlighted
        selectable
      />
      <HeaderFixture
        testID="codeblock-numbers-trailing"
        code={NUMBERED_TRAILING_CODE}
        codeBlock={NUMBERS}
        selectable
      />
      <HeaderFixture
        testID="codeblock-numbers-trailing-highlight"
        code={NUMBERED_TRAILING_CODE}
        codeBlock={NUMBERS}
        highlighted
        selectable
      />
      <HeaderFixture
        testID="codeblock-wrap"
        code={NUMBERED_CODE}
        codeBlock={WRAP}
        selectable
      />
      <HeaderFixture
        testID="codeblock-numbers-wrap"
        code={NUMBERED_CODE}
        codeBlock={NUMBERS_WRAP}
        selectable
      />
      <HeaderFixture
        testID="codeblock-numbers-wrap-highlight"
        code={NUMBERED_CODE}
        codeBlock={NUMBERS_WRAP}
        highlighted
        selectable
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  fixture: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
});
