import { View, StyleSheet, ScrollView } from 'react-native';
import { Markdown } from '@amilmohd155/react-native-markdown';
import { mdxString } from './example';
import { atomOneDarkReasonable } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { CodeHighlighter } from './component/code-highlighter';

export default function App() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown
          markdown={mdxString}
          renderRules={{
            code: ({ node }) => (
              <CodeHighlighter
                // @ts-ignore
                key={node.key}
                hljsStyle={atomOneDarkReasonable}
                language={node.lang || 'plaintext'}
                scrollViewProps={{
                  bounces: false,
                  contentContainerStyle: styles.codeContentContainer,
                }}
                textStyle={styles.codeTextStyle}
              >
                {node.value}
              </CodeHighlighter>
            ),
          }}
          styles={{
            blockquote: {
              backgroundColor: '#cad8ee',
            },
          }}
          customBulletElement={<View style={styles.customBullet} />}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingTop: 100,
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  customBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'black',
  },
  codeTextStyle: {
    fontFamily: 'Courier New',
    fontSize: 16,
  },
  codeContentContainer: {
    padding: 20,
    width: '100%',
    borderRadius: 8,
  },
});
