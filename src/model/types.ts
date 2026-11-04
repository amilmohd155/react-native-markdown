/**
 * Node types, flag bits and per-type attributes of the private node table.
 * Spec: docs/rewrite/phase-1/token-mapping.md#node-types
 *
 * Plain `as const` objects instead of TypeScript enums: they work with
 * `verbatimModuleSyntax` and Babel, and compile to nothing but numbers.
 */

/** Node type ids, stored as `Uint8`. Ids 128–255 are reserved for plugins. */
export const NodeType = {
  Root: 0,

  // Block
  Heading: 1,
  Paragraph: 2,
  Blockquote: 3,
  List: 4,
  ListItem: 5,
  CodeBlock: 6,
  Divider: 7,
  HtmlBlock: 8,
  Table: 9,
  TableHead: 10,
  TableBody: 11,
  TableRow: 12,
  TableCell: 13,
  FootnoteSection: 14,
  FootnoteDefinition: 15,

  // Inline
  Text: 32,
  Strong: 33,
  Emphasis: 34,
  Strikethrough: 35,
  InlineCode: 36,
  Link: 37,
  Image: 38,
  LineBreak: 39,
  HtmlInline: 40,
  Underline: 41,
  Highlight: 42,
  Superscript: 43,
  Subscript: 44,
  Kbd: 45,
  FootnoteReference: 46,
} as const;

export type BuiltInNodeType = (typeof NodeType)[keyof typeof NodeType];

/** First id available to plugin-registered node types. */
export const PLUGIN_NODE_TYPE_MIN = 128;
/** Last id that fits the `Uint8` type column. */
export const PLUGIN_NODE_TYPE_MAX = 255;

const FIRST_INLINE_TYPE = 32;

/** True for built-in inline types. Plugin types carry their kind in the plugin registry. */
export function isBuiltInInline(type: number): boolean {
  return type >= FIRST_INLINE_TYPE && type < PLUGIN_NODE_TYPE_MIN;
}

const NAMES: ReadonlyMap<number, string> = new Map(
  Object.entries(NodeType).map(([name, id]) => [id, name])
);

/** Name of a built-in node type, for dev warnings, tests and debugging. */
export function nodeTypeName(type: number): string {
  return (
    NAMES.get(type) ??
    (type >= PLUGIN_NODE_TYPE_MIN ? `Plugin(${type})` : `Unknown(${type})`)
  );
}

/** Flag bits, stored as `Uint8`. */
export const Flag = {
  /** `List`, `ListItem`: ordered list. */
  ORDERED: 1 << 0,
  /** `List`: tight list; its paragraphs render without block spacing. */
  TIGHT: 1 << 1,
  /** `ListItem`: GFM task item. */
  TASK: 1 << 2,
  /** `ListItem` with `TASK`: checked. */
  CHECKED: 1 << 3,
  /** `TableRow`, `TableCell`: inside the table head. */
  HEADER: 1 << 4,
  /** `LineBreak`: hard break (soft breaks are newlines inside text runs). */
  HARD: 1 << 5,
  /** `Link`: from `<…>` or a GFM autolink. */
  AUTOLINK: 1 << 6,
  /** Plugin inline node declared `inlineView: true` (D8). */
  INLINE_VIEW: 1 << 7,
} as const;

export type FlagBit = (typeof Flag)[keyof typeof Flag];

export function hasFlag(flags: number, flag: FlagBit): boolean {
  return (flags & flag) !== 0;
}

export type Align = 'left' | 'center' | 'right' | null;

/** Attributes per node type, kept in the table's sparse attrs column. */
export interface NodeAttrsMap {
  [NodeType.Heading]: { level: 1 | 2 | 3 | 4 | 5 | 6; id: string };
  [NodeType.List]: {
    start: number;
    /** Ordered lists: `.` or `)`. Bullet lists: `-`, `*` or `+`. */
    marker: '.' | ')' | '-' | '*' | '+';
  };
  [NodeType.ListItem]: { index: number };
  [NodeType.CodeBlock]: { language: string | null; meta: string | null };
  [NodeType.Table]: { align: Align[] };
  [NodeType.TableRow]: { index: number };
  [NodeType.TableCell]: { align: Align; column: number };
  [NodeType.Link]: { href: string; title: string | null };
  [NodeType.Image]: { src: string; alt: string; title: string | null };
  [NodeType.FootnoteDefinition]: { label: string; index: number };
  [NodeType.FootnoteReference]: { label: string; index: number; subId: number };
}

export type NodeTypeWithAttrs = keyof NodeAttrsMap;

/** Attributes of a plugin node: plain serializable values from its `from(token)`. */
export type PluginNodeAttrs = Readonly<
  Record<string, string | number | boolean | null>
>;

export type NodeAttrs = NodeAttrsMap[NodeTypeWithAttrs] | PluginNodeAttrs;

/** What the renderer needs to know about a plugin node type. */
export interface PluginNodeInfo {
  /** Node (element) name from the plugin's `nodes`. */
  readonly name: string;
  readonly kind: 'block' | 'inline';
  /** Inline nodes only: may render a View (D8). */
  readonly inlineView: boolean;
}
