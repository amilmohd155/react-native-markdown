import { useContext, type ComponentType } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { InheritedTextContext, useRenderContext } from '../contexts';
import type { ElementProps } from '../elements';
import { useImageSize } from '../imageSize';
import { markInlineView, type InlineViewProps } from '../inlineView';
import { pressLink } from '../links';
import { toSubscript, toSuperscript } from '../scripts';
import { regularFamily } from '../../theme';

/**
 * Default inline elements: nested <Text> inside the block's single <Text>,
 * so a paragraph stays one text layout. Inline styles carry only what they
 * change; everything else is inherited from the block.
 */

export function Strong({ style, children }: ElementProps<'Strong'>) {
  return <Text style={style.text}>{children}</Text>;
}

export function Emphasis({ style, children }: ElementProps<'Emphasis'>) {
  return <Text style={style.text}>{children}</Text>;
}

export function Strikethrough({
  style,
  children,
}: ElementProps<'Strikethrough'>) {
  return <Text style={style.text}>{children}</Text>;
}

export function Underline({ style, children }: ElementProps<'Underline'>) {
  return <Text style={style.text}>{children}</Text>;
}

export function Highlight({ style, children }: ElementProps<'Highlight'>) {
  return <Text style={style.text}>{children}</Text>;
}

/** The glyphs are already small: drop the theme's smaller font size. */
const UNICODE_SCRIPT = { fontSize: undefined } as const;

/** Shift of the `'raised'` fallback, as a fraction of the block font size. */
const SHIFT = { sup: -0.4, sub: 0.2 } as const;

/**
 * Superscript or subscript content (P1-17):
 * 1. plain text whose every character has a Unicode form renders as those
 *    characters, in the paragraph's text run (`mc²`, `H₂O`);
 * 2. otherwise, with `scriptFallback: 'smaller'` (default), smaller text on
 *    the baseline (P1-5);
 * 3. with `scriptFallback: 'raised'`, an inline view shifted up or down.
 *    Text styles don't cross a View, so the block's text colour, font and
 *    inherited style are re-applied inside it; link or bold styles around
 *    the element are not.
 */
function ScriptRun({
  kind,
  style,
  children,
  baseline,
}: InlineViewProps<'Superscript'> & { kind: 'sup' | 'sub' }) {
  const { theme, options } = useRenderContext();
  const inherited = useContext(InheritedTextContext);
  const unicode =
    typeof children === 'string'
      ? (kind === 'sup' ? toSuperscript : toSubscript)(children)
      : null;

  if (unicode !== null) {
    return <Text style={[style.text, UNICODE_SCRIPT]}>{unicode}</Text>;
  }
  if (options.scriptFallback === 'smaller') {
    return <Text style={style.text}>{children}</Text>;
  }
  const { colors, fonts } = theme.tokens;
  return (
    <View
      style={{ transform: [{ translateY: baseline.fontSize * SHIFT[kind] }] }}
    >
      <Text
        style={[
          { color: colors.text, fontFamily: regularFamily(fonts.body) },
          inherited,
          style.text,
          { fontSize: baseline.fontSize * 0.75 },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * Declared inline views (they receive `baseline`), though they only render
 * a View for the `'raised'` fallback.
 */
export const Superscript = markInlineView(function DefaultSuperscript(
  props: InlineViewProps<'Superscript'>
) {
  return <ScriptRun kind="sup" {...props} />;
}) as ComponentType<ElementProps<'Superscript'>>;

export const Subscript = markInlineView(function DefaultSubscript(
  props: InlineViewProps<'Subscript'>
) {
  return <ScriptRun kind="sub" {...props} />;
}) as ComponentType<ElementProps<'Subscript'>>;

export function Kbd({ style, children }: ElementProps<'Kbd'>) {
  return <Text style={style.text}>{children}</Text>;
}

export function InlineCode({ code, style }: ElementProps<'InlineCode'>) {
  return <Text style={style.text}>{code}</Text>;
}

export function Link({ href, title, style, children }: ElementProps<'Link'>) {
  const { handlers } = useRenderContext();
  return (
    <Text
      style={style.text}
      accessibilityRole="link"
      accessibilityHint={title ?? undefined}
      onPress={() => pressLink(handlers, href, { title })}
    >
      {children}
    </Text>
  );
}

export function LineBreak({ hard }: ElementProps<'LineBreak'>) {
  return hard ? '\n' : ' ';
}

/**
 * Inline image as an inline attachment (a declared inline view). Its size
 * comes from the props when the renderer already knows it, else from the
 * size cache; it is scaled down to at most the text's line height, so it
 * sits in the line like an emoji. While loading (or on error) it holds a
 * square of the line height.
 */
export const InlineImage = markInlineView(function DefaultInlineImage({
  src,
  alt,
  title,
  width,
  height,
  baseline,
}: InlineViewProps<'InlineImage'>) {
  const { handlers, options } = useRenderContext();
  const loaded = useImageSize(src);
  const known =
    width !== null && height !== null
      ? { width, height }
      : loaded !== null && loaded !== 'error'
        ? loaded
        : null;
  const max = baseline.lineHeight;
  const scale = known === null ? 1 : Math.min(1, max / known.height);
  const image = (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt}
      style={
        known === null
          ? { width: max, height: max }
          : { width: known.width * scale, height: known.height * scale }
      }
    />
  );
  return options.interactiveImages ? (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={alt}
      onPress={() => handlers.current.onImagePress?.(src, { alt, title })}
    >
      {image}
    </Pressable>
  ) : (
    image
  );
}) as ComponentType<ElementProps<'InlineImage'>>;

export function FootnoteReference({
  label,
  index,
  reference,
  style,
}: ElementProps<'FootnoteReference'>) {
  const { handlers, options } = useRenderContext();
  if (!options.interactiveFootnotes) {
    return <Text style={style.text}>[{index}]</Text>;
  }
  return (
    <Text
      style={style.text}
      accessibilityRole="link"
      onPress={() =>
        handlers.current.onFootnotePress?.(label, {
          index,
          direction: 'definition',
          reference,
        })
      }
    >
      [{index}]
    </Text>
  );
}

/** HTML outside the safe subset: shown as literal text. */
export function HtmlInline({ html, style }: ElementProps<'HtmlInline'>) {
  return <Text style={style.text}>{html}</Text>;
}
