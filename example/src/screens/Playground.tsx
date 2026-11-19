import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  createTheme,
  darkTheme,
  lightTheme,
  Markdown,
  parse,
  type FontFaces,
  type HeadingLevel,
  type ScriptFallback,
  type SoftBreak,
  type ThemeInput,
  type ThemeProp,
} from '@docren/react-native-markdown';
import { MentionChip } from '../components/MentionChip';
import { PLUGINS } from '../plugins';
import {
  LinkChip,
  LoweredSubscript,
  RaisedSuperscript,
} from '../components/inlineViews';
import { gallery } from '../gallery';
import {
  Card,
  Field,
  MONO,
  OptionsSheet,
  Segmented,
  Toggle,
  UIText,
  useChrome,
} from '../ui';

// Inter, one family per face (loaded in App with expo-font).
const INTER: FontFaces = {
  regular: 'Inter_400Regular',
  italic: 'Inter_400Regular_Italic',
  bold: 'Inter_700Bold',
  boldItalic: 'Inter_700Bold_Italic',
};

// Module-level, so the theme cache can match it by identity.
const headingOverride = (level: HeadingLevel) => ({
  text: level === 1 ? { textTransform: 'uppercase' as const } : {},
});

// Declared inline views (D8): link chips and raised/lowered scripts.
const CHIP_COMPONENTS = {
  Link: LinkChip,
  Superscript: RaisedSuperscript,
  Subscript: LoweredSubscript,
};

interface Options {
  readonly font: 'system' | 'inter';
  readonly size: 'default' | 'large';
  readonly accent: boolean;
  readonly overrides: boolean;
  readonly softBreak: SoftBreak;
  readonly scriptFallback: ScriptFallback;
  readonly inlineViews: boolean;
  readonly mentionChip: boolean;
  readonly tasks: boolean;
}

const DEFAULTS: Options = {
  font: 'system',
  size: 'default',
  accent: false,
  overrides: false,
  softBreak: 'space',
  scriptFallback: 'smaller',
  inlineViews: false,
  mentionChip: false,
  tasks: true,
};

/**
 * The library's theme for these options. Under `'auto'` a tweak object
 * merges onto the device scheme's base; light and dark build on their own.
 */
function themeFor(
  scheme: 'auto' | 'light' | 'dark',
  options: Options
): ThemeProp {
  const tweaks: ThemeInput = {
    ...(options.size === 'large' ? { fontSize: { base: 20 } } : null),
    ...(options.accent
      ? {
          colors: { link: '#bf3989', quoteBar: '#bf3989' },
          radius: { code: 16 },
          listBullets: ['→', '·', '–'],
        }
      : null),
    ...(options.font === 'inter' ? { fonts: { body: INTER } } : null),
    ...(options.overrides
      ? {
          elements: {
            Link: { text: { textDecorationLine: 'none', fontWeight: '700' } },
            CodeBlock: {
              container: { borderLeftWidth: 4, borderLeftColor: '#bf3989' },
            },
            Heading: headingOverride,
          },
        }
      : null),
  };
  if (Object.keys(tweaks).length === 0) return scheme;
  if (scheme === 'auto') return tweaks;
  return createTheme(tweaks, scheme === 'dark' ? darkTheme : lightTheme);
}

type Mode = 'preview' | 'edit';

/** Parses `source` and times it (outside render: the clock is impure). */
function build(source: string) {
  const start = performance.now();
  const document = parse(source, { plugins: PLUGINS });
  return { source, document, ms: performance.now() - start };
}

/**
 * The renderer through its public API: the gallery document (or your own
 * text) under every option. The theme, rendering options and inline views
 * live in the options sheet; the light/dark switch is in the header.
 */
