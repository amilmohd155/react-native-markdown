import { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Pressable,
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
  lightTheme,
  parse,
  resolveTheme,
  tableOf,
  useRenderCtx,
  type RenderHandlers,
} from '../v1';

// Parsed (and timed) once at load, outside render: the gallery is static.
const parseStart = performance.now();
const table = tableOf(parse(gallery));
const parseMs = performance.now() - parseStart;

/**
 * v1 renderer preview: the gallery fixture through BlockList and the
 * default elements. Stands in for <Markdown> until M5.
 */
export function V1Preview() {
  const [newlines, setNewlines] = useState(false);
  const [tasks, setTasks] = useState(true);
  const [inter, setInter] = useState(false);
  const [chips, setChips] = useState(false);
  const [raised, setRaised] = useState(false);

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
        ...lightTheme,
        fonts: { ...lightTheme.fonts, body: 'Inter_400Regular' },
      }),
    []
  );

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
    scriptFallback: raised ? 'raised' : 'smaller',
    theme: inter ? interTheme : undefined,
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.toolbar}>
        <Text style={styles.meta}>
          parse {parseMs.toFixed(1)} ms · {table.blockCount} blocks ·{' '}
          {__DEV__ ? 'dev' : 'release'}
        </Text>
        <Toggle label="newlines" value={newlines} onChange={setNewlines} />
        <Toggle label="tasks" value={tasks} onChange={setTasks} />
        <Toggle label="Inter" value={inter} onChange={setInter} />
        <Toggle label="inline views" value={chips} onChange={setChips} />
        <Toggle label="raised fallback" value={raised} onChange={setRaised} />
      </View>
      <BlockList table={table} ctx={ctx} />
    </ScrollView>
  );
}

/**
 * A pressable on/off chip. Native switches don't respond to the simulator
 * automation used for device QA, so the preview uses these instead.
 */
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.toggle, value && styles.toggleOn]}
    >
      <Text style={[styles.meta, value && styles.toggleOnText]}>
        {value ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d9e0',
  },
  toggleOn: { backgroundColor: '#0969da', borderColor: '#0969da' },
  toggleOnText: { color: '#ffffff' },
  meta: { fontSize: 12, color: '#59636e' },
});
