import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ViewStyle,
} from 'react-native';
import { gallery } from '../gallery';
import {
  BlockList,
  createTheme,
  darkTheme,
  defaultComponents,
  lightTheme,
  parse,
  tableOf,
  useMarkdownTheme,
  useRenderCtx,
  useResolvedTheme,
  type FontFaces,
  type HeadingLevel,
  type ThemeInput,
  type ThemeProp,
} from '../v1';

const table = tableOf(parse(gallery));

type Scheme = 'auto' | 'light' | 'dark';

// Inter, one family per face (loaded in App with expo-font's useFonts).
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

const PAGE = { light: '#ffffff', dark: '#0d1117' } as const;

/**
 * A divider that reads the theme with `useMarkdownTheme()` (the hook for
 * custom components): the default divider style, plus a caption with tokens.
 */
function ThemedDivider() {
  const { tokens, styles: themed } = useMarkdownTheme();
  return (
    <View>
      {/* Cast: the library and the example resolve separate copies of the
          React Native types, which TypeScript treats as different. */}
      <View style={themed.Divider.container as unknown as ViewStyle} />
      <Text style={[styles.caption, { color: tokens.colors.muted }]}>
        useMarkdownTheme · text {tokens.colors.text} · link {tokens.colors.link}
      </Text>
    </View>
  );
}

const components = { ...defaultComponents, Divider: ThemedDivider };

/**
 * Theme preview (M4): the gallery under `theme="auto" | "light" | "dark"`,
 * with token tweaks, a face-map font and element overrides. Stands in for
 * `<Markdown theme>` until M5.
 *
 * - auto follows the device scheme (change it in the system settings, or
 *   `adb shell cmd uimode night yes|no`).
 * - A theme *input* (tweaks under auto) merges onto the device scheme's
 *   base; light/dark with tweaks use `createTheme(tweaks, base)`.
 */
export function ThemeLab() {
  const device = useColorScheme();
  const [scheme, setScheme] = useState<Scheme>('auto');
  const [big, setBig] = useState(false);
  const [accent, setAccent] = useState(false);
  const [faces, setFaces] = useState(false);
  const [overrides, setOverrides] = useState(false);

  const theme = useMemo<ThemeProp>(() => {
    const tweaks: ThemeInput = {
      ...(big ? { fontSize: { base: 20 } } : null),
      ...(accent
        ? {
            colors: { link: '#bf3989', quoteBar: '#bf3989' },
            radius: { code: 16 },
            listBullets: ['→', '·', '–'],
          }
        : null),
      ...(faces ? { fonts: { body: INTER } } : null),
      ...(overrides
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
  }, [scheme, big, accent, faces, overrides]);

  const resolved = useResolvedTheme(theme);
  const ctx = useRenderCtx({ components, theme: resolved });

  const effective = scheme === 'auto' ? (device ?? 'light') : scheme;
  const page = PAGE[effective === 'dark' ? 'dark' : 'light'];
  const fg = effective === 'dark' ? '#e6edf3' : '#1f2328';

  return (
    <ScrollView
      style={{ backgroundColor: page }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.meta, { color: fg }]}>
        device {device ?? 'unknown'} · showing {effective} · text{' '}
        {resolved.tokens.colors.text} · body{' '}
        {typeof resolved.tokens.fonts.body === 'object'
          ? 'faces'
          : (resolved.tokens.fonts.body ?? 'system')}
      </Text>
      <View style={styles.toolbar}>
        {(['auto', 'light', 'dark'] as const).map((s) => (
          <Chip
            key={s}
            role="radio"
            label={s}
            value={scheme === s}
            fg={fg}
            onPress={() => setScheme(s)}
          />
        ))}
      </View>
      <View style={styles.toolbar}>
        <Chip
          label="big text"
          value={big}
          fg={fg}
          onPress={() => setBig(!big)}
        />
        <Chip
          label="accent"
          value={accent}
          fg={fg}
          onPress={() => setAccent(!accent)}
        />
        <Chip
          label="Inter faces"
          value={faces}
          fg={fg}
          onPress={() => setFaces(!faces)}
        />
        <Chip
          label="element overrides"
          value={overrides}
          fg={fg}
          onPress={() => setOverrides(!overrides)}
        />
      </View>
      <BlockList table={table} ctx={ctx} />
    </ScrollView>
  );
}

/** A pressable chip (native switches don't respond to the QA automation). */
function Chip({
  label,
  value,
  fg,
  onPress,
  role = 'switch',
}: {
  label: string;
  value: boolean;
  fg: string;
  onPress: () => void;
  role?: 'switch' | 'radio';
}) {
  const color = value ? '#ffffff' : fg;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={onPress}
      style={[styles.chip, { borderColor: fg }, value && styles.chipOn]}
    >
      <Text style={[styles.meta, { color }]}>
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
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipOn: { backgroundColor: '#0969da', borderColor: '#0969da' },
  meta: { fontSize: 12 },
  caption: { fontSize: 11, textAlign: 'center' },
});
