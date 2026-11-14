import { Platform } from 'react-native';

export function deviceInfo() {
  // `Platform.constants` is undefined on web.
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  return {
    os: Platform.OS,
    osVersion: Platform.Version,
    model: c.Model ?? c.model ?? null,
    brand: c.Brand ?? null,
    userAgent:
      typeof navigator !== 'undefined' && Platform.OS === 'web'
        ? navigator.userAgent
        : null,
    hermes: (globalThis as { HermesInternal?: unknown }).HermesInternal != null,
    dev: __DEV__,
  };
}

/**
 * Logs `value` as JSON in lines under Android's ~4 KB logcat limit:
 * `[tag i/n] <chunk>`. Reassemble by joining the chunks in order:
 *   adb logcat -d -s ReactNativeJS -v raw | grep '^\[bench'
 */
export function logChunked(tag: string, value: unknown) {
  const json = JSON.stringify(value);
  const size = 3000;
  const n = Math.max(1, Math.ceil(json.length / size));
  for (let i = 0; i < n; i++) {
    console.log(
      `[${tag} ${i + 1}/${n}] ${json.slice(i * size, (i + 1) * size)}`
    );
  }
}
