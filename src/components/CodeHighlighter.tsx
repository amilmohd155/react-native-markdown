import { type ReactNode, useCallback, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import SyntaxHighlighter, {
  type SyntaxHighlighterProps,
} from 'react-syntax-highlighter';
import {
  transformHljsStyleToRN,
  type HljsStyle,
} from '../utils/transformHljsStyleToRN';
import { trimNewlines } from '../utils/trimNewLines';

interface Props extends SyntaxHighlighterProps {
  scrollViewProps?: ScrollViewProps;
  hljsStyle: HljsStyle;
  textStyle?: StyleProp<TextStyle>;
}

export const CodeHighlighter = ({
  children,
  scrollViewProps,
  hljsStyle,
  textStyle,
  ...props
}: Props) => {
  const styleSheet = useMemo(
    () => transformHljsStyleToRN(hljsStyle),
    [hljsStyle]
  );

  const getStyleFromNode = useCallback(
    (node: rendererNode): TextStyle[] =>
      (node.properties?.className || [])
        .map((className) => styleSheet[className])
        .filter(Boolean) as TextStyle[],
    [styleSheet]
  );

  const renderNode = useCallback(
    (nodes: rendererNode[], keyPrefix = 'row') => {
      return nodes.flatMap<ReactNode>((node, index) => {
        const key = `${keyPrefix}-${index}`;
        const _children = node.children ? renderNode(node.children, key) : null;

        if (node.value) {
          //   console.log(
          //     `Rendering node with value: ${trimNewlines(String(node.value))}`
          //   );

          return [trimNewlines(String(node.value))];
        }

        if (_children) {
          const combinedStyle = StyleSheet.flatten([
            { color: styleSheet.hljs?.color },
            textStyle,
            ...getStyleFromNode(node),
          ]);
          return (
            <Text style={combinedStyle} key={key}>
              {_children}
            </Text>
          );
        }

        return [];
      });
    },
    [getStyleFromNode, styleSheet.hljs?.color, textStyle]
  );

  const renderer = ({ rows }: rendererProps) => {
    return (
      <ScrollView
        {...scrollViewProps}
        horizontal
        contentContainerStyle={[
          styleSheet.hljs,
          scrollViewProps?.contentContainerStyle,
        ]}
      >
        <View onStartShouldSetResponder={() => true}>{renderNode(rows)}</View>
      </ScrollView>
    );
  };

  return (
    <SyntaxHighlighter
      {...props}
      renderer={renderer}
      CodeTag={View}
      PreTag={View}
    >
      {children}
    </SyntaxHighlighter>
  );
};
