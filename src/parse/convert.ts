import type { MarkdownIt, Token } from 'markdown-it';
import {
  BlockIndexBuilder,
  computeLineOffsets,
  Flag,
  lineToOffset,
  NodeType,
  ROOT,
  TableBuilder,
  type Align,
  type NodeAttrs,
  type NodeAttrsMap,
  type NodeTable,
} from '../model';
import {
  baseTokenType,
  EMPTY_REGISTRY,
  type PluginRegistry,
} from '../plugins/registry';
import type { TaskMeta } from '../plugins/taskLists';
import type { FootnoteMeta } from '../plugins/footnotes';
import { filteredHtmlOf } from '../plugins/tagfilter';
import type { HtmlMode } from './backend';
import { InlineConverter } from './convertInline';
import { Slugger } from './slug';

export interface ConvertOptions {
  readonly html: HtmlMode;
  /** Document context for block identity (P1-9); see `NodeTable.context`. */
  readonly context?: string;
  /** Plugin nodes to map tokens to. Default: none. */
  readonly registry?: PluginRegistry;
  /**
   * Tail conversion (`parseFrom`, phase 2): `source` passed to `convertTokens`
   * is the text that was tokenized, which starts at `offset` of `fullSource`.
   * Block offsets come out absolute in `fullSource`, which is also the
   * table's `source`. Default: `source` is the whole document.
   */
  readonly offset?: number;
  readonly fullSource?: string;
  /** Heading slug counters of the prefix. Default: none. */
  readonly slugger?: Slugger;
  /** Collects every heading outside the footnote section, if given. */
  readonly headings?: HeadingRecord[];
}

/** A heading's text and the top-level block (of this conversion) it is in. */
export interface HeadingRecord {
  readonly block: number;
  readonly text: string;
}

export interface ConvertResult {
  readonly table: NodeTable;
  /** Dev-mode warnings (e.g. unknown token types), one per token type. */
  readonly warnings: readonly string[];
}

type ListMarker = NodeAttrsMap[typeof NodeType.List]['marker'];

/** A footnote definition while its tokens are converted. */
interface OpenFootnote {
  readonly node: number;
  readonly attrs: {
    label: string;
    index: number;
    references: number;
  };
  /** Source lines covered by its content, from the tokens' `map`. */
  startLine: number;
  endLine: number;
}

/** One open container on the conversion stack. */
interface Frame {
  /** Node id, or -1 for a dropped wrapper (unknown open/close token). */
  readonly node: number;
  readonly type: number;
  /** Children counted so far, for list item and table row/cell indexes. */
  childCount: number;
}

const DROPPED = -1;

/**
 * Converts markdown-it block tokens into the node table in one forward pass
 * with an explicit stack (no recursion, so nesting depth can't overflow).
 * Spec: docs/rewrite/phase-1/token-mapping.md
 *
 * Inline content is converted by `convertInline`, under the current block.
 */
