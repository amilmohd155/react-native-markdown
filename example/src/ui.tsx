import { createContext, useContext, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

/**
 * Shared look of the example app: a palette that follows the light/dark
 * setting, Inter for the UI, and a few small controls. The library's own
 * theme is separate (see the Playground's options); the chrome only matches
 * its colours so the page and the rendered markdown read as one surface.
 */

export type SchemeSetting = 'auto' | 'light' | 'dark';

export interface Palette {
  readonly bg: string;
  readonly surface: string;
  readonly raised: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly accentSoft: string;
  readonly scrim: string;
}

export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#ffffff',
    surface: '#f6f8fa',
    raised: '#ffffff',
    border: '#d1d9e0',
    text: '#1f2328',
    muted: '#59636e',
    accent: '#0969da',
    onAccent: '#ffffff',
    accentSoft: '#ddf4ff',
    scrim: 'rgba(31, 35, 40, 0.45)',
  },
  dark: {
    bg: '#0d1117',
    surface: '#151b23',
    raised: '#1c2430',
    border: '#3d444d',
    text: '#e6edf3',
    muted: '#9198a1',
    accent: '#4493f8',
    onAccent: '#0d1117',
    accentSoft: '#142841',
    scrim: 'rgba(1, 4, 9, 0.7)',
  },
};

export interface Chrome {
  /** The scheme in use: the setting, or the device scheme for `'auto'`. */
  readonly effective: 'light' | 'dark';
  readonly setting: SchemeSetting;
  readonly setSetting: (setting: SchemeSetting) => void;
  readonly p: Palette;
}

const ChromeContext = createContext<Chrome | null>(null);

export function ChromeProvider({
  value,
  children,
}: {
  value: Chrome;
  children: ReactNode;
}) {
  return (
    <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
  );
}

export function useChrome(): Chrome {
  const chrome = useContext(ChromeContext);
  if (!chrome) throw new Error('useChrome outside <ChromeProvider>');
  return chrome;
}

/** Inter faces loaded in App (one family per face, as Expo Go needs). */
export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const MONO = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
});

type Variant = 'title' | 'heading' | 'label' | 'body' | 'caption' | 'mono';

const VARIANTS: Record<Variant, TextStyle> = {
  title: { fontFamily: FONT.bold, fontSize: 20, letterSpacing: -0.3 },
  heading: { fontFamily: FONT.semibold, fontSize: 16 },
  label: { fontFamily: FONT.medium, fontSize: 13 },
  body: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: FONT.regular, fontSize: 12 },
  mono: { fontFamily: MONO, fontSize: 12 },
};

/** Text in the chrome's font and palette. */
export function UIText({
  variant = 'body',
  muted = false,
  color,
  style,
  children,
  ...rest
}: {
  variant?: Variant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const { p } = useChrome();
  return (
    <Text
      {...rest}
      style={[
        VARIANTS[variant],
        { color: color ?? (muted ? p.muted : p.text) },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** A row of mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  compact = false,
  style,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { p } = useChrome();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.segmented,
        { backgroundColor: p.surface, borderColor: p.border },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              compact && styles.segmentCompact,
              selected && { backgroundColor: p.raised, borderColor: p.border },
              selected && styles.segmentSelected,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                compact && styles.segmentTextCompact,
                { color: selected ? p.text : p.muted },
                selected && { fontFamily: FONT.semibold },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** An on/off pill. */
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { p } = useChrome();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[
        styles.toggle,
        value
          ? { backgroundColor: p.accent, borderColor: p.accent }
          : { backgroundColor: p.surface, borderColor: p.border },
      ]}
    >
      <Text
        style={[
          styles.toggleText,
          { color: value ? p.onAccent : p.text },
          value && { fontFamily: FONT.semibold },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A labelled group of controls. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <UIText variant="caption" muted style={styles.fieldLabel}>
        {label.toUpperCase()}
      </UIText>
      {children}
    </View>
  );
}

/** A rounded surface. */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { p } = useChrome();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: p.surface, borderColor: p.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A solid or outlined button. */
export function Button({
  label,
  onPress,
  disabled = false,
  tone = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'quiet';
  style?: StyleProp<ViewStyle>;
}) {
  const { p } = useChrome();
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: p.accent, borderColor: p.accent }
          : { backgroundColor: p.surface, borderColor: p.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[styles.buttonText, { color: primary ? p.onAccent : p.text }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentCompact: { paddingVertical: 5, paddingHorizontal: 10 },
  segmentSelected: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontFamily: FONT.medium, fontSize: 13 },
  segmentTextCompact: { fontSize: 12 },
  toggle: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggleText: { fontFamily: FONT.medium, fontSize: 13 },
  field: { gap: 8 },
  fieldLabel: { letterSpacing: 0.8, fontFamily: FONT.semibold },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  button: {
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonText: { fontFamily: FONT.semibold, fontSize: 14 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
