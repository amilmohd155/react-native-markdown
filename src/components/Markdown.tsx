import { memo } from 'react';
import { fromMarkdown } from 'mdast-util-from-markdown';
import ASTRenderer, { type ASTRendererOptions } from '../libs/ASTRenderer';

interface MarkdownProps extends ASTRendererOptions {
  markdown: Uint8Array | string;
}

const Markdown = memo(
  ({
    markdown,
    debug,
    renderRules,
    listBulletStyle,
    styles,
    customBulletElement,
  }: MarkdownProps) => {
    const tree = fromMarkdown(markdown);

    const renderer = new ASTRenderer({
      renderRules,
      debug,
      styles,
      listBulletStyle,
      customBulletElement,
    });

    return renderer.render(tree);
  }
);

Markdown.displayName = 'Markdown';
export default Markdown;
