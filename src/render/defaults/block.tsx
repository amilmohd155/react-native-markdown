import { useContext } from 'react';
import {
  Image as RNImage,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import type { ElementStyle } from '../../theme';
import {
  InheritedTextContext,
  ListMarkerContext,
  useRenderContext,
} from '../contexts';
import type { ElementProps } from '../elements';

/**
 * Default block elements. Spec: docs/rewrite/03-architecture.md#default-elements
 *
 * Text blocks (Heading, Paragraph, HtmlBlock) are a single <Text> with the
 * container style applied to it directly: one native view per block.
 */

/** Text props shared by block text: style cascade and text options. */
function useBlockText(style: ElementStyle, extra?: StyleProp<TextStyle>) {
  const { options } = useRenderContext();
  const inherited = useContext(InheritedTextContext);
  return {
    style: [style.container, style.text, inherited, extra],
    selectable: options.selectable,
    maxFontSizeMultiplier: options.maxFontSizeMultiplier ?? undefined,
  };
}

export function Heading({ style, children }: ElementProps<'Heading'>) {
  return (
    <Text accessibilityRole="header" {...useBlockText(style)}>
      {children}
    </Text>
  );
}

export function Paragraph({ style, children }: ElementProps<'Paragraph'>) {
  return <Text {...useBlockText(style)}>{children}</Text>;
}

export function Blockquote({ style, children }: ElementProps<'Blockquote'>) {
  return (
    <View style={style.container}>
      <InheritedTextContext.Provider value={style.text}>
        {children}
      </InheritedTextContext.Provider>
    </View>
  );
}

export function List({ style, children }: ElementProps<'List'>) {
  return <View style={style.container}>{children}</View>;
}

/** Space between the marker column and the item content. */
const MARKER_GAP = 6;

export function ListItem({
  index,
  ordered,
  marker,
  checked,
  style,
  children,
}: ElementProps<'ListItem'>) {
  const { theme, handlers, options } = useRenderContext();
  const markerChars = useContext(ListMarkerContext);
  const inherited = useContext(InheritedTextContext);

  // Same width for every item of the list, from its longest marker, so
  // "9." and "10." stay aligned (right-aligned when ordered).
  const { fontSize, spacing } = theme.tokens;
  const width = Math.max(
    spacing.listIndent,
    Math.ceil(markerChars * fontSize.base * 0.6) + MARKER_GAP
  );

  let markerNode;
  if (checked === null) {
    markerNode = (
      <Text
        style={[style.text, inherited, ordered && styles.markerOrdered]}
        accessible={false}
      >
        {marker}
      </Text>
    );
  } else {
    const toggle = options.interactiveTasks
      ? () => handlers.current.onTaskToggle?.(!checked, { index })
      : undefined;
    markerNode = (
      <Text
        style={[style.text, inherited]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: toggle === undefined }}
        onPress={toggle}
        suppressHighlighting
      >
        {checked ? '☑' : '☐'}
      </Text>
    );
  }

  return (
    <View style={style.container}>
      <View style={[styles.markerColumn, { width }]}>{markerNode}</View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

export function CodeBlock({ code, style }: ElementProps<'CodeBlock'>) {
  const { options } = useRenderContext();
  return (
    <View style={style.container}>
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
      >
        <Text
          style={style.text}
          selectable={options.selectable}
          maxFontSizeMultiplier={options.maxFontSizeMultiplier ?? undefined}
        >
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

export function Divider({ style }: ElementProps<'Divider'>) {
  return <View style={style.container} />;
}

export function HtmlBlock({ html, style }: ElementProps<'HtmlBlock'>) {
  return (
    <Text {...useBlockText(style)}>
      {html.endsWith('\n') ? html.slice(0, -1) : html}
    </Text>
  );
}

/**
 * Basic block image: full width with a fixed aspect ratio. The image task
 * adds the cached aspect ratio (Image.getSize) and the image policy.
 */
export function Image({ src, alt, style }: ElementProps<'Image'>) {
  return (
    <View style={style.container}>
      <RNImage
        source={{ uri: src }}
        accessibilityLabel={alt}
        resizeMode="contain"
        style={styles.blockImage}
      />
    </View>
  );
}

/** Basic table; the table task adds cached column widths. */
export function Table({ style, children }: ElementProps<'Table'>) {
  return (
    <ScrollView
      horizontal
      bounces={false}
      style={style.container}
      showsHorizontalScrollIndicator={false}
    >
      <View>{children}</View>
    </ScrollView>
  );
}

export function TableRow({ style, children }: ElementProps<'TableRow'>) {
  return <View style={style.container}>{children}</View>;
}

const CELL_ALIGN = {
  left: undefined,
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
} as const;

export function TableCell({
  align,
  style,
  children,
}: ElementProps<'TableCell'>) {
  const { options } = useRenderContext();
  return (
    <View style={[style.container, styles.cell]}>
      <Text
        style={[style.text, align === null ? undefined : CELL_ALIGN[align]]}
        selectable={options.selectable}
        maxFontSizeMultiplier={options.maxFontSizeMultiplier ?? undefined}
      >
        {children}
      </Text>
    </View>
  );
}

/** Basic definition row; the footnotes task adds the footer section. */
export function FootnoteDefinition({
  index,
  style,
  children,
}: ElementProps<'FootnoteDefinition'>) {
  return (
    <View style={style.container}>
      <Text style={[style.text, styles.footnoteLabel]}>{index}.</Text>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  markerColumn: { paddingRight: MARKER_GAP },
  markerOrdered: { textAlign: 'right' },
  content: { flex: 1, minWidth: 0 },
  blockImage: { width: '100%', aspectRatio: 16 / 9 },
  cell: { minWidth: 80, maxWidth: 240 },
  footnoteLabel: { minWidth: 24 },
});
