import { createElement, Fragment, type ReactNode } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import {
  Flag,
  getText,
  hasFlag,
  NodeType,
  NONE,
  type NodeTable,
} from '../model';
import {
  BODY_FONT,
  fontStateIndex,
  withFont,
  type ElementName,
  type ElementStyle,
  type FontState,
} from '../theme';
import { linkStyleFor } from '../theme/linkVariants';
import type { RenderCtx } from './context';
import { checkedInline, isDev } from './devInline';
import { componentOf, createElementOf } from './element';
import { imageAllowed } from './imagePolicy';
import { cachedImageSize } from './imageSize';
import { baselineOf, isInlineView } from './inlineView';
import {
  createPluginElement,
  pluginComponentOf,
  pluginNodeOf,
  pluginPropsOf,
  pluginStyleOf,
} from './pluginNodes';
import {
  footnoteBackLinkProps,
  footnoteReferenceProps,
  htmlProps,
  imageProps,
  inlineCodeProps,
  inlineImageProps,
  lineBreakProps,
  linkProps,
  type SemanticProps,
} from './props';

/**
 * The inline flattener. Spec: docs/rewrite/03-architecture.md#inline-flattener
 *
 * Inline content (a heading's, paragraph's or table cell's) becomes the
 * children of the block's single `<Text>`:
 * - text runs are raw strings; adjacent runs are merged into one string;
 * - each inline element (Strong, Link, …) is one component call whose own
 *   children are flattened the same way;
 * - plain text only → a single string, so a user `React.memo` block
 *   component sees equal children and can bail out.
 *
 * Soft breaks are stored as '\n' inside text runs and rendered according
 * to `softBreak` (P1-2), so changing the option never re-parses.
 *
 * `font` is the bold/italic state the content sits in (a heading starts
 * bold). `Strong` and `Emphasis` take their style from it, so nesting
 * (`***x***`) picks the combined face when the theme uses face maps (P1-16).
 * It is a pure function of the document and theme, so equal input renders
 * equal output.
 */
export function renderInline(
  table: NodeTable,
  id: number,
  ctx: RenderCtx,
  /** The block's text style: declared inline views get its metrics. */
  blockText?: TextStyle,
  font: FontState = BODY_FONT,
  /**
   * The font size the content sits in, for the scaled elements (`fontScale`).
   * Defaults to the block text's: pass it when an inherited style (a
   * blockquote's, the footnote section's) overrides that.
   */
  size: number = blockText?.fontSize ?? ctx.theme.tokens.fontSize.base
): ReactNode {
  const softBreakAsSpace = ctx.options.softBreak === 'space';
  const dev = isDev();
  const out: ReactNode[] = [];
  let run = '';

  for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
    if (table.type[c] === NodeType.Text) {
      const text = getText(table, c) ?? '';
      run +=
        softBreakAsSpace && text.indexOf('\n') !== -1
          ? text.replace(/\n/g, ' ')
          : text;
      continue;
    }
    const node = renderInlineNode(table, c, ctx, dev, blockText, font, size);
    if (node === null) continue;
    if (run !== '') {
      out.push(run);
      run = '';
    }
    out.push(node);
  }
  if (run !== '') out.push(run);

  if (out.length === 0) return null;
  return out.length === 1 ? out[0] : out;
}

/**
 * A plugin inline node: a leaf (`math_inline`) or a container (`ins`).
 * Declared inline views (`inlineView: true` on the node) get `baseline`;
 * others are checked for View output in dev (D8).
 */
function pluginInline(
  table: NodeTable,
  id: number,
  ctx: RenderCtx,
  dev: boolean,
  blockText: TextStyle | undefined,
  font: FontState,
  size: number
): ReactNode {
  const plugin = pluginNodeOf(table, id);
  if (plugin === undefined) return null;
  const children =
    table.firstChild[id] === NONE
      ? undefined
      : renderInline(table, id, ctx, blockText, font, size);
  const component = pluginComponentOf(ctx, plugin.name);
  if (component === undefined) return children ?? null;

  const declared = hasFlag(table.flags[id]!, Flag.INLINE_VIEW);
  return createPluginElement(
    declared || !dev ? component : checkedInline(plugin.name, component),
    id,
    pluginPropsOf(table, id),
    pluginStyleOf(ctx, plugin.name),
    children,
    declared ? { baseline: baselineOf(blockText, ctx.theme.tokens) } : undefined
  );
}

function inline<K extends ElementName>(
  ctx: RenderCtx,
  dev: boolean,
  blockText: TextStyle | undefined,
  name: K,
  key: number,
  props: SemanticProps<K>,
  style: ElementStyle,
  children?: ReactNode
): ReactNode {
  const component = componentOf(ctx, name);
  if (isInlineView(component)) {
    // Declared inline views (D8) also get the block's font metrics.
    const withBaseline = {
      ...props,
      baseline: baselineOf(blockText, ctx.theme.tokens),
    };
    return createElementOf(component, key, withBaseline, style, children);
  }
  return createElementOf(
    dev ? checkedInline(name, component) : component,
    key,
    props,
    style,
    children
  );
}

