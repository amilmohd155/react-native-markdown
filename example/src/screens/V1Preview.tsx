import { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  LinkChip,
  LoweredSubscript,
  RaisedSuperscript,
} from '../components/inlineViews';
import { gallery } from '../gallery';
import {
  BlockList,
  defaultComponents,
  lightTokens,
  parse,
  resolveTheme,
  tableOf,
  useRenderCtx,
  type RenderHandlers,
} from '../v1';

/**
 * v1 renderer preview: the gallery fixture through BlockList and the
 * default elements. Stands in for <Markdown> until M5.
 */
export function V1Preview() {
  const [newlines, setNewlines] = useState(false);
  const [tasks, setTasks] = useState(true);
  const [inter, setInter] = useState(false);
  const [chips, setChips] = useState(false);

  // Declared inline views (D8): link chips and raised/lowered scripts.
  const chipComponents = useMemo(
    () => ({
      ...defaultComponents,
      Link: LinkChip,
      Superscript: RaisedSuperscript,
      Subscript: LoweredSubscript,
    }),
    []
  );

  // Inter as the body font (loaded in App with expo-font).
  const interTheme = useMemo(
    () =>
      resolveTheme({
        ...lightTokens,
        fonts: { ...lightTokens.fonts, body: 'Inter_400Regular' },
      }),
    []
  );

  const { table, parseMs } = useMemo(() => {
    const start = performance.now();
    const doc = parse(gallery);
    return { table: tableOf(doc), parseMs: performance.now() - start };
  }, []);

  const handlers: RenderHandlers = {
    onLinkPress: (href) => {
      console.log('[v1] link', href);
    },
    onTaskToggle: tasks
      ? (checked, { index }) =>
          Alert.alert('Task toggled', `#${index} → ${checked}`)
      : undefined,
  };

  const ctx = useRenderCtx({
    components: chips ? chipComponents : defaultComponents,
    handlers,
    softBreak: newlines ? 'newline' : 'space',
    theme: inter ? interTheme : undefined,
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.toolbar}>
        <Text style={styles.meta}>
          parse {parseMs.toFixed(1)} ms · {table.blockCount} blocks ·{' '}
          {__DEV__ ? 'dev' : 'release'}
        </Text>
        <View style={styles.toggle}>
          <Text style={styles.meta}>newlines</Text>
          <Switch value={newlines} onValueChange={setNewlines} />
        </View>
        <View style={styles.toggle}>
          <Text style={styles.meta}>tasks</Text>
          <Switch value={tasks} onValueChange={setTasks} />
        </View>
        <View style={styles.toggle}>
          <Text style={styles.meta}>Inter</Text>
          <Switch value={inter} onValueChange={setInter} />
        </View>
        <View style={styles.toggle}>
          <Text style={styles.meta}>inline views</Text>
          <Switch value={chips} onValueChange={setChips} />
        </View>
      </View>
      <BlockList table={table} ctx={ctx} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: '#59636e' },
});
