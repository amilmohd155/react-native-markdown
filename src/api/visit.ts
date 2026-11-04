import { getAttrs, getText, NodeType, NONE, type NodeTable } from '../model';
import {
  blockImageOf,
  codeBlockProps,
  footnoteDefinitionProps,
  footnoteReferenceProps,
  headingProps,
  htmlProps,
  imageProps,
  inlineCodeProps,
  inlineImageProps,
  lineBreakProps,
  linkProps,
  listItemProps,
  listProps,
  tableCellProps,
  tableProps,
  tableRowProps,
  type ElementPropsMap,
} from '../render';
import { pluginNodeOf, pluginPropsOf } from '../render/pluginNodes';
import { lightTheme, type PluginElementPropsMap } from '../theme';
import { tableOf, type MarkdownDocument } from './document';

type AllElementProps = ElementPropsMap & PluginElementPropsMap;

/** Names `visit` can call: built-in elements and declared plugin elements. */
export type VisitElementName = keyof AllElementProps & string;

/**
 * What a visitor receives for element `K`: the same props its component
 * gets, minus `children` and `style`. Read-only.
 */
export type VisitProps<K extends VisitElementName> = Readonly<
  Omit<AllElementProps[K], 'children'>
>;

/** Where the visited element sits. */
export interface VisitInfo {
  /**
   * The element's plain-text content: text runs, code, image alt text and
   * hard breaks (`'\n'`) of everything inside it. Computed on first read.
   */
  readonly text: string;
  /** Number of enclosing elements; top-level blocks are 0. */
  readonly depth: number;
  /** Index of the top-level block the element belongs to. */
  readonly blockIndex: number;
}

/** One callback per element name; names you leave out are skipped. */
export type Visitor = {
  readonly [K in VisitElementName]?: (
    props: VisitProps<K>,
    info: VisitInfo
  ) => void;
};

type Callback = (
  props: Readonly<Record<string, unknown>>,
  info: VisitInfo
) => void;

const DEFAULT_BULLETS = lightTheme.listBullets;

/** Inline and block wrappers whose only props are `children` and `style`. */
const PLAIN: ReadonlyMap<number, VisitElementName> = new Map([
  [NodeType.Paragraph, 'Paragraph'],
  [NodeType.Blockquote, 'Blockquote'],
  [NodeType.Divider, 'Divider'],
  [NodeType.Strong, 'Strong'],
  [NodeType.Emphasis, 'Emphasis'],
  [NodeType.Strikethrough, 'Strikethrough'],
  [NodeType.Underline, 'Underline'],
  [NodeType.Highlight, 'Highlight'],
  [NodeType.Superscript, 'Superscript'],
  [NodeType.Subscript, 'Subscript'],
  [NodeType.Kbd, 'Kbd'],
]);

const EMPTY: Readonly<Record<string, never>> = Object.freeze({});

/** Plain text of a node: see `VisitInfo.text`. */
function textOf(table: NodeTable, id: number): string {
  switch (table.type[id]) {
    case NodeType.Text:
    case NodeType.InlineCode:
    case NodeType.CodeBlock:
    case NodeType.HtmlBlock:
    case NodeType.HtmlInline:
      return getText(table, id) ?? '';
    case NodeType.Image:
      return (getAttrs(table, id) as { alt: string } | null)?.alt ?? '';
    case NodeType.LineBreak:
      return '\n';
  }
  let out = '';
  for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
    out += textOf(table, c);
  }
  return out;
}

/**
 * Walks a document and calls the visitor for each element it names.
 * Spec: docs/rewrite/04-api.md#lower-level-api (D7: read-only).
 *
 * - **Pre-order, in document order:** an element is visited before the
 *   elements inside it.
 * - **Same elements as the renderer:** a paragraph holding only an image
 *   is visited as `Image`, with no `Paragraph`; other images are
 *   `InlineImage`. Structural nodes (table head and body, the footnote
 *   section) are walked but never visited. Plain text isn't an element.
 * - **Same props as the components:** built by the renderer's own builders.
 *   `ListItem.marker` uses the default theme's bullets.
 * - **Read-only:** props are frozen, and the document can't be changed.
 *
 * Throws a `TypeError` for an object that `parse()` didn't create.
 *
 * ```ts
 * const toc: { level: number; id: string; text: string }[] = [];
 * visit(doc, { Heading: ({ level, id }, { text }) => toc.push({ level, id, text }) });
 * ```
 */
