/**
 * Renderer over the object tree. TEST/BENCH ONLY (see ./tree).
 *
 * A line-for-line port of src/render/renderBlock.ts, inline.ts and the
 * props builders in props.ts, reading `TreeNode` objects instead of table
 * columns. Everything that does not touch the model is shared with the real
 * renderer (components, theme, `element`, image policy, plugin helpers), so
 * a difference in the A/B is a difference in the model walk. Keep it in sync
 * when the real renderer changes: the equivalence test fails if it drifts.
 */
import { createElement, type ReactNode } from 'react';
import { View, type TextStyle } from 'react-native';
import { Flag, hasFlag, NodeType, type FlagBit } from '../../src/model';
import type { NodeAttrsMap, PluginNodeAttrs } from '../../src/model';
import type { RenderCtx } from '../../src/render/context';
import {
  InheritedTextContext,
  ListMarkerContext,
  TableKeyContext,
} from '../../src/render/contexts';
import { checkedInline, isDev } from '../../src/render/devInline';
import {
  componentOf,
  createElementOf,
  element,
} from '../../src/render/element';
import { imageAllowed } from '../../src/render/imagePolicy';
import { cachedImageSize } from '../../src/render/imageSize';
import { baselineOf, isInlineView } from '../../src/render/inlineView';
import {
  createPluginElement,
  pluginComponentOf,
  pluginStyleOf,
} from '../../src/render/pluginNodes';
import type { SemanticProps } from '../../src/render/props';
import {
  BODY_FONT,
  fontStateIndex,
  HEADING_FONT,
  TABLE_HEAD_FONT,
  withFont,
  type ElementName,
  type ElementStyle,
  type FontState,
} from '../../src/theme';
import type { ObjectTree, TreeBlock, TreeNode } from './tree';

// --- props (port of src/render/props.ts) ---------------------------------

function attrsOf<T extends keyof NodeAttrsMap>(
  node: TreeNode,
  _type: T
): NodeAttrsMap[T] {
  if (node.attrs === null) {
    throw new Error(`Node ${node.id} has no attributes`);
  }
  return node.attrs as NodeAttrsMap[T];
}

const flag = (node: TreeNode, bit: FlagBit) => hasFlag(node.flags, bit);

const WHITESPACE = /^\s*$/;

/** The `Image` child of a paragraph that renders as a block `Image`. */
function blockImageOf(paragraph: TreeNode): TreeNode | null {
  let image: TreeNode | null = null;
  for (const c of paragraph.children) {
    if (c.type === NodeType.Image && image === null) {
      image = c;
    } else if (c.type !== NodeType.Text || !WHITESPACE.test(c.text ?? '')) {
      return null;
    }
  }
  return image;
}

function imageProps(node: TreeNode): SemanticProps<'Image'> {
  const { src, alt, title } = attrsOf(node, NodeType.Image);
  return { src, alt, title };
}

// --- block rendering (port of renderBlock.ts) -----------------------------

interface Place {
  readonly depth: number;
  readonly tight: boolean;
  readonly tree: ObjectTree;
  readonly block: TreeBlock;
  readonly index: number;
  /** Attributes of the enclosing list: ordered items read their start. */
  readonly list: NodeAttrsMap[typeof NodeType.List] | null;
}

function tableKey(node: TreeNode, place: Place): string {
  const { tree, block } = place;
  return `${tree.context}\u0001${block.context}\u0001${
    node.id - block.root.id
  }\u0001${tree.source.slice(block.start, block.end)}`;
}

function renderChildren(
  node: TreeNode,
  ctx: RenderCtx,
  place: Place
): ReactNode[] {
  const out: ReactNode[] = [];
  for (const c of node.children) out.push(renderNode(c, ctx, place));
  return out;
}

function renderRows(node: TreeNode, ctx: RenderCtx, place: Place) {
  const out: ReactNode[] = [];
  for (const group of node.children) {
    for (const row of group.children) out.push(renderNode(row, ctx, place));
  }
  return out;
}

