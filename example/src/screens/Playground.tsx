import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  Markdown,
  type MarkdownProps,
  createTheme,
  parse,
  type FontFaces,
  type ScriptFallback,
  type SoftBreak,
  type FlatThemeInput,
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

// Declared inline views (D8): link chips and raised/lowered scripts.
const CHIP_COMPONENTS = {
  Link: LinkChip,
  Superscript: RaisedSuperscript,
  Subscript: LoweredSubscript,
};

/**
 * Compact preset themes, one per Phase 3a feature. Each is a flat theme with
 * a `dark` block, merged onto the built-in theme of the active scheme.
 */
const PRESETS = {
  none: createTheme({}),
  brand: createTheme({
    paragraph: { color: '#2b2140', lineHeight: 26 },
    h1: { color: '#6d28d9' },
    h2: { color: '#6d28d9' },
    link: { color: '#be185d' },
    codeBlock: { backgroundColor: '#f3e8ff', borderRadius: 12, padding: 14 },
    dark: {
      paragraph: { color: '#e9ddff' },
      h1: { color: '#c4b5fd' },
      h2: { color: '#c4b5fd' },
      link: { color: '#f9a8d4' },
      codeBlock: { backgroundColor: '#2a1d47' },
    },
  }),
  lists: createTheme({
    list: {
      bullets: ['●', '○', '■'],
      bulletColor: '#0d9488',
      markerColor: '#0d9488',
      markerFontWeight: '700',
      itemSpacing: 6,
      gapWidth: 10,
    },
  }),
  table: createTheme({
    table: {
      headerBackgroundColor: '#1e3a8a',
      headerColor: '#ffffff',
      rowEvenBackgroundColor: '#eff6ff',
      rowOddBackgroundColor: '#dbeafe',
      borderRadius: 10,
      align: 'center',
      color: '#0f172a',
      cellPaddingVertical: 8,
    },
    dark: {
      table: {
        rowEvenBackgroundColor: '#172036',
        rowOddBackgroundColor: '#1e2a47',
        color: '#e2e8f0',
      },
    },
  }),
  admonitions: createTheme({
    blockquote: {
      borderLeftWidth: 5,
      padding: 12,
      borderRadius: 10,
      admonitions: {
        warning: { color: '#c2410c', backgroundColor: '#ffedd5' },
        caution: { color: '#b91c1c', backgroundColor: '#fee2e2' },
      },
    },
    dark: {
      blockquote: {
        admonitions: {
          warning: { color: '#fdba74', backgroundColor: '#3a2410' },
          caution: { color: '#fca5a5', backgroundColor: '#3b1414' },
        },
      },
    },
  }),
  mentions: createTheme({
    link: {
      variants: {
        '^user:': {
          color: '#1264a3',
          backgroundColor: '#e8f5fb',
          textDecorationLine: 'none',
        },
        '^channel:': {
          color: '#065f46',
          backgroundColor: '#d1fae5',
          textDecorationLine: 'none',
        },
      },
    },
    dark: {
      link: {
        variants: {
          '^user:': { color: '#7cc4ee', backgroundColor: '#0f3047' },
          '^channel:': { color: '#6ee7b7', backgroundColor: '#0b3a2c' },
        },
      },
    },
  }),
  checkbox: createTheme({
    checkbox: {
      size: 22,
      color: '#9333ea',
      checkedColor: '#9333ea',
      borderRadius: 11,
      checkedText: { textDecorationLine: 'line-through' },
    },
  }),
  images: createTheme({
    image: { maxHeight: 140, borderRadius: 16 },
    inlineImage: { size: 28 },
  }),
  footnotes: createTheme({
    footnote: {
      reference: { color: '#b45309', fontScale: 0.8 },
      backLink: { color: '#b45309' },
      definition: { color: '#78350f', fontSize: 14, highlightColor: '#fde68a' },
    },
    dark: {
      footnote: {
        reference: { color: '#fbbf24' },
        backLink: { color: '#fbbf24' },
        definition: { color: '#fde68a', highlightColor: '#78350f' },
      },
    },
  }),
  sizing: createTheme({
    // Headings scale from paragraph.fontSize; inline sizes follow the parent.
    paragraph: { fontSize: 20 },
    superscript: { fontScale: 0.6 },
    subscript: { fontScale: 0.6 },
    light: { inlineCode: { backgroundColor: '#fde68a' } },
    dark: { inlineCode: { backgroundColor: '#78350f', color: '#fde68a' } },
  }),
} as const;

type PresetName = keyof typeof PRESETS;

const PRESET_OPTIONS: readonly { value: PresetName; label: string }[] = [
  { value: 'none', label: 'Built-in' },
  { value: 'brand', label: 'Brand' },
  { value: 'lists', label: 'Lists' },
  { value: 'table', label: 'Table' },
  { value: 'admonitions', label: 'Alerts' },
  { value: 'mentions', label: 'Mentions' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'images', label: 'Images' },
  { value: 'footnotes', label: 'Footnotes' },
  { value: 'sizing', label: 'Sizing' },
];