export function Playground() {
  const { p, setting } = useChrome();
  const [mode, setMode] = useState<Mode>('preview');
  const [parsed, setParsed] = useState(() => build(gallery));
  const [options, setOptions] = useState(DEFAULTS);
  const [sheet, setSheet] = useState(false);
  const [event, setEvent] = useState<string | null>(null);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const theme = useMemo(() => themeFor(setting, options), [setting, options]);
  const components = useMemo(
    () =>
      options.inlineViews || options.mentionChip
        ? {
            ...(options.inlineViews ? CHIP_COMPONENTS : null),
            ...(options.mentionChip ? { Mention: MentionChip } : null),
          }
        : undefined,
    [options.inlineViews, options.mentionChip]
  );
  const changed = JSON.stringify(options) !== JSON.stringify(DEFAULTS);

  return (
    <View style={styles.root}>
      <View style={styles.modeBar}>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'preview', label: 'Preview' },
            { value: 'edit', label: 'Edit' },
          ]}
        />
      </View>

      {mode === 'preview' ? (
        <ScrollView
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            <Markdown
              document={parsed.document}
              plugins={PLUGINS}
              theme={theme}
              components={components}
              softBreak={options.softBreak}
              scriptFallback={options.scriptFallback}
              onLinkPress={(href) => setEvent(`link · ${href}`)}
              onMentionPress={({ scheme, id }) =>
                setEvent(`mention · ${scheme}:${id}`)
              }
              onImagePress={(src) => setEvent(`image · ${src}`)}
              enableTaskListItemToggle={options.tasks}
              onTaskToggle={({ index, checked }) =>
                setEvent(`task #${index} · ${checked ? 'done' : 'open'}`)
              }
            />
          </View>
        </ScrollView>
      ) : (
        <TextInput
          multiline
          value={parsed.source}
          onChangeText={(text) => setParsed(build(text))}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textAlignVertical="top"
          placeholder="Write some markdown…"
          placeholderTextColor={p.muted}
          selectionColor={p.accent}
          style={[
            styles.editor,
            {
              color: p.text,
              backgroundColor: p.surface,
              borderColor: p.border,
            },
          ]}
        />
      )}

      <View pointerEvents="box-none" style={styles.dock}>
        <Card style={styles.stats}>
          <UIText variant="caption" muted numberOfLines={1}>
            {parsed.document.blockCount} blocks · parse {parsed.ms.toFixed(1)}{' '}
            ms{__DEV__ ? ' · dev' : ''}
          </UIText>
          {event ? (
            <UIText variant="caption" numberOfLines={1}>
              {event}
            </UIText>
          ) : null}
        </Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Options"
          onPress={() => setSheet(true)}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: p.accent },
            pressed && { opacity: 0.85 },
          ]}
        >
          <UIText variant="label" color={p.onAccent}>
            Options{changed ? ' •' : ''}
          </UIText>
        </Pressable>
      </View>

      <OptionsSheet
        visible={sheet}
        changed={changed}
        onReset={() => setOptions(DEFAULTS)}
        onClose={() => setSheet(false)}
      >
        <Field label="Typeface">
          <Segmented
            label="Typeface"
            value={options.font}
            onChange={(v) => set('font', v)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'inter', label: 'Inter' },
            ]}
          />
        </Field>
        <Field label="Text size">
          <Segmented
            label="Text size"
            value={options.size}
            onChange={(v) => set('size', v)}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </Field>
        <Field label="Theme">
          <View style={styles.wrap}>
            <Toggle
              label="Accent colour"
              value={options.accent}
              onChange={(v) => set('accent', v)}
            />
            <Toggle
              label="Element overrides"
              value={options.overrides}
              onChange={(v) => set('overrides', v)}
            />
          </View>
        </Field>
        <Field label="Soft line breaks">
          <Segmented
            label="Soft line breaks"
            value={options.softBreak}
            onChange={(v) => set('softBreak', v)}
            options={[
              { value: 'space', label: 'Space' },
              { value: 'newline', label: 'Newline' },
            ]}
          />
        </Field>
        <Field label="Superscript fallback">
          <Segmented
            label="Superscript fallback"
            value={options.scriptFallback}
            onChange={(v) => set('scriptFallback', v)}
            options={[
              { value: 'smaller', label: 'Smaller' },
              { value: 'raised', label: 'Raised' },
            ]}
          />
        </Field>
        <Field label="Behaviour">
          <View style={styles.wrap}>
            <Toggle
              label="Inline views"
              value={options.inlineViews}
              onChange={(v) => set('inlineViews', v)}
            />
            <Toggle
              label="Custom mention"
              value={options.mentionChip}
              onChange={(v) => set('mentionChip', v)}
            />
            <Toggle
              label="Interactive tasks"
              value={options.tasks}
              onChange={(v) => set('tasks', v)}
            />
          </View>
        </Field>
      </OptionsSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modeBar: { paddingHorizontal: 16, paddingBottom: 12 },
  page: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 },
  // Readable measure on wide screens (web, tablets).
  column: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  editor: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 96,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 19,
  },
  dock: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stats: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fab: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