function renderNode(node: TreeNode, ctx: RenderCtx, place: Place): ReactNode {
  const { theme } = ctx;
  const { elements } = theme;
  const id = node.id;

  switch (node.type) {
    case NodeType.Heading: {
      const { level, id: slug } = attrsOf(node, NodeType.Heading);
      const heading = theme.headings[level - 1]!;
      return element(
        ctx,
        'Heading',
        id,
        { level, id: slug },
        heading,
        renderInline(node, ctx, heading.text, HEADING_FONT)
      );
    }

    case NodeType.Paragraph: {
      const image = blockImageOf(node);
      if (
        image !== null &&
        imageAllowed(ctx.options.images, imageProps(image).src)
      ) {
        return element(ctx, 'Image', id, imageProps(image), elements.Image);
      }
      const paragraph = place.tight ? theme.tightParagraph : elements.Paragraph;
      return element(
        ctx,
        'Paragraph',
        id,
        {},
        paragraph,
        renderInline(node, ctx, paragraph.text)
      );
    }

    case NodeType.Blockquote:
      return element(
        ctx,
        'Blockquote',
        id,
        {},
        elements.Blockquote,
        renderChildren(node, ctx, place)
      );

    case NodeType.List: {
      const attrs = attrsOf(node, NodeType.List);
      const ordered = flag(node, Flag.ORDERED);
      const tight = flag(node, Flag.TIGHT);
      const items = renderChildren(node, ctx, { ...place, tight, list: attrs });
      const markerChars = ordered
        ? String(attrs.start + items.length - 1).length + 1
        : 1;
      return element(
        ctx,
        'List',
        id,
        { ordered, start: ordered ? attrs.start : 1, tight },
        place.depth > 0 ? theme.nestedList : elements.List,
        createElement(ListMarkerContext.Provider, { value: markerChars }, items)
      );
    }

    case NodeType.ListItem: {
      const { index } = attrsOf(node, NodeType.ListItem);
      const ordered = flag(node, Flag.ORDERED);
      const bullets = theme.tokens.listBullets;
      let marker: string;
      if (ordered) {
        const list = place.list!;
        marker = `${list.start + index}${list.marker}`;
      } else {
        marker =
          bullets.length === 0 ? '' : bullets[place.depth % bullets.length]!;
      }
      return element(
        ctx,
        'ListItem',
        id,
        {
          index,
          ordered,
          marker,
          checked: flag(node, Flag.TASK) ? flag(node, Flag.CHECKED) : null,
        },
        elements.ListItem,
        renderChildren(node, ctx, { ...place, depth: place.depth + 1 })
      );
    }

    case NodeType.CodeBlock: {
      const { language, meta } = attrsOf(node, NodeType.CodeBlock);
      const text = node.text ?? '';
      return element(
        ctx,
        'CodeBlock',
        id,
        {
          code: text.endsWith('\n') ? text.slice(0, -1) : text,
          language,
          meta,
        },
        elements.CodeBlock
      );
    }

    case NodeType.Divider:
      return element(ctx, 'Divider', id, {}, elements.Divider);

    case NodeType.HtmlBlock:
      return element(
        ctx,
        'HtmlBlock',
        id,
        { html: node.text ?? '' },
        elements.HtmlBlock
      );

    case NodeType.Table: {
      const key = tableKey(node, place);
      return createElement(
        TableKeyContext.Provider,
        { key, value: key },
        element(
          ctx,
          'Table',
          id,
          { align: attrsOf(node, NodeType.Table).align },
          elements.Table,
          renderRows(node, ctx, place)
        )
      );
    }

    case NodeType.TableRow:
      return element(
        ctx,
        'TableRow',
        id,
        {
          header: flag(node, Flag.HEADER),
          index: attrsOf(node, NodeType.TableRow).index,
        },
        elements.TableRow,
        renderChildren(node, ctx, place)
      );

    case NodeType.TableCell: {
      const { align, column } = attrsOf(node, NodeType.TableCell);
      const header = flag(node, Flag.HEADER);
      const cell = header ? theme.tableHeaderCell : elements.TableCell;
      return element(
        ctx,
        'TableCell',
        id,
        { align, header, column },
        cell,
        renderInline(node, ctx, cell.text, header ? TABLE_HEAD_FONT : BODY_FONT)
      );
    }

    case NodeType.FootnoteSection: {
      const section = theme.footnoteSection;
      return createElement(
        View,
        {
          key: id,
          style: section.container,
          accessibilityRole: 'summary',
          accessibilityLabel: 'Footnotes',
        },
        createElement(
          InheritedTextContext.Provider,
          { value: section.text },
          renderChildren(node, ctx, place)
        )
      );
    }

    case NodeType.FootnoteDefinition: {
      const { label, index, references } = attrsOf(
        node,
        NodeType.FootnoteDefinition
      );
      return element(
        ctx,
        'FootnoteDefinition',
        id,
        { label, index, references },
        elements.FootnoteDefinition,
        renderChildren(node, ctx, place)
      );
    }

    default: {
      const plugin = node.plugin;
      if (plugin === undefined) return null;
      const children =
        node.children.length === 0
          ? undefined
          : renderChildren(node, ctx, place);
      const component = pluginComponentOf(ctx, plugin.name);
      if (component === undefined) return children ?? null;
      return createPluginElement(
        component,
        id,
        pluginPropsOf(node),
        pluginStyleOf(ctx, plugin.name),
        children
      );
    }
  }
}

