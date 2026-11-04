import { getText, NodeType, NONE, type NodeTable } from '../model';
import type { RenderCtx } from './context';

/**
 * Inline content of a block (heading, paragraph, table cell).
 *
 * Interim version: the content's plain text, so block rendering and block
 * memoization can be built and tested first. The inline flattener (M3 task
 * "inline flattener": merged runs, nested <Text> per inline element, one
 * <Text> per block) replaces it.
 */
export function renderInline(
  table: NodeTable,
  id: number,
  ctx: RenderCtx
): string {
  return plainText(table, id, ctx.options.softBreak === 'space');
}

function plainText(
  table: NodeTable,
  id: number,
  softBreakAsSpace: boolean
): string {
  let out = '';
  for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
    switch (table.type[c]) {
      case NodeType.Text: {
        // Soft breaks are stored as '\n' inside text runs (P1-2).
        const text = getText(table, c) ?? '';
        out += softBreakAsSpace ? text.replace(/\n/g, ' ') : text;
        break;
      }
      case NodeType.InlineCode:
      case NodeType.HtmlInline:
        out += getText(table, c) ?? '';
        break;
      case NodeType.LineBreak:
        out += '\n';
        break;
      default:
        out += plainText(table, c, softBreakAsSpace);
    }
  }
  return out;
}
