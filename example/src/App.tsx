import { View, StyleSheet, ScrollView } from 'react-native';
import { CodeHighlighter, Markdown } from '@quizcript/react-native-markdown';
import { mdxString } from './example';
import {
  atomOneDarkReasonable,
  docco,
  gradientDark,
} from 'react-syntax-highlighter/dist/esm/styles/hljs';

export default function App() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown
          markdown={mdxString}
          renderRules={{
            code: (node, key, styles, children) => (
              <CodeHighlighter
                key={key}
                hljsStyle={atomOneDarkReasonable}
                language={node.lang || 'javascript'}
                scrollViewProps={{
                  bounces: false,
                  contentContainerStyle: {
                    padding: 20,
                    width: '100%',
                    borderRadius: 8,
                  },
                }}
                textStyle={{
                  fontFamily: 'Courier New',
                  fontSize: 16,
                }}
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
          customBulletElement={
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: 'black',
              }}
            />
          }
        />
        {/* <CodeHighlighter
          hljsStyle={atomOneDarkReasonable}
          language="javascript"
          scrollViewProps={{
            bounces: false,
            contentContainerStyle: {
              padding: 20,
              width: '100%',
            },
          }}
          textStyle={{
            fontFamily: 'Courier New',
            fontSize: 16,
          }}
        >
          {`function hello(name) {
  console.log("hello world aknagna agnognag " + name);
}`}
        </CodeHighlighter> */}
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
  },
});
