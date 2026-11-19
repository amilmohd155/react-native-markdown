import { StyleSheet, Text } from 'react-native';
import type { ElementProps } from '@docren/react-native-markdown';
import { useMentionPress } from '@docren/react-native-markdown/mentions';

const TINTS: Record<string, { color: string; backgroundColor: string }> = {
  user: { color: '#0969da', backgroundColor: '#ddf4ff' },
  channel: { color: '#1a7f37', backgroundColor: '#dafbe1' },
};
const FALLBACK = { color: '#57606a', backgroundColor: '#eaeef2' };

/**
 * A custom `components.Mention`: tinted per scheme and bold. Nested `Text`
 * only, since `Mention` is not a declared inline view. `useMentionPress`
 * routes the press to `onMentionPress`, as the default component does.
 */
export function MentionChip({
  scheme,
  id,
  label,
  url,
}: ElementProps<'Mention'>) {
  const press = useMentionPress();
  const tint = TINTS[scheme] ?? FALLBACK;
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`${scheme} ${label}`}
      onPress={() => press({ scheme, id, url, label })}
      style={[styles.chip, tint]}
    >
      {` ${label} `}
    </Text>
  );
}

const styles = StyleSheet.create({ chip: { fontWeight: '700' } });
