/**
 * `__DEV__` as React Native and Jest define it; false when absent. A local
 * copy so the React-free modules (chunking) need no `react-native` import.
 */
export function isDev(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}
