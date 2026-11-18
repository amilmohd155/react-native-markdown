import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import type { FootnoteFocusStore } from './footnoteFocus';

/**
 * Reports where a footnote definition sits in the footnote section (P3-15),
 * so a press can scroll to it. `y` is relative to the section, the parent.
 */
export function FootnoteFrame({
  store,
  label,
  children,
}: {
  readonly store: FootnoteFocusStore;
  readonly label: string;
  readonly children: ReactNode;
}) {
  useEffect(() => () => store.setDefinitionY(label, undefined), [store, label]);
  return (
    <View
      collapsable={false}
      onLayout={(event) =>
        store.setDefinitionY(label, event.nativeEvent.layout.y)
      }
    >
      {children}
    </View>
  );
}
