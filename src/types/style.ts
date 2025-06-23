import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from 'react-native';

type NamedStyle = StyleProp<ViewStyle | TextStyle | ImageStyle>;

export type StyleMap = Record<string, NamedStyle>;
