import { useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_700Bold,
  Inter_700Bold_Italic,
  useFonts,
} from '@expo-google-fonts/inter';
import { Bench } from './screens/Bench';
import { FontLab } from './screens/FontLab';
import { V0Demo } from './screens/V0Demo';
import { V1Preview } from './screens/V1Preview';

const SCREENS: { name: string; component: ComponentType }[] = [
  { name: 'v1 preview', component: V1Preview },
  { name: 'fonts', component: FontLab },
  { name: 'v0 demo', component: V0Demo },
  { name: 'bench', component: Bench },
];

export default function App() {
  const [index, setIndex] = useState(0);
  // Inter from Google Fonts, one family per face (Expo Go has no font
  // resources, so faces can't share a family name there).
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_700Bold,
    Inter_700Bold_Italic,
  });
  const Screen = SCREENS[index]!.component;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.tabs}>
          {SCREENS.map((screen, i) => (
            <Pressable
              key={screen.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === index }}
              onPress={() => setIndex(i)}
              style={[styles.tab, i === index && styles.tabActive]}
            >
              <Text style={i === index ? styles.tabTextActive : styles.tabText}>
                {screen.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.screen}>
          <Screen />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d7de',
  },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  tabActive: { backgroundColor: '#0969da' },
  tabText: { color: '#1f2328' },
  tabTextActive: { color: '#ffffff', fontWeight: '600' },
  screen: { flex: 1 },
});
