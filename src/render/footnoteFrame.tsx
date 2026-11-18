import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import type { FootnoteFocusStore } from './footnoteFocus';

/**
 * Reports where a footnote definition sits in the footnote block (P3-15), so
 * a press can scroll to it. The layout `y` is relative to the section, the
 * parent; `inset` (the section's top margin) adds the gap between the block's
 * top, where a scroll lands, and the section.
 */
export function FootnoteFrame({
  store,
  label,
  inset,
  children,
}: {
  readonly store: FootnoteFocusStore;
  readonly label: string;
  readonly inset: number;
  readonly children: ReactNode;
}) {
  useEffect(() => () => store.setDefinitionY(label, undefined), [store, label]);
  return (
    <View
      collapsable={false}
      onLayout={(event) =>
        store.setDefinitionY(label, inset + event.nativeEvent.layout.y)
      }
    >
      {children}
    </View>
  );
}
