import type { ComponentType } from 'react';
import { Image, Text } from 'react-native';
import { useRenderContext } from '../contexts';
import type { ElementProps } from '../elements';
import { useImageSize } from '../imageSize';
import { markInlineView, type InlineViewProps } from '../inlineView';
import { pressLink } from '../links';

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

/** Smaller text, no vertical offset (P1-5). */
export function Superscript({ style, children }: ElementProps<'Superscript'>) {
  return <Text style={style.text}>{children}</Text>;
}

/** Smaller text, no vertical offset (P1-5). */
export function Subscript({ style, children }: ElementProps<'Subscript'>) {
  return <Text style={style.text}>{children}</Text>;
}

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
  width,
  height,
  baseline,
}: InlineViewProps<'InlineImage'>) {
  const loaded = useImageSize(src);
  const known =
    width !== null && height !== null
      ? { width, height }
      : loaded !== null && loaded !== 'error'
        ? loaded
        : null;
  const max = baseline.lineHeight;
  const scale = known === null ? 1 : Math.min(1, max / known.height);
  return (
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
}) as ComponentType<ElementProps<'InlineImage'>>;

export function FootnoteReference({
  index,
  style,
}: ElementProps<'FootnoteReference'>) {
  return <Text style={style.text}>[{index}]</Text>;
}

/** HTML outside the safe subset: shown as literal text. */
export function HtmlInline({ html, style }: ElementProps<'HtmlInline'>) {
  return <Text style={style.text}>{html}</Text>;
}