const SCRIPT_KEY = {
  Superscript: 'superscript',
  Subscript: 'subscript',
} as const;

const sized = new WeakMap<ElementStyle, Map<number, ElementStyle>>();

/**
 * `style` with the text size set to `fontSize`: how a `fontScale` element
 * gets its absolute size (nested `<Text>` has no relative sizes). Cached per
 * style and size, so equal input gives the same object.
 */
function sizedStyle(style: ElementStyle, fontSize: number): ElementStyle {
  let bySize = sized.get(style);
  if (bySize === undefined) {
    bySize = new Map();
    sized.set(style, bySize);
  }
  let out = bySize.get(fontSize);
  if (out === undefined) {
    out = Object.freeze({
      text: { ...StyleSheet.flatten(style.text), fontSize },
      container: style.container,
    });
    bySize.set(fontSize, out);
  }
  return out;
}

/** Inline elements whose only props are `children` and `style`. */
const WRAPPERS: ReadonlyMap<number, ElementName> = new Map<number, ElementName>(
  [
    [NodeType.Strikethrough, 'Strikethrough'],
    [NodeType.Underline, 'Underline'],
    [NodeType.Highlight, 'Highlight'],
    [NodeType.Superscript, 'Superscript'],
    [NodeType.Subscript, 'Subscript'],
    [NodeType.Kbd, 'Kbd'],
  ]
);

function renderInlineNode(
  table: NodeTable,
  id: number,
  ctx: RenderCtx,
  dev: boolean,
  blockText: TextStyle | undefined,
  font: FontState,
  size: number
): ReactNode {
  const { elements, fontVariants, tokens } = ctx.theme;
  const type = table.type[id]!;

  if (type === NodeType.Strong || type === NodeType.Emphasis) {
    const name = type === NodeType.Strong ? 'Strong' : 'Emphasis';
    const inner = withFont(
      font,
      name === 'Strong' ? { bold: true } : { italic: true }
    );
    return inline(
      ctx,
      dev,
      blockText,
      name,
      id,
      {},
      fontVariants[name][fontStateIndex(font)]!,
      renderInline(table, id, ctx, blockText, inner, size)
    );
  }

  const wrapper = WRAPPERS.get(type);
  if (wrapper !== undefined) {
    // Scripts are a fraction of the surrounding size (nested ones compound).
    const inner =
      wrapper === 'Superscript' || wrapper === 'Subscript'
        ? size * tokens.fontScale[SCRIPT_KEY[wrapper]]
        : size;
    return inline(
      ctx,
      dev,
      blockText,
      wrapper,
      id,
      {},
      inner === size ? elements[wrapper] : sizedStyle(elements[wrapper], inner),
      renderInline(table, id, ctx, blockText, font, inner)
    );
  }

  switch (type) {
    case NodeType.Link: {
      const props = linkProps(table, id);
      return inline(
        ctx,
        dev,
        blockText,
        'Link',
        id,
        props,
        linkStyleFor(ctx.theme, props.href),
        renderInline(table, id, ctx, blockText, font, size)
      );
    }
    case NodeType.InlineCode:
      return inline(
        ctx,
        dev,
        blockText,
        'InlineCode',
        id,
        inlineCodeProps(table, id),
        elements.InlineCode
      );
    case NodeType.Image: {
      // A size already in the cache is passed as props; otherwise the
      // element looks it up itself.
      const { src, alt } = imageProps(table, id);
      // Images the `images` policy refuses never load: their alt text stands
      // in, as plain text.
      if (!imageAllowed(ctx.options.images, src))
        return alt === '' ? null : alt;
      const imageSize = cachedImageSize(src);
      return inline(
        ctx,
        dev,
        blockText,
        'InlineImage',
        id,
        inlineImageProps(
          table,
          id,
          imageSize === undefined || imageSize === 'error' ? null : imageSize
        ),
        elements.InlineImage
      );
    }
    case NodeType.LineBreak:
      return inline(
        ctx,
        dev,
        blockText,
        'LineBreak',
        id,
        lineBreakProps(table, id),
        elements.LineBreak
      );
    case NodeType.HtmlInline:
      return inline(
        ctx,
        dev,
        blockText,
        'HtmlInline',
        id,
        htmlProps(table, id),
        elements.HtmlInline
      );
    case NodeType.FootnoteReference:
      return inline(
        ctx,
        dev,
        blockText,
        'FootnoteReference',
        id,
        footnoteReferenceProps(table, id),
        sizedStyle(
          elements.FootnoteReference,
          size * tokens.fontScale.footnoteReference
        )
      );
    case NodeType.FootnoteBackLink: {
      const link = inline(
        ctx,
        dev,
        blockText,
        'FootnoteBackLink',
        id,
        footnoteBackLinkProps(table, id),
        elements.FootnoteBackLink
      );
      // A space sets each back-link off from the text or link before it; it
      // is not in the document, so the paragraph's text stays as written.
      return table.firstChild[table.parent[id]!] === id
        ? link
        : createElement(Fragment, { key: id }, ' ', link);
    }
    default:
      return pluginInline(table, id, ctx, dev, blockText, font, size);
  }
}