const NO_ATTRS: PluginNodeAttrs = Object.freeze({});

function pluginPropsOf(node: TreeNode): PluginNodeAttrs {
  return (node.attrs as PluginNodeAttrs | null) ?? NO_ATTRS;
}

/** Renders top-level block `index` of `tree`. */
export function renderTreeBlock(
  tree: ObjectTree,
  index: number,
  ctx: RenderCtx
): ReactNode {
  const block = tree.blocks[index]!;
  return renderNode(block.root, ctx, {
    depth: 0,
    tight: false,
    tree,
    block,
    index,
    list: null,
  });
}

// --- inline (port of inline.ts) -------------------------------------------

function renderInline(
  parent: TreeNode,
  ctx: RenderCtx,
  blockText?: TextStyle,
  font: FontState = BODY_FONT
): ReactNode {
  const softBreakAsSpace = ctx.options.softBreak === 'space';
  const dev = isDev();
  const out: ReactNode[] = [];
  let run = '';

  for (const c of parent.children) {
    if (c.type === NodeType.Text) {
      const text = c.text ?? '';
      run +=
        softBreakAsSpace && text.indexOf('\n') !== -1
          ? text.replace(/\n/g, ' ')
          : text;
      continue;
    }
    const node = renderInlineNode(c, ctx, dev, blockText, font);
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

function pluginInline(
  node: TreeNode,
  ctx: RenderCtx,
  dev: boolean,
  blockText: TextStyle | undefined,
  font: FontState
): ReactNode {
  const plugin = node.plugin;
  if (plugin === undefined) return null;
  const children =
    node.children.length === 0
      ? undefined
      : renderInline(node, ctx, blockText, font);
  const component = pluginComponentOf(ctx, plugin.name);
  if (component === undefined) return children ?? null;

  const declared = hasFlag(node.flags, Flag.INLINE_VIEW);
  return createPluginElement(
    declared || !dev ? component : checkedInline(plugin.name, component),
    node.id,
    pluginPropsOf(node),
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
  node: TreeNode,
  ctx: RenderCtx,
  dev: boolean,
  blockText: TextStyle | undefined,
  font: FontState
): ReactNode {
  const { elements, fontVariants } = ctx.theme;
  const type = node.type;
  const id = node.id;

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
      renderInline(node, ctx, blockText, inner)
    );
  }

  const wrapper = WRAPPERS.get(type);
  if (wrapper !== undefined) {
    return inline(
      ctx,
      dev,
      blockText,
      wrapper,
      id,
      {},
      elements[wrapper],
      renderInline(node, ctx, blockText, font)
    );
  }

  switch (type) {
    case NodeType.Link: {
      const { href, title } = attrsOf(node, NodeType.Link);
      return inline(
        ctx,
        dev,
        blockText,
        'Link',
        id,
        { href, title },
        elements.Link,
        renderInline(node, ctx, blockText, font)
      );
    }
    case NodeType.InlineCode:
      return inline(
        ctx,
        dev,
        blockText,
        'InlineCode',
        id,
        { code: node.text ?? '' },
        elements.InlineCode
      );
    case NodeType.Image: {
      const { src, alt, title } = attrsOf(node, NodeType.Image);
      if (!imageAllowed(ctx.options.images, src))
        return alt === '' ? null : alt;
      const size = cachedImageSize(src);
      const known = size === undefined || size === 'error' ? null : size;
      return inline(
        ctx,
        dev,
        blockText,
        'InlineImage',
        id,
        {
          src,
          alt,
          title,
          width: known === null ? null : known.width,
          height: known === null ? null : known.height,
        },
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
        { hard: flag(node, Flag.HARD) },
        elements.LineBreak
      );
    case NodeType.HtmlInline:
      return inline(
        ctx,
        dev,
        blockText,
        'HtmlInline',
        id,
        { html: node.text ?? '' },
        elements.HtmlInline
      );
    case NodeType.FootnoteReference: {
      const { label, index, subId } = attrsOf(node, NodeType.FootnoteReference);
      return inline(
        ctx,
        dev,
        blockText,
        'FootnoteReference',
        id,
        { label, index, reference: subId + 1 },
        elements.FootnoteReference
      );
    }
    default:
      return pluginInline(node, ctx, dev, blockText, font);
  }
}
