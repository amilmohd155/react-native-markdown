import {
  Flag,
  getAttrs,
  getText,
  hasFlag,
  NodeType,
  NONE,
  type FlagBit,
  type NodeAttrsMap,
  type NodeTable,
  type NodeTypeWithAttrs,
} from '../model';
import type { ElementName } from '../theme';
import type { ElementPropsMap } from './elements';

/**
 * Node table rows → the public semantic props of each element.
 * Spec: docs/rewrite/phase-1/element-props.md
 *
 * - Plain values only: no node ids, table indexes or tokens leak out.
 * - Missing optional values are `null`, never `undefined`.
 * - Built when a block renders, never at parse time.
 *
 * `visit()` (M5) passes these same objects, so the visitor API and the
 * component API stay in sync by construction.
 */
export type SemanticProps<K extends ElementName> = Omit<
  ElementPropsMap[K],
  'children'
>;

function attrsOf<T extends NodeTypeWithAttrs>(
  table: NodeTable,
  id: number,
  _type: T
): NodeAttrsMap[T] {
  const attrs = getAttrs(table, id);
  if (attrs === null) {
    throw new Error(`Node ${id} has no attributes`);
  }
  return attrs as NodeAttrsMap[T];
}

function flag(table: NodeTable, id: number, bit: FlagBit): boolean {
  return hasFlag(table.flags[id]!, bit);
}

export function headingProps(
  table: NodeTable,
  id: number
): SemanticProps<'Heading'> {
  const { level, id: slug } = attrsOf(table, id, NodeType.Heading);
  return { level, id: slug };
}

export function listProps(table: NodeTable, id: number): SemanticProps<'List'> {
  const ordered = flag(table, id, Flag.ORDERED);
  const { start } = attrsOf(table, id, NodeType.List);
  return {
    ordered,
    start: ordered ? start : 1,
    tight: flag(table, id, Flag.TIGHT),
  };
}

/**
 * `depth` is the item's list nesting depth (0 for a top-level list); it
 * picks the bullet character, repeating through `bullets`.
 */
export function listItemProps(
  table: NodeTable,
  id: number,
  depth: number,
  bullets: readonly string[]
): SemanticProps<'ListItem'> {
  const { index } = attrsOf(table, id, NodeType.ListItem);
  const ordered = flag(table, id, Flag.ORDERED);
  let marker: string;
  if (ordered) {
    const list = attrsOf(table, table.parent[id]!, NodeType.List);
    marker = `${list.start + index}${list.marker}`;
  } else {
    marker = bullets.length === 0 ? '' : bullets[depth % bullets.length]!;
  }
  return {
    index,
    ordered,
    marker,
    checked: flag(table, id, Flag.TASK) ? flag(table, id, Flag.CHECKED) : null,
  };
}

export function codeBlockProps(
  table: NodeTable,
  id: number
): SemanticProps<'CodeBlock'> {
  const { language, meta } = attrsOf(table, id, NodeType.CodeBlock);
  const text = getText(table, id) ?? '';
  return {
    code: text.endsWith('\n') ? text.slice(0, -1) : text,
    language,
    meta,
  };
}

export function tableProps(
  table: NodeTable,
  id: number
): SemanticProps<'Table'> {
  return { align: attrsOf(table, id, NodeType.Table).align };
}

export function tableRowProps(
  table: NodeTable,
  id: number
): SemanticProps<'TableRow'> {
  return {
    header: flag(table, id, Flag.HEADER),
    index: attrsOf(table, id, NodeType.TableRow).index,
  };
}

export function tableCellProps(
  table: NodeTable,
  id: number
): SemanticProps<'TableCell'> {
  const { align, column } = attrsOf(table, id, NodeType.TableCell);
  return { align, header: flag(table, id, Flag.HEADER), column };
}

export function imageProps(
  table: NodeTable,
  id: number
): SemanticProps<'Image'> {
  const { src, alt, title } = attrsOf(table, id, NodeType.Image);
  return { src, alt, title };
}

/**
 * `size`: from the image size cache when known (M3 image cache task),
 * else `null` and the element uses the theme's placeholder size.
 */
export function inlineImageProps(
  table: NodeTable,
  id: number,
  size: { readonly width: number; readonly height: number } | null = null
): SemanticProps<'InlineImage'> {
  const { src, alt, title } = attrsOf(table, id, NodeType.Image);
  return {
    src,
    alt,
    title,
    width: size === null ? null : size.width,
    height: size === null ? null : size.height,
  };
}

export function linkProps(table: NodeTable, id: number): SemanticProps<'Link'> {
  const { href, title } = attrsOf(table, id, NodeType.Link);
  return { href, title };
}

export function inlineCodeProps(
  table: NodeTable,
  id: number
): SemanticProps<'InlineCode'> {
  return { code: getText(table, id) ?? '' };
}

export function lineBreakProps(
  table: NodeTable,
  id: number
): SemanticProps<'LineBreak'> {
  return { hard: flag(table, id, Flag.HARD) };
}

export function footnoteReferenceProps(
  table: NodeTable,
  id: number
): SemanticProps<'FootnoteReference'> {
  const { label, index } = attrsOf(table, id, NodeType.FootnoteReference);
  return { label, index };
}

export function footnoteDefinitionProps(
  table: NodeTable,
  id: number
): SemanticProps<'FootnoteDefinition'> {
  const { label, index, references } = attrsOf(
    table,
    id,
    NodeType.FootnoteDefinition
  );
  return { label, index, references };
}

/** `HtmlBlock` / `HtmlInline`: the source HTML (shown as literal text). */
export function htmlProps(
  table: NodeTable,
  id: number
): SemanticProps<'HtmlBlock'> {
  return { html: getText(table, id) ?? '' };
}

const WHITESPACE = /^\s*$/;

/**
 * The `Image` child of a paragraph that renders as a block `Image`, or
 * `NONE`. That's the case when the image is the paragraph's only child,
 * ignoring whitespace-only text (element-props.md#image-vs-inlineimage).
 */
export function blockImageOf(table: NodeTable, paragraph: number): number {
  let image = NONE;
  for (
    let c = table.firstChild[paragraph]!;
    c !== NONE;
    c = table.nextSibling[c]!
  ) {
    const type = table.type[c]!;
    if (type === NodeType.Image && image === NONE) {
      image = c;
    } else if (
      type !== NodeType.Text ||
      !WHITESPACE.test(getText(table, c) ?? '')
    ) {
      return NONE;
    }
  }
  return image;
}
