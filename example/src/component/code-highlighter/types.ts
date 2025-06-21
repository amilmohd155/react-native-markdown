import type { ScrollViewProps, StyleProp, TextStyle } from 'react-native';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import type { CSSProperties } from 'react';

export type HighlighterStyleSheet = {
  [className: string]: TextStyle;
};

export type HljsStyle = Record<string, CSSProperties>;

export interface CodeHighlighterProps extends SyntaxHighlighterProps {
  scrollViewProps?: ScrollViewProps;
  hljsStyle: HljsStyle;
  textStyle?: StyleProp<TextStyle>;
}
