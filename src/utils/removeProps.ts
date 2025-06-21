import type { TextStyle, ViewStyle } from 'react-native';

type TextOnlyProps = Omit<TextStyle, keyof ViewStyle>;

export function removeTextStyleProps<T extends ViewStyle | TextStyle>(
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
