import {
  StyleSheet,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { styles as defaultStyles } from '../libs/styles';

type TextOnlyProps = Omit<TextStyle, keyof ViewStyle>;

type NamedStyle = StyleProp<ViewStyle | TextStyle | ImageStyle>;

export type StyleMap = Record<string, NamedStyle>;

function removeTextStyleProps<T extends ViewStyle | TextStyle>(
  style: T
): ViewStyle {
  const textOnlyKeys: (keyof TextOnlyProps)[] = [
    'color',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'textAlign',
    'textDecorationLine',
    'textDecorationStyle',
    'textDecorationColor',
    'textShadowColor',
    'textShadowOffset',
    'textShadowRadius',
    'textTransform',
    'includeFontPadding',
    'textAlignVertical',
    'fontVariant',
    'writingDirection',
  ];

  const result = { ...style };

  textOnlyKeys.forEach((key) => {
    delete (result as any)[key];
  });

  return result as ViewStyle;
}

export function getMergedStyles(
  styles: StyleMap | null = null,
  merge = false
): StyleMap {
  let output: Record<string, ViewStyle | TextStyle> = {};

  const allKeys = new Set([
    ...Object.keys(defaultStyles),
    ...(styles ? Object.keys(styles) : []),
  ]);

  for (const key of allKeys) {
    const base = StyleSheet.flatten(defaultStyles[key]) ?? {};
    const custom = StyleSheet.flatten(styles?.[key]) ?? {};

    const final = merge
      ? { ...base, ...custom }
      : styles?.[key]
        ? custom
        : base;

    output[key] = final;
    output[`_VIEW_SAFE_${key}`] = removeTextStyleProps(final);
  }

  return StyleSheet.create(output);
}
