/**
 * TEST/BENCH ONLY: `<Markdown>` over the object-tree model (option B in
 * docs/rewrite/08-model-and-api.md), for the "Table vs. object tree A/B" in
 * docs/rewrite/phase-1/benchmark-protocol.md. This is the `objectTreeModel`
 * flag: render with `ObjectTreeMarkdown` instead of `Markdown`.
 *
 * Not exported from the package; nothing under src/ imports it, so the
 * default path is untouched. The library's own pieces are reused (parser,
 * theme, render context, components); the model and its renderer are the
 * ones in ./tree and ./render.
 *
 * Bench usage:
 *
 *   import { buildObjectTree, ObjectTreeMarkdown } from '.../bench/objectTree';
 *   const tree = buildObjectTree(parse(source)); // conversion cost, time it apart
 *   <ObjectTreeMarkdown tree={tree} />           // same as <Markdown document>
 *   <ObjectTreeMarkdown source={source} />       // parse + convert in render
 */
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { parse, type MarkdownProps } from '../../src/api';
import { mergeComponents } from '../../src/api/mergeComponents';
import { tableOf as tableOfDocument } from '../../src/api/document';
import { blockKey } from '../../src/model';
import {
  useRenderCtx,
  type RenderCtx,
  type RenderHandlers,
} from '../../src/render';
import { RenderCtxContext } from '../../src/render/contexts';
import { MarkdownThemeContext, useResolvedTheme } from '../../src/theme';
import { renderTreeBlock } from './render';
import { buildObjectTree, isSameTreeBlock, type ObjectTree } from './tree';

export { buildObjectTree, type ObjectTree } from './tree';

/**
 * Input is `source`, a parsed `document` (converted on mount), or an already
 * converted `tree`. Other props are the `<Markdown>` props that affect
 * rendering; `backend` and `html` apply to `source` only.
 */
export type ObjectTreeMarkdownProps = Omit<
  MarkdownProps,
  'source' | 'document'
> & {
  readonly source?: string;
  readonly document?: MarkdownProps['document'];
  readonly tree?: ObjectTree;
};

interface BlockProps {
  readonly tree: ObjectTree;
  readonly index: number;
  readonly ctx: RenderCtx;
}

const TreeBlockView = memo(
  function TreeBlockImpl({ tree, index, ctx }: BlockProps) {
    return renderTreeBlock(tree, index, ctx);
  },
  (a, b) => a.ctx === b.ctx && isSameTreeBlock(a.tree, a.index, b.tree, b.index)
);

const NO_PLUGINS: NonNullable<MarkdownProps['plugins']> = Object.freeze([]);

export function ObjectTreeMarkdown(props: ObjectTreeMarkdownProps) {
  const { source, document, tree: given, preset, html, backend } = props;
  const plugins = props.plugins ?? NO_PLUGINS;

  const tree = useMemo(() => {
    if (given !== undefined) return given;
    if (document !== undefined)
      return buildObjectTree(tableOfDocument(document));
    if (source === undefined) {
      throw new TypeError(
        '<ObjectTreeMarkdown> needs a `source`, `document` or `tree`.'
      );
    }
    return buildObjectTree(
      tableOfDocument(parse(source, { preset, html, plugins, backend }))
    );
  }, [given, document, source, preset, html, plugins, backend]);

  const components = useMemo(
    () => mergeComponents(plugins, props.components),
    [plugins, props.components]
  );
  const themeLayers = useMemo(
    () => plugins.flatMap((p) => (p.theme ? [p.theme] : [])),
    [plugins]
  );
  const theme = useResolvedTheme(props.theme, themeLayers);
  const handlers: RenderHandlers = {
    onLinkPress: props.onLinkPress,
    onImagePress: props.onImagePress,
    onTaskToggle: props.onTaskToggle,
    onFootnotePress: props.onFootnotePress,
  };
  const ctx = useRenderCtx({
    theme,
    components,
    handlers,
    softBreak: props.softBreak,
    scriptFallback: props.scriptFallback,
    images: props.images,
    selectable: props.selectable,
    maxFontSizeMultiplier: props.maxFontSizeMultiplier,
  });

  const blocks = new Array(tree.blocks.length);
  for (let i = 0; i < tree.blocks.length; i++) {
    blocks[i] = (
      <TreeBlockView key={blockKey(i)} tree={tree} index={i} ctx={ctx} />
    );
  }
  return (
    <RenderCtxContext.Provider value={ctx}>
      <MarkdownThemeContext.Provider value={ctx.theme}>
        <View>{blocks}</View>
      </MarkdownThemeContext.Provider>
    </RenderCtxContext.Provider>
  );
}
