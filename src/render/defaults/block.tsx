import { useContext, useMemo, useState } from 'react';
import {
  Image as RNImage,
  Pressable,
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
  TableKeyContext,
  TableLayoutContext,
  useRenderContext,
  type TableLayout,
} from '../contexts';
import type { ElementProps } from '../elements';
import { useImageSize } from '../imageSize';
import {
  cachedColumnWidths,
  columnWidths,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  storeColumnWidths,
} from '../tableLayout';

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

/** Task checkbox glyphs, forced to text presentation (U+FE0E), never emoji. */
const CHECKED = '☑\uFE0E';
const UNCHECKED = '☐\uFE0E';

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
        {checked ? CHECKED : UNCHECKED}
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

/** Aspect ratio of the placeholder box while the image size loads. */
const PLACEHOLDER_RATIO = 16 / 9;

/**
 * Block image at full width (never wider than its natural size), with its
 * real aspect ratio from the size cache. A placeholder box holds the space
 * while the size loads, so the layout doesn't jump more than once. Images
 * that fail to load show their alt text instead.
 */
export function Image({ src, alt, title, style }: ElementProps<'Image'>) {
  const { theme, handlers, options } = useRenderContext();
  const size = useImageSize(src);
  const { colors } = theme.tokens;

  if (size === 'error') {
    return (
      <View
        style={[
          style.container,
          styles.imageFallback,
          { backgroundColor: colors.codeBg, borderColor: colors.border },
        ]}
        accessibilityRole="image"
        accessibilityLabel={alt}
      >
        <Text style={{ color: colors.muted }}>{alt === '' ? src : alt}</Text>
      </View>
    );
  }

  const image = (
    <RNImage
      source={{ uri: src }}
      accessibilityLabel={alt}
      accessibilityHint={title ?? undefined}
      resizeMode="contain"
      style={[
        styles.blockImage,
        size === null
          ? { aspectRatio: PLACEHOLDER_RATIO, backgroundColor: colors.codeBg }
          : { aspectRatio: size.width / size.height },
      ]}
    />
  );

  // The frame caps the width at the natural size; the image fills the
  // frame. (Yoga derives an aspect-ratio height from `width` before
  // applying `maxWidth`, so both can't sit on the image itself.)
  return (
    <View style={style.container}>
      <View
        style={[
          styles.imageFrame,
          size === null ? undefined : { maxWidth: size.width },
        ]}
      >
        {options.interactiveImages ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={alt}
            onPress={() => handlers.current.onImagePress?.(src, { alt, title })}
          >
            {image}
          </Pressable>
        ) : (
          image
        )}
      </View>
    </View>
  );
}

/**
 * Table in a horizontal ScrollView, with fixed column widths: on first
 * render every cell reports its natural width (capped), then each column
 * takes its widest cell. The result is cached per table content and theme,
 * so re-renders and remounts skip the measuring pass.
 */
export function Table({ style, children }: ElementProps<'Table'>) {
  const { theme } = useRenderContext();
  const key = useContext(TableKeyContext);
  const [state, setState] = useState(() => ({
    theme,
    widths: cachedColumnWidths(theme, key),
  }));
  let widths = state.widths;
  if (state.theme !== theme) {
    // New fonts or sizes: use that theme's cached widths, or re-measure.
    widths = cachedColumnWidths(theme, key);
    setState({ theme, widths });
  }

  // One measuring pass per layout object: a new theme or table makes a new
  // one, which starts again with no measurements.
  const layout = useMemo<TableLayout>(() => {
    const pass = { measured: [] as number[], scheduled: false };
    return {
      widths,
      report(column, width) {
        if (widths !== null) return;
        pass.measured[column] = Math.max(pass.measured[column] ?? 0, width);
        if (pass.scheduled) return;
        // Cells lay out in the same frame; collect them all, then commit.
        pass.scheduled = true;
        requestAnimationFrame(() => {
          const final = columnWidths(pass.measured);
          storeColumnWidths(theme, key, final);
          setState({ theme, widths: final });
        });
      },
    };
  }, [widths, theme, key]);

  return (
    <ScrollView
      horizontal
      bounces={false}
      style={style.container}
      showsHorizontalScrollIndicator={false}
    >
      {/* Hidden while measuring, so unaligned columns never show. */}
      <View style={widths === null ? styles.measuring : undefined}>
        <TableLayoutContext.Provider value={layout}>
          {children}
        </TableLayoutContext.Provider>
      </View>
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
  column,
  style,
  children,
}: ElementProps<'TableCell'>) {
  const { options } = useRenderContext();
  const layout = useContext(TableLayoutContext);
  const width = layout?.widths?.[column];
  const measuring = layout !== null && layout.widths === null;

  return (
    <View
      style={[
        style.container,
        width === undefined ? styles.cellMeasure : { width },
      ]}
      onLayout={
        measuring
          ? (event) => layout.report(column, event.nativeEvent.layout.width)
          : undefined
      }
    >
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
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** ↩ with U+FE0E (text presentation): iOS draws an emoji button without it. */
const BACK_LINK = '↩\uFE0E';

/** GitHub-style back-link marks, one per reference: "↩ ↩² ↩³". */
export function backLinks(references: number): string {
  return backLinkMarks(references).join(' ');
}

/** The back-link marks, one per reference. */
function backLinkMarks(references: number): string[] {
  const marks: string[] = [];
  for (let i = 1; i <= references; i++) {
    marks.push(
      i === 1
        ? BACK_LINK
        : BACK_LINK +
            String(i)
              .split('')
              .map((d) => SUPERSCRIPT_DIGITS[Number(d)])
              .join('')
    );
  }
  return marks;
}

/**
 * One footnote: its number, its content, and a back-link mark per
 * reference. The marks aren't pressable yet: jumping to a reference needs
 * the host's scroll view (see the footnotes notes in the plan).
 */
export function FootnoteDefinition({
  label,
  index,
  references,
  style,
  children,
}: ElementProps<'FootnoteDefinition'>) {
  const inherited = useContext(InheritedTextContext);
  const { handlers, options } = useRenderContext();
  return (
    <View style={style.container}>
      <Text style={[inherited, style.text, styles.footnoteLabel]}>
        {`${index}.`}
      </Text>
      <View style={styles.content}>
        {children}
        {references > 0 && options.interactiveFootnotes ? (
          <Text
            style={[inherited, style.text, styles.backLinks]}
            importantForAccessibility="no"
          >
            {backLinkMarks(references).map((mark, i) => (
              <Text
                key={i}
                accessibilityRole="link"
                onPress={() =>
                  handlers.current.onFootnotePress?.(label, {
                    index,
                    direction: 'reference',
                    reference: i + 1,
                  })
                }
              >
                {i === 0 ? mark : ` ${mark}`}
              </Text>
            ))}
          </Text>
        ) : references > 0 ? (
          <Text
            style={[inherited, style.text, styles.backLinks]}
            accessible={false}
            importantForAccessibility="no"
          >
            {backLinks(references)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markerColumn: { paddingRight: MARKER_GAP },
  markerOrdered: { textAlign: 'right' },
  content: { flex: 1, minWidth: 0 },
  imageFrame: { width: '100%' },
  blockImage: { width: '100%' },
  imageFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 12,
  },
  measuring: { opacity: 0 },
  cellMeasure: { minWidth: MIN_COLUMN_WIDTH, maxWidth: MAX_COLUMN_WIDTH },
  footnoteLabel: { minWidth: 24 },
  backLinks: { marginTop: -6, marginBottom: 6 },
});
