import { type ReactNode, useCallback, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { transformHljsStyleToRN } from '../utils/transformHljsStyleToRN';
import { trimNewlines } from '../utils/trimNewLines';
import type { CodeHighlighterProps } from '../types';

/** Highlighted rows → nested <Text>; `styleOf` gives each node's style. */
function renderNodes(
  nodes: rendererNode[],
  keyPrefix: string,
  styleOf: (node: rendererNode) => StyleProp<TextStyle>
): ReactNode[] {
  return nodes.flatMap<ReactNode>((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.value) {
      return [trimNewlines(String(node.value))];
    }
    const children = node.children
      ? renderNodes(node.children, key, styleOf)
      : null;
    if (children) {
      return (
        <Text style={styleOf(node)} key={key}>
          {children}
        </Text>
      );
    }
    return [];
  });
}

const CodeHighlighter = ({
  children,
  scrollViewProps,
  hljsStyle,
  textStyle,
  ...props
}: CodeHighlighterProps) => {
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
    (nodes: rendererNode[]) =>
      renderNodes(nodes, 'row', (node) =>
        StyleSheet.flatten([
          { color: styleSheet.hljs?.color },
          textStyle,
          ...getStyleFromNode(node),
        ])
      ),
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

export default CodeHighlighter;
