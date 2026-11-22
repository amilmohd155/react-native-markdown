import { Text, type TextStyle, type ViewStyle } from 'react-native';
import { useCallback, type ComponentType } from 'react';
import { useRenderContext } from '../render/contexts';
import type { MentionPressInfo } from '../render/context';
import { pressMention } from '../render/links';
import type { ElementProps } from '../render/elements';

/** Props of the `Mention` element: from the link `[label](scheme://id)`. */
export type MentionAttrs = {
  scheme: string;
  id: string;
  label: string;
  /** The raw link destination. */
  url: string;
};

declare module '@docren/react-native-markdown' {
  interface PluginElementPropsMap {
    Mention: MentionAttrs;
  }
  // The theme key of the element: flat props, text props to its text, the
  // rest to its container.
  interface PluginThemeMap {
    Mention?: TextStyle & ViewStyle;
  }
}

/**
 * A press handler for a custom `components.Mention`: it does what the default
 * component does, calling `onMentionPress` or, without one, `onLinkPress`
 * with the raw url. Call it inside a `Mention` component.
 */
export function useMentionPress(): (info: MentionPressInfo) => void {
  const { handlers } = useRenderContext();
  return useCallback(
    (info: MentionPressInfo) => pressMention(handlers, info),
    [handlers]
  );
}

/**
 * Default `Mention`: nested text like a link, styled by the `Mention` theme key
 * and, without one, by `link`.
 */
export const Mention: ComponentType<ElementProps<'Mention'>> =
  function Mention({ scheme, id, label, url, style }) {
    const { theme } = useRenderContext();
    const press = useMentionPress();
    // Plugin elements have no token style: without an override use Link's.
    const own = theme.pluginElements.Mention;
    const resolved = own === undefined ? theme.elements.Link : style;
    return (
      <Text
        style={resolved.text}
        accessibilityRole="link"
        accessibilityLabel={label}
        onPress={() => press({ scheme, id, url, label })}
      >
        {label}
      </Text>
    );
  };
