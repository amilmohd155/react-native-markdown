import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRenderContext } from '../contexts';
import type { ElementProps } from '../elements';

const HIT_SLOP = 8;

/** Label for a block with no language (an indented block or a bare fence). */
const PLAIN_LABEL = 'plaintext';

/**
 * The bar above a code block (P3-35): the fence's language on the left
 * (`plaintext` when it has none), Wrap and Copy on the right. Each button shows only when its callback is
 * set; Copy is disabled while the fence is still streaming. Pure JS: the
 * app's `onCopyPress` writes the clipboard.
 *
 * Wrap shows its state on every platform: its label is underlined while
 * wrap is on (added after `style.text`, so a theme's text style still
 * applies). Screen readers get `accessibilityState.selected` on native and
 * `aria-pressed` on web.
 */
export function CodeBlockHeader({
  language,
  open,
  wrap,
  onToggleWrap,
  onCopy,
  style,
}: ElementProps<'CodeBlockHeader'>) {
  const { options } = useRenderContext();
  const maxFontSizeMultiplier = options.maxFontSizeMultiplier ?? undefined;
  // react-native-web 0.21 ignores `accessibilityState`; a toggle button takes
  // `aria-pressed` (ARIA has no `aria-selected` on a button). React Native's
  // types lack `aria-pressed`, so it goes in as a typed spread; Pressable
  // passes it to its View, which renders it on web and ignores it on native.
  const pressed: { readonly 'aria-pressed': boolean } = {
    'aria-pressed': wrap,
  };
  return (
    <View style={style.container}>
      <View style={styles.label}>
        <Text
          style={style.text}
          numberOfLines={1}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          {language === null || language === '' ? PLAIN_LABEL : language}
        </Text>
      </View>
      {onToggleWrap !== null && (
        <Pressable
          style={styles.action}
          onPress={onToggleWrap}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Wrap lines"
          accessibilityState={{ selected: wrap }}
          {...pressed}
        >
          <Text
            style={wrap ? [style.text, styles.active] : style.text}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            Wrap
          </Text>
        </Pressable>
      )}
      {onCopy !== null && (
        <Pressable
          style={[styles.action, open && styles.disabled]}
          onPress={onCopy}
          disabled={open}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          accessibilityState={{ disabled: open }}
        >
          <Text
            style={style.text}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            Copy
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { flex: 1 },
  action: { marginLeft: 12 },
  disabled: { opacity: 0.5 },
  active: { textDecorationLine: 'underline' },
});
