import { Image, Text } from 'react-native';
import { useRenderContext } from '../contexts';
import { markInlineView } from '../devInline';
import type { ElementProps } from '../elements';
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
 * Inline image as an inline attachment. Without a known size it uses a
 * placeholder square of the text's line height. A declared inline view.
 */
export const InlineImage = markInlineView(function InlineImage({
  src,
  alt,
  width,
  height,
}: ElementProps<'InlineImage'>) {
  const { tokens } = useRenderContext().theme;
  const placeholder = tokens.fontSize.base * tokens.lineHeight;
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt}
      style={{ width: width ?? placeholder, height: height ?? placeholder }}
    />
  );
});

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
