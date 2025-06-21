import { View, StyleSheet, ScrollView } from 'react-native';
import { Markdown } from '@quizcript/react-native-markdown';
import { mdxString } from './example';

export default function App() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown markdown={mdxString} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#bebebe',
  },
  content: {
    paddingTop: 100,
    paddingHorizontal: 20,
  },
});
