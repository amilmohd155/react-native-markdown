import { memo, useMemo } from 'react';
import { fromMarkdown, type Extension } from 'mdast-util-from-markdown';
import ASTRenderer from './ASTRenderer';
import type { MarkdownProps } from './Markdown.types';
import { getKeyFromMarkdown } from '../utils/getKey';
import { resolveReference } from '../utils/resolveReference';

// Stable default so an omitted `extensions` prop doesn't invalidate the parse cache.
const NO_EXTENSIONS: Extension[] = [];

const Markdown = memo(
  ({
    markdown,
    debug,
    renderRules,
    listBulletStyle,
    styles,
    mergeStyle,
    customBulletElement,
    onLinkPress,
    extensions = NO_EXTENSIONS,
  }: MarkdownProps) => {
    // Re-parse only when the source or the parser extensions change.
    const tree = useMemo(
      () =>
        fromMarkdown(markdown, {
          mdastExtensions: [
            resolveReference(),
            getKeyFromMarkdown(),
            ...extensions,
          ],
        }),
      [markdown, extensions]
    );

    // Rebuild the renderer (and its merged styles) only when its options change.
    const renderer = useMemo(
      () =>
        new ASTRenderer({
          renderRules,
          debug,
          styles,
          mergeStyle,
          listBulletStyle,
          customBulletElement,
          onLinkPress,
        }),
      [
        renderRules,
        debug,
        styles,
        mergeStyle,
        listBulletStyle,
        customBulletElement,
        onLinkPress,
      ]
    );

    return useMemo(() => renderer.render(tree), [renderer, tree]);
  }
);

Markdown.displayName = 'Markdown';
export default Markdown;
