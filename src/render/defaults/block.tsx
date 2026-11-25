import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image as RNImage,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { ElementStyle, ThemeTokens } from '../../theme';
import {
  InheritedTextContext,
  ListGapContext,
  ListMarkerContext,
  TextResetContext,
  TableLayoutContext,
  useRenderContext,
  type TableCellSize,
} from '../contexts';
import { checkboxHitSlop } from '../checkbox';
import { codeLayout, PlainCodeBody } from './codeBlockLayout';
import {
  CodeBlockShell,
  useCodeBlockHeader,
  useCodeBlockWrap,
} from './codeBlockShell';
import type { ElementProps } from '../elements';
import { cachedImageSize, retryImageSize, useImageSize } from '../imageSize';
import { useImageErrorReport } from '../useImageErrorReport';
import { useTaskState } from '../useTaskState';
import { useFootnoteFlash } from '../useFootnoteFlash';
import { measuringSize } from '../tableLayout';
import { useTableWidths } from '../useTableWidths';

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
      {/* Replaces the inherited text style, so a checked item's reset (for
          sub-lists) no longer applies: a list in here keeps this style. */}
      <TextResetContext.Provider value={undefined}>
        <InheritedTextContext.Provider value={style.text}>
          {children}
        </InheritedTextContext.Provider>
      </TextResetContext.Provider>
    </View>
  );
}

export function List({ style, children }: ElementProps<'List'>) {
  return <View style={style.container}>{children}</View>;
}

/** Black or white, whichever reads on `bg` (`#rgb`/`#rrggbb`; else white). */
function contrastOn(bg: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg)?.[1];
  if (!hex) return '#ffffff';
  const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 160 ? '#0d1117' : '#ffffff';
}

/** Checkbox size as a fraction of the list font size, when `size` is unset. */
const CHECKBOX_SIZE = 0.9;

