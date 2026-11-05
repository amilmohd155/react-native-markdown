import { useMemo, useState, type ComponentType } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_700Bold_Italic,
  useFonts,
} from '@expo-google-fonts/inter';
import { Bench } from './screens/Bench';
import { Playground } from './screens/Playground';
import { StreamBench } from './screens/StreamBench';
import { WebSmoke } from './screens/WebSmoke';
import {
  ChromeProvider,
  FONT,
  PALETTES,
  Segmented,
  UIText,
  useChrome,
  type Chrome,
  type SchemeSetting,
} from './ui';

const SCREENS: {
  name: string;
  glyph: string;
  component: ComponentType;
}[] = [
  { name: 'Playground', glyph: '¶', component: Playground },
  { name: 'Bench', glyph: '⏱', component: Bench },
  { name: 'Stream', glyph: '≈', component: StreamBench },
];

const SCHEMES = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/** `/#smoke` on web: the fixtures only, for the Playwright smoke test. */
const SMOKE =
  Platform.OS === 'web' &&
  (globalThis as { location?: { hash: string } }).location?.hash === '#smoke';

export default function App() {
  // Inter from Google Fonts, one family per face (Expo Go has no font
  // resources, so faces can't share a family name there).
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_700Bold_Italic,
  });
  const device = useColorScheme();
  const [setting, setSetting] = useState<SchemeSetting>('auto');

  const chrome = useMemo<Chrome>(() => {
    const effective =
      setting === 'auto' ? (device === 'dark' ? 'dark' : 'light') : setting;
    return { effective, setting, setSetting, p: PALETTES[effective] };
  }, [device, setting]);

  if (SMOKE) return <WebSmoke />;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ChromeProvider value={chrome}>
        <Shell />
      </ChromeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { p, effective, setting, setSetting } = useChrome();
  const [index, setIndex] = useState(0);

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <StatusBar style={effective === 'dark' ? 'light' : 'dark'} />

      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <UIText variant="title">Markdown</UIText>
            <View style={[styles.badge, { backgroundColor: p.accentSoft }]}>
              <Text style={[styles.badgeText, { color: p.accent }]}>v1</Text>
            </View>
          </View>
          <Segmented
            compact
            label="Appearance"
            value={setting}
            onChange={setSetting}
            options={SCHEMES}
            style={styles.scheme}
          />
        </View>
      </SafeAreaView>

      {/* Every screen stays mounted: switching tabs keeps their state. */}
      <View style={styles.screen}>
        {SCREENS.map((screen, i) => (
          <View
            key={screen.name}
            style={i === index ? styles.screen : styles.hidden}
          >
            <screen.component />
          </View>
        ))}
      </View>

      <SafeAreaView
        edges={['bottom']}
        style={[
          styles.tabBar,
          { backgroundColor: p.bg, borderTopColor: p.border },
        ]}
      >
        <View style={styles.tabs}>
          {SCREENS.map((screen, i) => {
            const selected = i === index;
            return (
              <Pressable
                key={screen.name}
                accessibilityRole="tab"
                accessibilityLabel={screen.name}
                accessibilityState={{ selected }}
                onPress={() => setIndex(i)}
                style={styles.tab}
              >
                <View
                  style={[
                    styles.tabPill,
                    selected && { backgroundColor: p.accentSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabGlyph,
                      { color: selected ? p.accent : p.muted },
                    ]}
                  >
                    {screen.glyph}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: selected ? p.accent : p.muted },
                    selected && { fontFamily: FONT.semibold },
                  ]}
                >
                  {screen.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontFamily: FONT.bold, fontSize: 11, letterSpacing: 0.4 },
  scheme: { minWidth: 168 },
  screen: { flex: 1 },
  hidden: { display: 'none' },
  tabBar: { borderTopWidth: StyleSheet.hairlineWidth },
  tabs: { flexDirection: 'row', paddingTop: 6, paddingBottom: 4 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabPill: {
    minWidth: 56,
    alignItems: 'center',
    paddingVertical: 3,
    borderRadius: 999,
  },
  tabGlyph: { fontSize: 17 },
  tabLabel: { fontFamily: FONT.medium, fontSize: 11 },
});
