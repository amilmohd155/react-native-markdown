import { createElement, Fragment, type ReactNode } from 'react';
import { NodeType, NONE, type NodeTable } from '../model';
import type { RenderCtx } from './context';
import { element } from './element';
import { renderInline } from './inline';
import {
  blockImageOf,
  codeBlockProps,
  footnoteDefinitionProps,
  headingProps,
  htmlProps,
  imageProps,
  listItemProps,
  listProps,
  tableCellProps,
  tableProps,
  tableRowProps,
} from './props';

/**
 * Where a block-level node sits, passed down the recursion inside one
 * top-level block (no React context, no parent-stack copies).
 */
interface Place {
  /** List nesting depth: 0 outside lists and for top-level lists. */
  readonly depth: number;
  /** Inside a tight list: paragraphs render without block spacing. */
  readonly tight: boolean;
}

const TOP: Place = Object.freeze({ depth: 0, tight: false });

function renderChildren(
  table: NodeTable,
  id: number,
  ctx: RenderCtx,
  place: Place
): ReactNode[] {
  const out: ReactNode[] = [];
  for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
    out.push(renderNode(table, c, ctx, place));
  }
  return out;
}

/** Table rows, skipping the structural `TableHead`/`TableBody` rows. */
function renderRows(table: NodeTable, id: number, ctx: RenderCtx): ReactNode[] {
  const out: ReactNode[] = [];
  for (let g = table.firstChild[id]!; g !== NONE; g = table.nextSibling[g]!) {
    for (let r = table.firstChild[g]!; r !== NONE; r = table.nextSibling[r]!) {
      out.push(renderNode(table, r, ctx, TOP));
    }
  }
  return out;
}

function renderNode(
  table: NodeTable,
  id: number,
  ctx: RenderCtx,
  place: Place
): ReactNode {
  const { theme } = ctx;
  const { elements } = theme;

  switch (table.type[id]) {
    case NodeType.Heading: {
      const props = headingProps(table, id);
      return element(
        ctx,
        'Heading',
        id,
        props,
        theme.headings[props.level - 1]!,
        renderInline(table, id, ctx)
      );
    }

    case NodeType.Paragraph: {
      const image = blockImageOf(table, id);
      if (image !== NONE) {
        return element(
          ctx,
          'Image',
          id,
          imageProps(table, image),
          elements.Image
        );
      }
      return element(
        ctx,
        'Paragraph',
        id,
        {},
        place.tight ? theme.tightParagraph : elements.Paragraph,
        renderInline(table, id, ctx)
      );
    }

    case NodeType.Blockquote:
      return element(
        ctx,
        'Blockquote',
        id,
        {},
        elements.Blockquote,
        renderChildren(table, id, ctx, place)
      );

    case NodeType.List: {
      const props = listProps(table, id);
      return element(
        ctx,
        'List',
        id,
        props,
        place.depth > 0 ? theme.nestedList : elements.List,
        renderChildren(table, id, ctx, {
          depth: place.depth,
          tight: props.tight,
        })
      );
    }

    case NodeType.ListItem:
      return element(
        ctx,
        'ListItem',
        id,
        listItemProps(table, id, place.depth, theme.tokens.listBullets),
        elements.ListItem,
        renderChildren(table, id, ctx, {
          depth: place.depth + 1,
          tight: place.tight,
        })
      );

    case NodeType.CodeBlock:
      return element(
        ctx,
        'CodeBlock',
        id,
        codeBlockProps(table, id),
        elements.CodeBlock
      );

    case NodeType.Divider:
      return element(ctx, 'Divider', id, {}, elements.Divider);

    case NodeType.HtmlBlock:
      return element(
        ctx,
        'HtmlBlock',
        id,
        htmlProps(table, id),
        elements.HtmlBlock
      );

    case NodeType.Table:
      return element(
        ctx,
        'Table',
        id,
        tableProps(table, id),
        elements.Table,
        renderRows(table, id, ctx)
      );

    case NodeType.TableRow:
      return element(
        ctx,
        'TableRow',
        id,
        tableRowProps(table, id),
        elements.TableRow,
        renderChildren(table, id, ctx, TOP)
      );

    case NodeType.TableCell: {
      const props = tableCellProps(table, id);
      return element(
        ctx,
        'TableCell',
        id,
        props,
        props.header ? theme.tableHeaderCell : elements.TableCell,
        renderInline(table, id, ctx)
      );
    }

    case NodeType.FootnoteSection:
      // Structural: its definitions render in order. The footnotes task
      // adds the footer presentation.
      return createElement(
        Fragment,
        { key: id },
        renderChildren(table, id, ctx, TOP)
      );

    case NodeType.FootnoteDefinition:
      return element(
        ctx,
        'FootnoteDefinition',
        id,
        footnoteDefinitionProps(table, id),
        elements.FootnoteDefinition,
        renderChildren(table, id, ctx, TOP)
      );

    default:
      // Plugin block nodes are rendered from the plugin registry in M5.
      return null;
  }
}

/** Renders top-level block `id` through the components in `ctx`. */
export function renderBlock(
  table: NodeTable,
  id: number,
  ctx: RenderCtx
): ReactNode {
  return renderNode(table, id, ctx, TOP);
}
