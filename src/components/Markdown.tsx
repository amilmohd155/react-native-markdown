import { memo } from 'react';
import { fromMarkdown } from 'mdast-util-from-markdown';
import ASTRenderer from '../libs/ASTRenderer';

interface MarkdownProps {
  markdown: Uint8Array | string;
  debug?: boolean;
}

const Markdown = memo(({ markdown, debug }: MarkdownProps) => {
  const tree = fromMarkdown(markdown);

  const renderer = new ASTRenderer({ debug });

  return renderer.render(tree);
});

Markdown.displayName = 'Markdown';
export default Markdown;
