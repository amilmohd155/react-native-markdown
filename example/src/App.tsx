import { useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { V0Demo } from './screens/V0Demo';
import { V1Parse } from './screens/V1Parse';

const SCREENS: { name: string; component: ComponentType }[] = [
  { name: 'v0 demo', component: V0Demo },
  { name: 'v1 parse', component: V1Parse },
];

export default function App() {
  const [index, setIndex] = useState(0);
  const Screen = SCREENS[index]!.component;

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