export function ListItem({
  index,
  ordered,
  marker,
  checked,
  taskIndex,
  text,
  style,
  children,
}: ElementProps<'ListItem'>) {
  const { theme } = useRenderContext();
  const task = useTaskState(taskIndex, checked, text);
  const markerChars = useContext(ListMarkerContext);
  const gap = useContext(ListGapContext);
  const inherited = useContext(InheritedTextContext);

  // Same width for every item of the list, from its longest marker, so
  // "9." and "10." stay aligned (right-aligned when ordered).
  const { fontSize, list, checkbox } = theme.tokens;
  const textSize = style.text.fontSize ?? fontSize.base;
  const boxSize = checkbox.size ?? textSize * CHECKBOX_SIZE;
  const width = Math.max(
    list.indent,
    Math.max(
      list.markerMinWidth,
      Math.ceil(markerChars * fontSize.base * 0.6)
    ) + list.gap,
    checked === null ? 0 : Math.floor(boxSize) + list.gap
  );
  const shown = task.checked;

  // A checked item's own text, never its sub-lists' (`InheritedTextReset`).
  const checkedText = useMemo(
    () =>
      shown && checkbox.checkedText !== false
        ? { ...inherited, ...checkbox.checkedText }
        : null,
    [shown, checkbox.checkedText, inherited]
  );

  let markerNode;
  // Room above and below a box taller than its line; the text drops by it.
  let extra = 0;
  if (checked === null) {
    markerNode = (
      <Text
        style={[
          style.text,
          inherited,
          ordered ? list.orderedStyle : list.bulletStyle,
        ]}
        accessible={false}
      >
        {marker}
      </Text>
    );
  } else {
    // The drawn box is the visual; the Pressable is the touch target. Its
    // box is one line tall (a bigger box overflows it evenly), so `hitSlop` tops it up (44pt wide, as tall as
    // the gap to the next item allows: see `checkboxHitSlop`).
    const lineHeight =
      style.text.lineHeight ??
      (textSize * theme.tokens.paragraphLineHeight) / fontSize.base;
    extra = Math.max(0, (boxSize - lineHeight) / 2);
    const accent = shown
      ? (checkbox.checkedColor ?? checkbox.color)
      : (checkbox.borderColor ?? checkbox.color);
    const tint = accent ?? theme.tokens.colors.text;
    const border = Math.max(1, Math.round(boxSize / 10));
    markerNode = (
      <Pressable
        style={[
          styles.checkbox,
          { height: lineHeight },
          extra > 0 && { marginVertical: extra },
        ]}
        accessibilityRole="checkbox"
        accessibilityLabel={text ? text : undefined}
        accessibilityState={{ checked: shown, disabled: !task.interactive }}
        disabled={!task.interactive}
        onPress={task.interactive ? task.toggle : undefined}
        hitSlop={checkboxHitSlop(boxSize, lineHeight, gap, width)}
      >
        <View
          testID="task-checkbox"
          style={[
            styles.box,
            {
              width: boxSize,
              height: boxSize,
              borderWidth: border,
              borderColor: tint,
              borderRadius: checkbox.borderRadius ?? boxSize * 0.2,
              backgroundColor: shown ? tint : undefined,
            },
          ]}
        >
          {shown && (
            <View
              testID="task-checkmark"
              style={{
                width: boxSize * 0.28,
                height: boxSize * 0.52,
                borderRightWidth: border,
                borderBottomWidth: border,
                borderColor: checkbox.checkmarkColor ?? contrastOn(tint),
                transform: [
                  { rotate: '45deg' },
                  { translateY: -boxSize * 0.07 },
                ],
              }}
            />
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View
      style={
        index > 0 && list.itemSpacing > 0
          ? [style.container, { marginTop: list.itemSpacing }]
          : style.container
      }
    >
      <View style={[{ width, paddingRight: list.gap }]}>{markerNode}</View>
      <View style={[styles.content, extra > 0 && { marginTop: extra }]}>
        {checkedText === null ? (
          children
        ) : (
          <TextResetContext.Provider value={inherited}>
            <InheritedTextContext.Provider value={checkedText}>
              {children}
            </InheritedTextContext.Provider>
          </TextResetContext.Provider>
        )}
      </View>
    </View>
  );
}

export function CodeBlock({
  code,
  language,
  meta,
  open,
  style,
}: ElementProps<'CodeBlock'>) {
  const { options, theme } = useRenderContext();
  const { wrap, toggleWrap } = useCodeBlockWrap();
  const header = useCodeBlockHeader({
    code,
    language,
    meta,
    open,
    wrap,
    onToggleWrap: toggleWrap,
  });
  const { lineNumbers } = options.codeBlock;
  return (
    <CodeBlockShell
      code={code}
      style={style.container}
      header={header}
      // Numbered bodies are hidden from accessibility: the label reads them.
      labelled={lineNumbers}
    >
      <PlainCodeBody
        code={code}
        layout={codeLayout({ lineNumbers, wrap })}
        textStyle={style.text}
        gutterStyle={theme.codeBlockGutter}
        selectable={options.selectable}
        maxFontSizeMultiplier={options.maxFontSizeMultiplier ?? undefined}
      />
    </CodeBlockShell>
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
 * Box of a block image: `aspectRatio` > `maxHeight` > `height`, else the
 * natural ratio (`ratio` stands in until the size is known).
 */
function blockImageSize(
  sizing: ThemeTokens['imageSizing'],
  size: { readonly width: number; readonly height: number } | null,
  ratio: number
): ImageStyle {
  const natural = size === null ? ratio : size.width / size.height;
  switch (sizing.mode) {
    case 'ratio':
      return { aspectRatio: ratio };
    case 'maxHeight':
      return { aspectRatio: natural, maxHeight: sizing.maxHeight };
    case 'height':
      return { height: sizing.height };
    default:
      return { aspectRatio: natural };
  }
}

/** Frame of a block image; fades with `opacity` when given. */
function ImageFrame({
  style,
  opacity,
  children,
}: {
  readonly style: StyleProp<ViewStyle>;
  readonly opacity: Animated.Value | undefined;
  readonly children: ReactNode;
}) {
  return opacity === undefined ? (
    <View style={style}>{children}</View>
  ) : (
    <Animated.View style={[style, { opacity }]}>{children}</Animated.View>
  );
}

/**
 * Block image at full width (never wider than its natural size), with its
 * real aspect ratio from the size cache. While the size is unknown, a quiet
 * placeholder box (theme `imageRatio`, `codeBg` fill) reserves the space, so
 * an image of that ratio never moves what is below it. The loaded box
 * follows `imageSizing` (ratio, `maxHeight`, fixed `height`, else natural)
 * and `resizeMode`. Images that fail to load show their alt text instead.
 */
export function Image({ src, alt, title, style }: ElementProps<'Image'>) {
  const { theme, handlers, options } = useRenderContext();
  const provided = options.imageSizes?.[src];
  const size = useImageSize(src, provided);
  const { colors } = theme.tokens;
  const { fadeDuration } = theme.tokens.imageSizing;
  // `image.borderRadius`: clips the loaded image too (the container does not).
  const radius = style.container.borderRadius;
  // Fade only an image whose size was unknown on the first render: a known
  // size (cached or provided) means the image is likely ready already.
  const [fades] = useState(
    () => fadeDuration > 0 && cachedImageSize(src, provided) === undefined
  );
  const [opacity] = useState(() => new Animated.Value(fades ? 0 : 1));
  const [loaded, setLoaded] = useState(!fades);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      animation.current?.stop();
    };
  }, []);
  const failed = size === 'error';
  useImageErrorReport(src, alt, title, size, provided);

  if (failed) {
    return (
      <Pressable
        style={[
          style.container,
          styles.imageFallback,
          { backgroundColor: colors.codeBg, borderColor: colors.border },
        ]}
        accessibilityRole="button"
        accessibilityLabel={alt === '' ? src : alt}
        accessibilityHint="Retry loading the image"
        onPress={() => retryImageSize(src)}
      >
        <Text style={{ color: colors.muted }}>{alt === '' ? src : alt}</Text>
      </Pressable>
    );
  }

  const onLoad = () => {
    if (!fades || loaded) return;
    setLoaded(true);
    const start = (reduce: boolean) => {
      if (unmounted.current) return;
      if (reduce) {
        opacity.setValue(1);
        return;
      }
      animation.current = Animated.timing(opacity, {
        toValue: 1,
        duration: fadeDuration,
        // The web has no native driver; asking for it warns.
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false,
      });
      animation.current.start();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(start, () => start(false));
  };

  const { imageSizing, imageRatio } = theme.tokens;
  // An empty alt marks a decorative image: hidden from screen readers.
  const decorative = alt === '';
  const image = (
    <RNImage
      source={{ uri: src }}
      onLoad={onLoad}
      // Android's own fade would hide the library's (and add one to images
      // whose size is known): the fade is `fadeDuration`.
      fadeDuration={0}
      accessible={decorative ? false : undefined}
      aria-hidden={decorative ? true : undefined}
      importantForAccessibility={decorative ? 'no' : undefined}
      accessibilityLabel={alt}
      accessibilityHint={title ?? undefined}
      // Always set: Android keeps the last native state when it goes undefined.
      // The web drops `accessibilityState`, so it gets `aria-busy` too.
      accessibilityState={{ busy: size === null }}
      aria-busy={size === null ? true : undefined}
      resizeMode={imageSizing.resizeMode}
      style={[
        styles.blockImage,
        {
          ...blockImageSize(imageSizing, size, imageRatio),
          ...(size === null || !loaded
            ? {
                backgroundColor: colors.codeBg,
                // A hairline keeps the box visible when `codeBg` matches the
                // page (a dark theme); it is inside the box, so no size change.
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                borderRadius: radius ?? theme.tokens.radius.code,
              }
            : { borderRadius: radius }),
        },
      ]}
    />
  );
  // The frame caps the width at the natural size; the image fills the
  // frame. (Yoga derives an aspect-ratio height from `width` before
  // applying `maxWidth`, so both can't sit on the image itself.)
  return (
    <View style={style.container}>
      <ImageFrame
        style={[
          styles.imageFrame,
          size === null ? undefined : { maxWidth: size.width },
        ]}
        opacity={fades ? opacity : undefined}
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
      </ImageFrame>
    </View>
  );
}

/**
 * Table in a horizontal ScrollView, with fixed column widths: on first
 * render every cell reports its natural width (bounded by a ceiling of about
 * twice the window), then each column takes its widest cell. The natural
 * widths are cached per table content and theme, so remounts skip the
 * measuring pass; the cap (`tableColumns.max`, or the container if narrower)
 * is applied when rendering, so a resize needs no re-measure (P3-37).
 *
 * While the table sits in the open block of a stream its widths are a
 * grow-only seed applied as `minWidth`: nothing is hidden or stored, a wider
 * cell grows its column. On close the seed becomes the final widths (stored,
 * no hidden pass); with no seed it measures hidden once.
 */
export function Table({ style, align, children }: ElementProps<'Table'>) {
  const { theme } = useRenderContext();
  const { layout, hidden, pass, onLayout } = useTableWidths(align.length);

  const { align: frameAlign, bleed } = theme.tableFrame;
  const frame = useMemo(
    () =>
      frameAlign === null && bleed === 0
        ? null
        : splitTableFrame(style.container, frameAlign, bleed),
    [style.container, frameAlign, bleed]
  );

  return (
    <ScrollView
      horizontal
      bounces={false}
      style={frame === null ? style.container : frame.outer}
      contentContainerStyle={frame?.content}
      showsHorizontalScrollIndicator={false}
      onLayout={onLayout}
    >
      {/* Hidden while measuring, so unaligned columns never show. */}
      <View
        key={pass}
        style={
          frame === null
            ? hidden
              ? styles.measuring
              : undefined
            : [frame.border, hidden ? styles.measuring : undefined]
        }
      >
        <TableLayoutContext.Provider value={layout}>
          {children}
        </TableLayoutContext.Provider>
      </View>
    </ScrollView>
  );
}

/**
 * `table.align` and `horizontalOverflow` need the border on the table itself
 * (not the full-width scroll view): the scroll view keeps the margins and
 * bleeds out by `bleed` (padded back so the table starts in line), and its
 * content aligns a table narrower than the container.
 */
function splitTableFrame(
  container: ViewStyle | undefined,
  align: 'left' | 'center' | 'right' | null,
  bleed: number
) {
  const { borderColor, borderWidth, borderRadius, ...outer } =
    StyleSheet.flatten(container) ?? {};
  return {
    outer: {
      ...outer,
      ...(bleed > 0 && { marginHorizontal: -bleed }),
    } as ViewStyle,
    content: {
      flexGrow: 1,
      paddingHorizontal: bleed,
      justifyContent: ALIGN_JUSTIFY[align ?? 'left'],
    } as ViewStyle,
    border: {
      borderColor,
      borderWidth,
      borderRadius,
      overflow: borderRadius ? 'hidden' : undefined,
    } as ViewStyle,
  };
}

const ALIGN_JUSTIFY = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
} as const;

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
  const { options, theme } = useRenderContext();
  const layout = useContext(TableLayoutContext);
  const measuring = layout !== null && layout.sizes === null;
  const reporting = layout !== null && (layout.sizes === null || layout.grow);
  const size: TableCellSize =
    layout === null
      ? measuringSize(theme.tableColumns)
      : (layout.sizes?.[column] ?? layout.measureSize);
  const [identity] = useState(() => ({}));
  useLayoutEffect(
    () => (measuring ? layout.enroll(identity) : undefined),
    [measuring, layout, identity]
  );

  return (
    <View
      style={[style.container, size]}
      onLayout={
        reporting
          ? (event) =>
              layout.report(identity, column, event.nativeEvent.layout.width)
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

/**
 * One footnote: its number and its content. The back-links are inline
 * `FootnoteBackLink` elements at the end of the content (P3-13).
 */
export function FootnoteDefinition({
  label,
  index,
  style,
  children,
}: ElementProps<'FootnoteDefinition'>) {
  const inherited = useContext(InheritedTextContext);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const flash = useFootnoteFlash(`d:${label}`, ref);
  const parts = (
    <>
      <Text style={[inherited, style.text, styles.footnoteLabel]}>
        {`${index}.`}
      </Text>
      <View style={styles.content}>{children}</View>
    </>
  );
  // Animated components force `collapsable={false}`: use one only while flashing.
  if (flash.style) {
    return (
      <Animated.View
        ref={ref}
        style={[style.container, flash.style]}
        accessible={flash.focused ? true : undefined}
      >
        {parts}
      </Animated.View>
    );
  }
  return (
    <View
      ref={ref}
      style={style.container}
      accessible={flash.focused ? true : undefined}
    >
      {parts}
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: { alignSelf: 'flex-start', justifyContent: 'center' },
  box: { alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, minWidth: 0 },
  imageFrame: { width: '100%' },
  blockImage: { width: '100%' },
  imageFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 12,
  },
  measuring: { opacity: 0 },
  footnoteLabel: { minWidth: 24 },
});
