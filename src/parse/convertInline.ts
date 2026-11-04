import type { Token } from 'markdown-it';
import { Flag, NodeType, type TableBuilder } from '../model';
import type { HtmlMode } from './backend';
import {
  allowedTags,
  isSafeTag,
  pairHtmlTags,
  parseSimpleTag,
  SAFE_HTML_TAGS,
} from './htmlSubset';

/** Collects a heading's plain text for its slug. */
export type TextSink = (text: string) => void;

const DROPPED = -1;

/**
 * Converts `inline` tokens' children into the node table.
 * Spec: docs/rewrite/phase-1/token-mapping.md#inline-tokens-inlinechildren
 *
 * - Adjacent text, entities, escapes and soft breaks merge into one `Text`
 *   node (soft breaks stay as `\n`; rendering decides, P1-2).
 * - Containers use an explicit stack, like the block pass.
 * - Raw HTML follows the `html` mode (D3): matched pairs of allowed tags
 *   become elements, `<br>` a hard break; other tags stay literal (unmatched
 *   allowed tags merge into text, anything else is an `HtmlInline` node);
 *   `strip` drops every tag and keeps the text between them.
 *
 * One instance per document: methods instead of per-call closures and one
 * reused stack keep allocation low (this runs once per paragraph, heading
 * and table cell, and matters without a JIT).
 */
export class InlineConverter {
  private readonly stack: number[] = [];
  private readonly allowed: ReadonlySet<string> | null;
  private parent = 0;

  constructor(
    private readonly builder: TableBuilder,
    html: HtmlMode,
    private readonly warn: (tokenType: string) => void
  ) {
    this.allowed = allowedTags(html);
  }

  /** Converts one `inline` token's children under `parent`. `sink` gets plain text for heading slugs. */
  convert(
    children: readonly Token[],
    parent: number,
    sink: TextSink | null
  ): void {
    const { builder, stack, allowed } = this;
    this.parent = parent;
    stack.length = 0;
    stack.push(parent);
    const paired =
      allowed && hasHtml(children) ? pairHtmlTags(children, allowed) : null;

    for (let index = 0; index < children.length; index++) {
      const token = children[index]!;
      switch (token.type) {
        case 'text':
          this.addText(token.content);
          sink?.(token.content);
          break;
        case 'softbreak':
          this.addText('\n');
          sink?.(' ');
          break;
        case 'hardbreak':
          builder.add(NodeType.LineBreak, this.current(), Flag.HARD);
          sink?.(' ');
          break;
        case 'code_inline':
          builder.add(NodeType.InlineCode, this.current(), 0, token.content);
          sink?.(token.content);
          break;

        case 'em_open':
          this.open(NodeType.Emphasis);
          break;
        case 'strong_open':
          this.open(NodeType.Strong);
          break;
        case 's_open':
          this.open(NodeType.Strikethrough);
          break;
        case 'link_open': {
          const title = token.attrGet('title');
          this.open(
            NodeType.Link,
            token.markup === 'autolink' ? Flag.AUTOLINK : 0,
            {
              href: String(token.attrGet('href') ?? ''),
              title: title === null ? null : String(title),
            }
          );
          break;
        }
        case 'em_close':
        case 'strong_close':
        case 's_close':
        case 'link_close':
          stack.pop();
          break;

        case 'image': {
          const title = token.attrGet('title');
          builder.add(NodeType.Image, this.current(), 0, null, {
            src: String(token.attrGet('src') ?? ''),
            alt: plainText(token.children ?? []),
            title: title === null ? null : String(title),
          });
          break;
        }

        case 'html_inline': {
          if (!allowed) break; // strip: drop the tag, keep surrounding text
          const tag = parseSimpleTag(token.content);
          if (tag && allowed.has(tag.name) && isSafeTag(tag.name)) {
            if (tag.name === 'br' && !tag.closing) {
              builder.add(NodeType.LineBreak, this.current(), Flag.HARD);
              sink?.(' ');
            } else if (paired!.has(index)) {
              if (tag.closing) stack.pop();
              else this.open(SAFE_HTML_TAGS[tag.name]);
            } else {
              // Unmatched or unclosed allowed tag: literal text.
              this.addText(token.content);
              sink?.(token.content);
            }
          } else {
            // Any other tag (or one with attributes): literal HtmlInline node.
            builder.add(NodeType.HtmlInline, this.current(), 0, token.content);
          }
          break;
        }

        default:
          if (token.nesting === 1) {
            // Unknown container: keep its children, drop the wrapper.
            this.warn(token.type.replace(/_open$/, ''));
            stack.push(DROPPED);
          } else if (token.nesting === -1) {
            this.warn(token.type.replace(/_close$/, ''));
            stack.pop();
          } else {
            // Unknown leaf: keep its content as text.
            this.warn(token.type);
            this.addText(token.content);
            sink?.(token.content);
          }
      }
    }
  }

  private current(): number {
    const { stack } = this;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i] !== DROPPED) return stack[i]!;
    }
    return this.parent;
  }

  private addText(text: string): void {
    if (text.length === 0) return;
    const { builder } = this;
    const node = this.current();
    const last = builder.lastChildOf(node);
    if (last !== -1 && builder.typeOf(last) === NodeType.Text) {
      builder.appendText(last, text);
    } else {
      builder.add(NodeType.Text, node, 0, text);
    }
  }

  private open(
    type: number,
    flags = 0,
    attrs: Parameters<TableBuilder['add']>[4] = null
  ): void {
    this.stack.push(this.builder.add(type, this.current(), flags, null, attrs));
  }
}

function hasHtml(children: readonly Token[]): boolean {
  for (let i = 0; i < children.length; i++) {
    if (children[i]!.type === 'html_inline') return true;
  }
  return false;
}

/**
 * Plain text of inline tokens, the way markdown-it builds image alt text:
 * text and code content, nested image alt, breaks as newlines.
 */
export function plainText(tokens: readonly Token[]): string {
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
      case 'code_inline':
        out += t.content;
        break;
      case 'image':
        out += plainText(t.children ?? []);
        break;
      case 'softbreak':
      case 'hardbreak':
        out += '\n';
        break;
      default:
    }
  }
  return out;
}
