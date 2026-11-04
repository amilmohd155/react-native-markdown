import type { Token } from 'markdown-it';
import { Flag, NodeType, type TableBuilder } from '../model';

/** Collects a heading's plain text for its slug. */
export type TextSink = (text: string) => void;

const DROPPED = -1;

/**
 * Converts one `inline` token's children under `parent`.
 * Spec: docs/rewrite/phase-1/token-mapping.md#inline-tokens-inlinechildren
 *
 * - Adjacent text, entities, escapes and soft breaks merge into one `Text`
 *   node (soft breaks stay as `\n`; rendering decides, P1-2).
 * - Containers use an explicit stack, like the block pass.
 * - Raw HTML is kept as `HtmlInline` text for now; the safe-subset pairing
 *   (D3) lands with M1 task 7.
 *
 * Returns nothing; `sink` receives plain text for heading slugs.
 */
export function convertInline(
  builder: TableBuilder,
  children: readonly Token[],
  parent: number,
  sink: TextSink | null,
  warn: (tokenType: string) => void
): void {
  const stack: number[] = [parent];
  const current = (): number => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i] !== DROPPED) return stack[i]!;
    }
    return parent;
  };

  const addText = (text: string) => {
    if (text.length === 0) return;
    const node = current();
    const last = builder.lastChildOf(node);
    if (last !== -1 && builder.typeOf(last) === NodeType.Text) {
      builder.appendText(last, text);
    } else {
      builder.add(NodeType.Text, node, 0, text);
    }
  };
  const open = (
    type: number,
    flags = 0,
    attrs: Parameters<TableBuilder['add']>[4] = null
  ) => stack.push(builder.add(type, current(), flags, null, attrs));

  for (const token of children) {
    switch (token.type) {
      case 'text':
        addText(token.content);
        sink?.(token.content);
        break;
      case 'softbreak':
        addText('\n');
        sink?.(' ');
        break;
      case 'hardbreak':
        builder.add(NodeType.LineBreak, current(), Flag.HARD);
        sink?.(' ');
        break;
      case 'code_inline':
        builder.add(NodeType.InlineCode, current(), 0, token.content);
        sink?.(token.content);
        break;

      case 'em_open':
        open(NodeType.Emphasis);
        break;
      case 'strong_open':
        open(NodeType.Strong);
        break;
      case 's_open':
        open(NodeType.Strikethrough);
        break;
      case 'link_open': {
        const title = token.attrGet('title');
        open(NodeType.Link, token.markup === 'autolink' ? Flag.AUTOLINK : 0, {
          href: String(token.attrGet('href') ?? ''),
          title: title === null ? null : String(title),
        });
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
        builder.add(NodeType.Image, current(), 0, null, {
          src: String(token.attrGet('src') ?? ''),
          alt: plainText(token.children ?? []),
          title: title === null ? null : String(title),
        });
        break;
      }

      case 'html_inline':
        // Interim (task 6): literal HTML. Task 7 applies the safe subset (D3).
        builder.add(NodeType.HtmlInline, current(), 0, token.content);
        break;

      default:
        if (token.nesting === 1) {
          // Unknown container: keep its children, drop the wrapper.
          warn(token.type.replace(/_open$/, ''));
          stack.push(DROPPED);
        } else if (token.nesting === -1) {
          warn(token.type.replace(/_close$/, ''));
          stack.pop();
        } else {
          // Unknown leaf: keep its content as text.
          warn(token.type);
          addText(token.content);
          sink?.(token.content);
        }
    }
  }
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
