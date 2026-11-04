import type { ReactNode } from 'react';
import { getText, NodeType, NONE, type NodeTable } from '../model';
import type { ElementName, ElementStyle } from '../theme';
import type { RenderCtx } from './context';
import { checkedInline, isDev } from './devInline';
import { componentOf, createElementOf } from './element';
import {
  footnoteReferenceProps,
  htmlProps,
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
 */
export function renderInline(
  table: NodeTable,
  id: number,
  ctx: RenderCtx
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
    const node = renderInlineNode(table, c, ctx, dev);
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

function inline<K extends ElementName>(
  ctx: RenderCtx,
  dev: boolean,
  name: K,
  key: number,
  props: SemanticProps<K>,
  style: ElementStyle,
  children?: ReactNode
): ReactNode {
  const component = componentOf(ctx, name);
  return createElementOf(
    dev ? checkedInline(name, component) : component,
    key,
    props,
    style,
    children
  );
}

/** Inline elements whose only props are `children` and `style`. */
const WRAPPERS: ReadonlyMap<number, ElementName> = new Map<number, ElementName>(
  [
    [NodeType.Strong, 'Strong'],
    [NodeType.Emphasis, 'Emphasis'],
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
  dev: boolean
): ReactNode {
  const { elements } = ctx.theme;
  const type = table.type[id]!;

  const wrapper = WRAPPERS.get(type);
  if (wrapper !== undefined) {
    return inline(
      ctx,
      dev,
      wrapper,
      id,
      {},
      elements[wrapper],
      renderInline(table, id, ctx)
    );
  }

  switch (type) {
    case NodeType.Link:
      return inline(
        ctx,
        dev,
        'Link',
        id,
        linkProps(table, id),
        elements.Link,
        renderInline(table, id, ctx)
      );
    case NodeType.InlineCode:
      return inline(
        ctx,
        dev,
        'InlineCode',
        id,
        inlineCodeProps(table, id),
        elements.InlineCode
      );
    case NodeType.Image:
      // Size cache lands with the image task; until then, placeholder size.
      return inline(
        ctx,
        dev,
        'InlineImage',
        id,
        inlineImageProps(table, id),
        elements.InlineImage
      );
    case NodeType.LineBreak:
      return inline(
        ctx,
        dev,
        'LineBreak',
        id,
        lineBreakProps(table, id),
        elements.LineBreak
      );
    case NodeType.HtmlInline:
      return inline(
        ctx,
        dev,
        'HtmlInline',
        id,
        htmlProps(table, id),
        elements.HtmlInline
      );
    case NodeType.FootnoteReference:
      return inline(
        ctx,
        dev,
        'FootnoteReference',
        id,
        footnoteReferenceProps(table, id),
        elements.FootnoteReference
      );
    default:
      // Plugin inline nodes render from the plugin registry in M5; declared
      // inline views come with the inline views task.
      return null;
  }
}
