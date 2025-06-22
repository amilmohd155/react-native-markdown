import { memo } from 'react';
import { fromMarkdown } from 'mdast-util-from-markdown';
import ASTRenderer from './ASTRenderer';
import type { MarkdownProps } from './Markdown.types';
import { getKeyFromMarkdown } from '../utils/getKey';

const Markdown = memo(
  ({
    markdown,
    debug,
    renderRules,
    listBulletStyle,
    styles,
    customBulletElement,
    extensions = [],
  }: MarkdownProps) => {
    const tree = fromMarkdown(markdown, {
      mdastExtensions: [getKeyFromMarkdown(), ...extensions],
    });

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