interface Options {
  readonly preset: PresetName;
  readonly font: 'system' | 'inter';
  readonly size: 'default' | 'large';
  readonly accent: boolean;
  readonly overrides: boolean;
  readonly softBreak: SoftBreak;
  readonly scriptFallback: ScriptFallback;
  readonly inlineViews: boolean;
  readonly mentionChip: boolean;
  readonly tasks: boolean;
  readonly selectable: boolean;
  readonly codeHeader: boolean;
  readonly lineNumbers: boolean;
  readonly wrapLines: boolean;
}

const DEFAULTS: Options = {
  preset: 'none',
  font: 'system',
  size: 'default',
  accent: false,
  overrides: false,
  softBreak: 'space',
  scriptFallback: 'smaller',
  inlineViews: false,
  mentionChip: false,
  tasks: true,
  selectable: true,
  codeHeader: false,
  lineNumbers: false,
  wrapLines: false,
};

/**
 * The library's theme for these options: the chosen preset with the quick
 * tweaks merged over it (one level deep, per element key). A theme object
 * always merges onto the built-in theme of the *device* scheme, and
 * `<Markdown>` has no `scheme` prop. Only the string themes pin a scheme, so
 * the header's Light/Dark toggle also sets `Appearance.setColorScheme` (see
 * App), which makes the device scheme, and so these objects, follow it.
 */
function themeFor(options: Options): MarkdownProps['theme'] {
  const tweaks: FlatThemeInput = {
    paragraph: {
      ...(options.size === 'large' ? { fontSize: 20 } : null),
      ...(options.font === 'inter' ? { fontFamily: INTER } : null),
    },
    link: {
      ...(options.accent ? { color: '#bf3989' } : null),
      ...(options.overrides
        ? { textDecorationLine: 'none', fontWeight: '700' }
        : null),
    },
    blockquote: options.accent ? { borderLeftColor: '#bf3989' } : {},
    codeBlock: {
      ...(options.accent ? { borderRadius: 16 } : null),
      ...(options.overrides
        ? { borderWidth: 1, borderColor: '#bf3989' }
        : null),
    },
    list: options.accent ? { bullets: ['→', '·', '–'] } : {},
  };
  const preset: FlatThemeInput = PRESETS[options.preset];
  const merged: Record<string, object> = { ...preset };
  for (const [key, value] of Object.entries(tweaks)) {
    if (Object.keys(value).length > 0) {
      merged[key] = { ...merged[key], ...value };
    }
  }
  if (Object.keys(merged).length === 0) return 'auto';
  return createTheme(merged as FlatThemeInput);
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
  const { p } = useChrome();
  const [mode, setMode] = useState<Mode>('preview');
  const [parsed, setParsed] = useState(() => build(gallery));
  const [options, setOptions] = useState(DEFAULTS);
  const [sheet, setSheet] = useState(false);
  const [event, setEvent] = useState<string | null>(null);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const theme = useMemo(() => themeFor(options), [options]);
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
  // Memoised, so the option object keeps its identity across renders.
  const { codeHeader, lineNumbers, wrapLines } = options;
  const codeBlock = useMemo(
    () =>
      codeHeader || lineNumbers || wrapLines
        ? { header: codeHeader, lineNumbers, wrap: wrapLines }
        : undefined,
    [codeHeader, lineNumbers, wrapLines]
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
              selectable={options.selectable}
              onLinkPress={(href) => setEvent(`link · ${href}`)}
              onMentionPress={({ scheme, id }) =>
                setEvent(`mention · ${scheme}:${id}`)
              }
              onImagePress={(src) => setEvent(`image · ${src}`)}
              enableTaskListItemToggle={options.tasks}
              onTaskToggle={({ index, checked }) =>
                setEvent(`task #${index} · ${checked ? 'done' : 'open'}`)
              }
              codeBlock={codeBlock}
              // No clipboard dependency in the example: log the copy only.
              onCopyPress={({ code, language }) =>
                setEvent(`copy · ${language ?? 'code'} · ${code.length} chars`)
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
        <Field label="Preset theme">
          <View style={styles.wrap}>
            {PRESET_OPTIONS.map((o) => (
              <Toggle
                key={o.value}
                label={o.label}
                value={options.preset === o.value}
                onChange={() => set('preset', o.value)}
              />
            ))}
          </View>
        </Field>
        <Field label="Quick tweaks">
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
            <Toggle
              label="Selectable text"
              value={options.selectable}
              onChange={(v) => set('selectable', v)}
            />
            <Toggle
              label="Code block header"
              value={options.codeHeader}
              onChange={(v) => set('codeHeader', v)}
            />
            <Toggle
              label="Line numbers"
              value={options.lineNumbers}
              onChange={(v) => set('lineNumbers', v)}
            />
            <Toggle
              label="Wrap lines"
              value={options.wrapLines}
              onChange={(v) => set('wrapLines', v)}
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
