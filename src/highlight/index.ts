import { definePlugin, type MarkdownPlugin } from '../plugins/definePlugin';
import { createHighlightedCodeBlock } from './HighlightedCodeBlock';
import { DEFAULT_MAX_LENGTH, type HighlightOptions } from './types';

export {
  DEFAULT_MAX_LENGTH,
  type HighlightOptions,
  type SyntaxTokenType,
  type Token,
  type Tokenizer,
} from './types';

/**
 * Syntax highlighting for fenced code (P3-29 to P3-34). Supplies only
 * `components.CodeBlock` and no `syntax` rules, so the open-fence stream
 * fast path stays on (P3-32). The plugin name is always `'highlight'`.
 *
 * Call it once (module scope or a memo): each call makes a new `CodeBlock`
 * component, and a new one remounts every code block.
 */
export function highlight(options: HighlightOptions = {}): MarkdownPlugin {
  const CodeBlock = createHighlightedCodeBlock({
    languages: options.languages,
    tokenize: options.tokenize,
    maxLength: options.maxLength ?? DEFAULT_MAX_LENGTH,
  });
  return definePlugin({ name: 'highlight', components: { CodeBlock } });
}
