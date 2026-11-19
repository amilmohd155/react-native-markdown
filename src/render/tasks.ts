import {
  Flag,
  getAttrs,
  getText,
  hasFlag,
  NodeType,
  NONE,
  PLUGIN_NODE_TYPE_MIN,
  type NodeTable,
} from '../model';
import { pluginNodeOf } from './pluginNodes';

/**
 * Task items: the global index (P3-17) and the item's own text (P3-16).
 * Pure functions of the node table.
 */

/** Node types that cannot contain a list item: never walked. */
function holdsNoItems(type: number): boolean {
  return (
    type === NodeType.Paragraph ||
    type === NodeType.Heading ||
    type === NodeType.CodeBlock ||
    type === NodeType.HtmlBlock ||
    type === NodeType.Divider ||
    type === NodeType.Table ||
    (type >= NodeType.Text && type < 128)
  );
}

function countTasks(table: NodeTable, id: number): number {
  const type = table.type[id]!;
  if (holdsNoItems(type)) return 0;
  // Unregistered plugin nodes render nothing (`renderBlock`) and are not
  // visited (`visit`): their tasks have no index.
  if (type >= PLUGIN_NODE_TYPE_MIN && pluginNodeOf(table, id) === undefined) {
    return 0;
  }
  let count =
    type === NodeType.ListItem && hasFlag(table.flags[id]!, Flag.TASK) ? 1 : 0;
  for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
    count += countTasks(table, c);
  }
  return count;
}

/**
 * How many GFM task items top-level block `index` holds, at any depth
 * (inside lists and blockquotes). O(1) for blocks that cannot hold one.
 */
export function blockTaskCount(table: NodeTable, index: number): number {
  return countTasks(table, table.blocks[index]!);
}

function collectText(table: NodeTable, id: number, parts: string[]): void {
  for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
    const type = table.type[c]!;
    switch (type) {
      case NodeType.List:
      case NodeType.HtmlInline:
      case NodeType.FootnoteReference:
      case NodeType.FootnoteBackLink:
        break;
      case NodeType.Text:
        // A soft break is stored as a newline.
        parts.push((getText(table, c) ?? '').replace(/\n/g, ' '));
        break;
      case NodeType.InlineCode:
        parts.push(getText(table, c) ?? '');
        break;
      case NodeType.Image:
        parts.push((getAttrs(table, c) as { alt?: string } | null)?.alt ?? '');
        break;
      case NodeType.LineBreak:
        parts.push(' ');
        break;
      default: {
        // Formatting and links: their content. A plugin leaf: its text.
        if (table.firstChild[c] === NONE) parts.push(getText(table, c) ?? '');
        else collectText(table, c, parts);
      }
    }
  }
}

/**
 * A task item's own text as plain text: inline formatting flattened (links
 * to their text, code to its code, images to their alt, breaks to a
 * space), nested lists excluded (they are their own tasks). The paragraphs
 * of a loose item are joined by a space.
 */
export function taskText(table: NodeTable, id: number): string {
  const parts: string[] = [];
  for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
    if (table.type[c] === NodeType.List) continue;
    if (parts.length > 0) parts.push(' ');
    collectText(table, c, parts);
  }
  return parts.join('').trim();
}