export function convertTokens(
  md: MarkdownIt,
  tokens: readonly Token[],
  source: string,
  options: ConvertOptions
): ConvertResult {
  const builder = new TableBuilder(Math.max(64, tokens.length));
  const lineOffsets = computeLineOffsets(source);
  const offset = options.offset ?? 0;
  const fullSource = options.fullSource ?? source;
  // The block index wants absolute offsets; footnote text is cut from `source`.
  const blocks = new BlockIndexBuilder(
    fullSource,
    offset === 0 ? lineOffsets : lineOffsets.map((o) => o + offset)
  );
  const slugger = options.slugger ?? new Slugger();
  const warned = new Set<string>();
  const warnings: string[] = [];
  const registry = options.registry ?? EMPTY_REGISTRY;

  const stack: Frame[] = [{ node: ROOT, type: NodeType.Root, childCount: 0 }];
  /** Dropped wrappers currently open; top-level = token.level minus this. */
  let droppedDepth = 0;

  // Per-table state: alignments come from the header row's cells.
  let tableAlign: Align[] = [];
  let tableRow = 0;
  let inTableHead = false;

  // Heading text, collected for its slug.
  let headingText: string[] | null = null;

  // The footnote definition being converted (footnotes plugin, P1-4).
  let footnote: OpenFootnote | null = null;

  const top = (): Frame => stack[stack.length - 1]!;
  /** Nearest enclosing node that isn't a dropped wrapper. */
  const parentNode = (): number => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i]!.node;
      if (node !== DROPPED) return node;
    }
    return ROOT;
  };
  const nearest = (type: number): Frame | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]!.type === type) return stack[i];
    }
    return undefined;
  };
  const warn = (tokenType: string) => {
    if (warned.has(tokenType)) return;
    warned.add(tokenType);
    warnings.push(
      `Unknown markdown-it token "${tokenType}": rendered as text. Register it with a plugin's \`nodes\` to render it properly.`
    );
  };
  const inline = new InlineConverter(
    builder,
    options.html,
    warn,
    registry,
    (value) => blocks.appendContext(value)
  );
  const indexBlock = (token: Token, node: number) => {
    if (token.level - droppedDepth === 0 && token.map) {
      blocks.addLines(node, token.map[0], token.map[1]);
    }
  };
  const open = (
    token: Token,
    type: number,
    flags = 0,
    attrs: NodeAttrs | null = null
  ): number => {
    const parent = top();
    parent.childCount++;
    const node = builder.add(type, parentNode(), flags, null, attrs);
    indexBlock(token, node);
    stack.push({ node, type, childCount: 0 });
    return node;
  };
  const leaf = (
    token: Token,
    type: number,
    text: string | null,
    attrs: NodeAttrs | null = null
  ): number => {
    top().childCount++;
    const node = builder.add(type, parentNode(), 0, text, attrs);
    indexBlock(token, node);
    return node;
  };
  const close = () => {
    const frame = stack.pop();
    if (frame?.node === DROPPED) droppedDepth--;
  };

  for (const token of tokens) {
    if (footnote && token.map) {
      // The definition's source lines: part of the section's context.
      footnote.startLine = Math.min(footnote.startLine, token.map[0]);
      footnote.endLine = Math.max(footnote.endLine, token.map[1]);
    }

    switch (token.type) {
      // ── Containers ──────────────────────────────────────────────
      case 'heading_open': {
        const level = Number(token.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
        open(token, NodeType.Heading, 0, { level, id: '' });
        headingText = [];
        break;
      }
      case 'heading_close': {
        const node = top().node;
        const text = headingText?.join('') ?? '';
        const id = slugger.slug(text);
        if (options.headings && !footnote) {
          options.headings.push({ block: blocks.count - 1, text });
        }
        builder.setAttrs(node, {
          level: Number(token.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
          id,
        });
        // The slug's de-duplication suffix depends on earlier headings, so it
        // is part of the enclosing top-level block's identity (P1-9).
        blocks.appendContext(id);
        headingText = null;
        close();
        break;
      }
      case 'paragraph_open': {
        // Paragraphs of tight lists are hidden: mark the list instead.
        if (token.hidden) {
          const list = nearest(NodeType.List);
          if (list) builder.addFlags(list.node, Flag.TIGHT);
        }
        open(token, NodeType.Paragraph);
        break;
      }
      case 'blockquote_open':
        open(token, NodeType.Blockquote);
        break;
      case 'bullet_list_open':
        open(token, NodeType.List, 0, {
          start: 1,
          marker: token.markup as ListMarker,
        });
        break;
      case 'ordered_list_open': {
        const start = Number(token.attrGet('start') ?? 1);
        open(token, NodeType.List, Flag.ORDERED, {
          start,
          marker: token.markup as ListMarker,
        });
        break;
      }
      case 'list_item_open': {
        const list = top();
        const ordered =
          list.node !== DROPPED &&
          builder.typeOf(list.node) === NodeType.List &&
          token.markup !== '-' &&
          token.markup !== '*' &&
          token.markup !== '+';
        // `meta.task` comes from the taskLists plugin.
        const task = (token.meta as { task?: TaskMeta } | null)?.task;
        const flags =
          (ordered ? Flag.ORDERED : 0) |
          (task ? Flag.TASK | (task.checked ? Flag.CHECKED : 0) : 0);
        open(token, NodeType.ListItem, flags, { index: list.childCount });
        break;
      }

      // ── Tables (gfm preset) ─────────────────────────────────────
      case 'table_open':
        tableAlign = [];
        tableRow = 0;
        open(token, NodeType.Table, 0, { align: tableAlign });
        break;
      case 'thead_open':
        inTableHead = true;
        open(token, NodeType.TableHead);
        break;
      case 'thead_close':
        inTableHead = false;
        close();
        break;
      case 'tbody_open':
        open(token, NodeType.TableBody);
        break;
      case 'tr_open':
        // Rows are numbered per table, across head and body.
        open(token, NodeType.TableRow, inTableHead ? Flag.HEADER : 0, {
          index: tableRow++,
        });
        break;
      case 'th_open':
      case 'td_open': {
        const column = top().childCount;
        const style = token.attrGet('style');
        const align = cellAlign(typeof style === 'string' ? style : null);
        if (inTableHead) tableAlign[column] = align;
        open(token, NodeType.TableCell, inTableHead ? Flag.HEADER : 0, {
          align,
          column,
        });
        break;
      }

      // ── Footnotes (footnotes plugin) ────────────────────────────
      case 'footnote_block_open': {
        // Appended after every other block, with no source range (`map` is
        // null): a synthesized block entry at the end of the source whose
        // context carries the definitions (P1-4, P1-9).
        const node = open(token, NodeType.FootnoteSection);
        blocks.addRange(node, fullSource.length, fullSource.length);
        break;
      }
      case 'footnote_open': {
        const { id, label } = token.meta as unknown as FootnoteMeta;
        const attrs = { label, index: id + 1, references: 0 };
        const node = open(token, NodeType.FootnoteDefinition, 0, attrs);
        footnote = { node, attrs, startLine: Infinity, endLine: -1 };
        break;
      }
      case 'footnote_anchor':
        // One per reference. The back-links are rendered by the definition.
        if (footnote) footnote.attrs.references++;
        break;
      case 'footnote_close': {
        if (footnote) {
          const { attrs, startLine, endLine } = footnote;
          builder.setAttrs(footnote.node, attrs);
          const text =
            endLine < 0
              ? ''
              : source.slice(
                  lineToOffset(lineOffsets, startLine),
                  lineToOffset(lineOffsets, endLine)
                );
          blocks.appendContext(
            `${attrs.index}\u0001${attrs.label}\u0001${attrs.references}\u0001${text}`
          );
          footnote = null;
        }
        close();
        break;
      }
      case 'footnote_block_close':
        close();
        break;

      // ── Leaves ──────────────────────────────────────────────────
      case 'fence': {
        const info = md.utils.unescapeAll(token.info).trim();
        const space = info.search(/\s/);
        const language = (space === -1 ? info : info.slice(0, space)) || null;
        const meta = space === -1 ? null : info.slice(space).trim() || null;
        leaf(token, NodeType.CodeBlock, token.content, { language, meta });
        break;
      }
      case 'code_block':
        leaf(token, NodeType.CodeBlock, token.content, {
          language: null,
          meta: null,
        });
        break;
      case 'hr':
        leaf(token, NodeType.Divider, null);
        break;
      case 'html_block':
        // Block HTML is never interpreted (D3): text, or dropped when stripping.
        if (options.html !== 'strip') {
          const filteredHtml = filteredHtmlOf(token); // tagfilter plugin
          leaf(
            token,
            NodeType.HtmlBlock,
            token.content,
            filteredHtml === null ? null : { filteredHtml }
          );
        }
        break;

      case 'inline': {
        const heading = headingText;
        inline.convert(
          token.children ?? [],
          parentNode(),
          heading ? (text) => heading.push(text) : null
        );
        break;
      }

      default: {
        const plugin = registry.block(baseTokenType(token));
        if (plugin) {
          if (token.nesting === 1) {
            open(token, plugin.type, 0, plugin.from(token));
          } else if (token.nesting === -1) {
            close();
          } else {
            leaf(token, plugin.type, null, plugin.from(token));
          }
        } else if (token.nesting === -1) {
          // Closers of the containers above all pop one frame.
          if (isKnownClose(token.type)) {
            close();
          } else {
            warn(token.type.replace(/_close$/, ''));
            close();
          }
        } else if (token.nesting === 1) {
          // Unknown container: keep its children, drop the wrapper.
          warn(token.type.replace(/_open$/, ''));
          top().childCount++;
          stack.push({ node: DROPPED, type: -1, childCount: 0 });
          droppedDepth++;
        } else {
          // Unknown self-contained token: keep its content as text.
          warn(token.type);
          if (token.content) {
            const paragraph = leaf(token, NodeType.Paragraph, null);
            builder.add(NodeType.Text, paragraph, 0, token.content);
          }
        }
      }
    }
  }

  return {
    table: builder.finish(
      blocks.finish(),
      fullSource,
      options.context ?? '',
      registry.info
    ),
    warnings,
  };
}

const KNOWN_CLOSE = new Set([
  'paragraph_close',
  'blockquote_close',
  'bullet_list_close',
  'ordered_list_close',
  'list_item_close',
  'table_close',
  'tbody_close',
  'tr_close',
  'th_close',
  'td_close',
]);

function isKnownClose(type: string): boolean {
  return KNOWN_CLOSE.has(type);
}

/** `text-align:left|center|right` → alignment; anything else → null. */
function cellAlign(style: string | null): Align {
  const match = style ? /text-align:\s*(left|center|right)/.exec(style) : null;
  return (match?.[1] as Align) ?? null;
}