export function visit(document: MarkdownDocument, visitor: Visitor): void {
  const table = tableOf(document);
  const callbacks = visitor as Readonly<Record<string, Callback | undefined>>;

  const call = (
    name: string,
    props: Readonly<Record<string, unknown>>,
    id: number,
    depth: number,
    blockIndex: number
  ): void => {
    const callback = callbacks[name];
    if (callback === undefined) return;
    let text: string | null = null;
    callback(Object.freeze({ ...props }), {
      get text() {
        text ??= textOf(table, id);
        return text;
      },
      depth,
      blockIndex,
    });
  };

  const children = (
    id: number,
    depth: number,
    listDepth: number,
    blockIndex: number
  ): void => {
    for (let c = table.firstChild[id]!; c !== NONE; c = table.nextSibling[c]!) {
      node(c, depth, listDepth, blockIndex);
    }
  };

  const node = (
    id: number,
    depth: number,
    listDepth: number,
    blockIndex: number
  ): void => {
    const type = table.type[id]!;
    const plain = PLAIN.get(type);

    if (plain !== undefined) {
      if (type === NodeType.Paragraph) {
        const image = blockImageOf(table, id);
        if (image !== NONE) {
          // Rendered as a block `Image`, without the paragraph wrapper.
          call('Image', imageProps(table, image), image, depth, blockIndex);
          return;
        }
      }
      call(plain, EMPTY, id, depth, blockIndex);
      children(id, depth + 1, listDepth, blockIndex);
      return;
    }

    switch (type) {
      case NodeType.Root:
      case NodeType.TableHead:
      case NodeType.TableBody:
      case NodeType.FootnoteSection:
        // Structural: walked, never visited.
        children(id, depth, listDepth, blockIndex);
        return;
      case NodeType.Text:
        return;
      case NodeType.Heading:
        call('Heading', headingProps(table, id), id, depth, blockIndex);
        break;
      case NodeType.List:
        call('List', listProps(table, id), id, depth, blockIndex);
        children(id, depth + 1, listDepth + 1, blockIndex);
        return;
      case NodeType.ListItem:
        call(
          'ListItem',
          // Items sit in their list's depth: 0 for a top-level list.
          listItemProps(table, id, listDepth - 1, DEFAULT_BULLETS),
          id,
          depth,
          blockIndex
        );
        break;
      case NodeType.CodeBlock:
        call('CodeBlock', codeBlockProps(table, id), id, depth, blockIndex);
        return;
      case NodeType.Table:
        call('Table', tableProps(table, id), id, depth, blockIndex);
        break;
      case NodeType.TableRow:
        call('TableRow', tableRowProps(table, id), id, depth, blockIndex);
        break;
      case NodeType.TableCell:
        call('TableCell', tableCellProps(table, id), id, depth, blockIndex);
        break;
      case NodeType.HtmlBlock:
        call('HtmlBlock', htmlProps(table, id), id, depth, blockIndex);
        return;
      case NodeType.FootnoteDefinition:
        call(
          'FootnoteDefinition',
          footnoteDefinitionProps(table, id),
          id,
          depth,
          blockIndex
        );
        break;
      case NodeType.InlineCode:
        call('InlineCode', inlineCodeProps(table, id), id, depth, blockIndex);
        return;
      case NodeType.Link:
        call('Link', linkProps(table, id), id, depth, blockIndex);
        break;
      case NodeType.Image:
        call('InlineImage', inlineImageProps(table, id), id, depth, blockIndex);
        return;
      case NodeType.LineBreak:
        call('LineBreak', lineBreakProps(table, id), id, depth, blockIndex);
        return;
      case NodeType.HtmlInline:
        call('HtmlInline', htmlProps(table, id), id, depth, blockIndex);
        return;
      case NodeType.FootnoteReference:
        call(
          'FootnoteReference',
          footnoteReferenceProps(table, id),
          id,
          depth,
          blockIndex
        );
        return;
      default: {
        // Plugin nodes: leaf or container, named by the plugin.
        const plugin = pluginNodeOf(table, id);
        if (plugin === undefined) return;
        call(plugin.name, pluginPropsOf(table, id), id, depth, blockIndex);
        break;
      }
    }
    children(id, depth + 1, listDepth, blockIndex);
  };

  for (let i = 0; i < table.blockCount; i++) {
    node(table.blocks[i]!, 0, 0, i);
  }
}
