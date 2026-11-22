import { Appearance, type ColorSchemeName } from 'react-native';

type Scheme = ColorSchemeName | null | undefined;

/**
 * react-native-web has no `Appearance.setColorScheme`, so `useColorScheme()`
 * (which the markdown theme reads) always follows the browser. This shim adds
 * the method: it keeps an override and patches `getColorScheme` and
 * `addChangeListener`, which RNW's `useColorScheme` reads off the object at call time.
 */
type Listener = (preferences: { colorScheme: Scheme }) => void;

let override: 'light' | 'dark' | null = null;
const listeners = new Set<Listener>();

const originalGet = Appearance.getColorScheme.bind(Appearance);
const originalAdd = Appearance.addChangeListener.bind(Appearance);

const mutable = Appearance as unknown as {
  getColorScheme: () => Scheme;
  addChangeListener: (listener: Listener) => { remove: () => void };
  setColorScheme: (scheme: Scheme) => void;
};

mutable.getColorScheme = () => override ?? originalGet();

mutable.addChangeListener = (listener) => {
  listeners.add(listener);
  // Browser changes are ignored while a scheme is pinned.
  const sub = originalAdd((prefs) => {
    if (override === null) listener(prefs);
  });
  return {
    remove: () => {
      listeners.delete(listener);
      sub.remove();
    },
  };
};

mutable.setColorScheme = (scheme) => {
  override = scheme === 'light' || scheme === 'dark' ? scheme : null;
  const colorScheme = mutable.getColorScheme();
  listeners.forEach((listener) => listener({ colorScheme }));
};
