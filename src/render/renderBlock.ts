import { createElement, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { NodeType, NONE, type NodeTable } from '../model';
import type { RenderCtx } from './context';
import {
  InheritedTextContext,
  InheritedTextReset,
  ListGapContext,
  ListMarkerContext,
  OpenBlockContext,
  TableKeyContext,
} from './contexts';
import { element } from './element';
import { FootnoteFrame } from './footnoteFrame';
import { BODY_FONT, HEADING_FONT, TABLE_HEAD_FONT } from '../theme';
import { imageAllowed } from './imagePolicy';
import { renderInline } from './inline';
import {
  createPluginElement,
  pluginComponentOf,
  pluginNodeOf,
  pluginPropsOf,
  pluginStyleOf,
} from './pluginNodes';
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
  tableSourceOf,
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
  /**
   * The global index of the next task item (P3-17): the block's `taskBase`,
   * advanced in document order as items render.
   */
  readonly tasks: { next: number };
  /**
   * The font size an enclosing block's text style sets for its content
   * (a blockquote's, the footnote section's): it overrides the paragraph's,
   * so the scaled inline elements (`fontScale`) start from it.
   */
  readonly textSize?: number;
}

/** The top margin of the footnote section: the gap above its first definition. */
function sectionInset(container: ViewStyle): number {
  const flat = StyleSheet.flatten(container);
  const margin = flat?.marginTop ?? flat?.marginVertical ?? flat?.margin;
  return typeof margin === 'number' ? margin : 0;
}

/**
 * Identity of a table's content, for the column width cache (P3-37): the
 * document context, the block context, the table's position inside its
 * block, and the table's own source lines, not its whole block's.
 */
function tableKey(table: NodeTable, id: number, place: Place): string {
  // No source (no token map): '' means do not cache.
  const source = tableSourceOf(table, id);
  if (source === '') return '';
  return `${table.context}\u0001${table.blockContext[place.block]}\u0001${
    id - place.root
  }\u0001${source}`;
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
        renderInline(table, id, ctx, heading.text, HEADING_FONT, place.textSize)
      );
    }

    case NodeType.Paragraph: {
      const image = blockImageOf(table, id);
      if (
        image !== NONE &&
        imageAllowed(ctx.options.images, imageProps(table, image).src)
      ) {
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
        renderInline(table, id, ctx, paragraph.text, undefined, place.textSize)
      );
    }

    case NodeType.Blockquote:
      return element(
        ctx,
        'Blockquote',
        id,
        {},
        elements.Blockquote,
        renderChildren(table, id, ctx, {
          ...place,
          textSize: elements.Blockquote.text.fontSize ?? place.textSize,
        })
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
      const list = element(
        ctx,
        'List',
        id,
        props,
        place.depth > 0 ? theme.nestedList : elements.List,
        createElement(
          ListGapContext.Provider,
          { value: props.tight ? 0 : theme.tokens.spacing.block },
          createElement(
            ListMarkerContext.Provider,
            { value: markerChars },
            items
          )
        )
      );
      // A sub-list's tasks are their own: a checked parent's text style
      // stops here.
      return place.depth > 0
        ? createElement(InheritedTextReset, { key: id, children: list })
        : list;
    }

    case NodeType.ListItem: {
      // Before its children: an item's index precedes its sub-tasks'.
      const props = listItemProps(
        table,
        id,
        place.depth,
        theme.tokens.listBullets,
        place.tasks.next
      );
      if (props.taskIndex !== null) place.tasks.next++;
      return element(
        ctx,
        'ListItem',
        id,
        props,
        elements.ListItem,
        renderChildren(table, id, ctx, { ...place, depth: place.depth + 1 })
      );
    }

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
      return createElement(
        TableKeyContext.Provider,
        // React key: position only, so a table survives every flush. The
        // cache key (content) is the context value, never a React key.
        { key: `${place.block}:${id - place.root}`, value: key },
        createElement(
          OpenBlockContext.Provider,
          { value: table.openBlock === place.block },
          element(
            ctx,
            'Table',
            id,
            tableProps(table, id),
            elements.Table,
            renderRows(table, id, ctx, place)
          )
        )
      );
    }

    case NodeType.TableRow: {
      const props = tableRowProps(table, id);
      // Rows are numbered across head and body: the first body row is 1.
      const row = props.header
        ? theme.tableHeaderRow
        : props.index % 2 === 1
          ? theme.tableRowEven
          : theme.tableRowOdd;
      return element(
        ctx,
        'TableRow',
        id,
        props,
        row,
        renderChildren(table, id, ctx, place)
      );
    }

    case NodeType.TableCell: {
      const props = tableCellProps(table, id);
      const cell = props.header ? theme.tableHeaderCell : elements.TableCell;
      return element(
        ctx,
        'TableCell',
        id,
        props,
        cell,
        renderInline(
          table,
          id,
          ctx,
          cell.text,
          props.header ? TABLE_HEAD_FONT : BODY_FONT,
          place.textSize
        )
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
          renderChildren(table, id, ctx, {
            ...place,
            textSize: section.text.fontSize ?? place.textSize,
          })
        )
      );
    }

    case NodeType.FootnoteDefinition: {
      const props = footnoteDefinitionProps(table, id);
      const definition = element(
        ctx,
        'FootnoteDefinition',
        id,
        props,
        elements.FootnoteDefinition,
        renderChildren(table, id, ctx, place)
      );
      const focus = ctx.options.footnoteFocus;
      if (focus?.target !== 'definition') return definition;
      return createElement(FootnoteFrame, {
        key: id,
        store: focus.store,
        label: props.label,
        inset: sectionInset(theme.footnoteSection.container),
        children: definition,
      });
    }

    default: {
      // Plugin block nodes: a leaf (`math_block`) or a container.
      const plugin = pluginNodeOf(table, id);
      if (plugin === undefined) return null;
      const props = pluginPropsOf(table, id);
      const style = pluginStyleOf(ctx, plugin.name, props);
      const children =
        table.firstChild[id] === NONE
          ? undefined
          : renderChildren(table, id, ctx, {
              ...place,
              textSize: style.text.fontSize ?? place.textSize,
            });
      const component = pluginComponentOf(ctx, plugin.name);
      if (component === undefined) return children ?? null;
      return createPluginElement(component, id, props, style, children);
    }
  }
}

/**
 * Renders top-level block `index` through the components in `ctx`.
 * `taskBase` is the number of task items in the blocks before it (P3-17).
 */
export function renderBlock(
  table: NodeTable,
  index: number,
  ctx: RenderCtx,
  taskBase: number
): ReactNode {
  const root = table.blocks[index]!;
  return renderNode(table, root, ctx, {
    depth: 0,
    tight: false,
    block: index,
    root,
    tasks: { next: taskBase },
  });
}
