import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { styles as defaultStyles } from '../libs/styles';
import { removeTextStyleProps } from './removeProps';
import type { StyleMap } from '../types/style';

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
