import { createElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { NodeType, NONE, type NodeTable } from '../model';
import type { RenderCtx } from './context';
import {
  InheritedTextContext,
  ListMarkerContext,
  TableKeyContext,
} from './contexts';
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
  /** Index of the top-level block being rendered. */
  readonly block: number;
  /** Node id of that block. */
  readonly root: number;
}

/**
 * Identity of a table's content, for the column width cache: what its
 * top-level block renders (document context, block context, source text,
 * as in `isSameBlock`) plus the table's position inside the block.
 */
function tableKey(table: NodeTable, id: number, place: Place): string {
  const start = table.blockStart[place.block]!;
  const end = table.blockEnd[place.block]!;
  return `${table.context}\u0001${table.blockContext[place.block]}\u0001${
    id - place.root
  }\u0001${table.source.slice(start, end)}`;
}

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
function renderRows(
  table: NodeTable,
  id: number,
  ctx: RenderCtx,
  place: Place
): ReactNode[] {
  const out: ReactNode[] = [];
  for (let g = table.firstChild[id]!; g !== NONE; g = table.nextSibling[g]!) {
    for (let r = table.firstChild[g]!; r !== NONE; r = table.nextSibling[r]!) {
      out.push(renderNode(table, r, ctx, place));
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
      const heading = theme.headings[props.level - 1]!;
      return element(
        ctx,
        'Heading',
        id,
        props,
        heading,
        renderInline(table, id, ctx, heading.text)
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
      const paragraph = place.tight ? theme.tightParagraph : elements.Paragraph;
      return element(
        ctx,
        'Paragraph',
        id,
        {},
        paragraph,
        renderInline(table, id, ctx, paragraph.text)
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
      const items = renderChildren(table, id, ctx, {
        ...place,
        tight: props.tight,
      });
      // Longest marker: the last ordered number plus its delimiter.
      const markerChars = props.ordered
        ? String(props.start + items.length - 1).length + 1
        : 1;
      return element(
        ctx,
        'List',
        id,
        props,
        place.depth > 0 ? theme.nestedList : elements.List,
        createElement(ListMarkerContext.Provider, { value: markerChars }, items)
      );
    }

    case NodeType.ListItem:
      return element(
        ctx,
        'ListItem',
        id,
        listItemProps(table, id, place.depth, theme.tokens.listBullets),
        elements.ListItem,
        renderChildren(table, id, ctx, { ...place, depth: place.depth + 1 })
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

    case NodeType.Table: {
      const key = tableKey(table, id, place);
      // Keyed by content: a changed table remounts and re-measures.
      return createElement(
        TableKeyContext.Provider,
        { key, value: key },
        element(
          ctx,
          'Table',
          id,
          tableProps(table, id),
          elements.Table,
          renderRows(table, id, ctx, place)
        )
      );
    }

    case NodeType.TableRow:
      return element(
        ctx,
        'TableRow',
        id,
        tableRowProps(table, id),
        elements.TableRow,
        renderChildren(table, id, ctx, place)
      );

    case NodeType.TableCell: {
      const props = tableCellProps(table, id);
      const cell = props.header ? theme.tableHeaderCell : elements.TableCell;
      return element(
        ctx,
        'TableCell',
        id,
        props,
        cell,
        renderInline(table, id, ctx, cell.text)
      );
    }

    case NodeType.FootnoteSection: {
      // Structural, not an element: a footer set apart from the document,
      // whose text style cascades into the definitions. Users restyle it
      // with the theme and override `FootnoteDefinition`.
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
          renderChildren(table, id, ctx, place)
        )
      );
    }

    case NodeType.FootnoteDefinition:
      return element(
        ctx,
        'FootnoteDefinition',
        id,
        footnoteDefinitionProps(table, id),
        elements.FootnoteDefinition,
        renderChildren(table, id, ctx, place)
      );

    default:
      // Plugin block nodes are rendered from the plugin registry in M5.
      return null;
  }
}

/** Renders top-level block `index` through the components in `ctx`. */
export function renderBlock(
  table: NodeTable,
  index: number,
  ctx: RenderCtx
): ReactNode {
  const root = table.blocks[index]!;
  return renderNode(table, root, ctx, {
    depth: 0,
    tight: false,
    block: index,
    root,
  });
}
