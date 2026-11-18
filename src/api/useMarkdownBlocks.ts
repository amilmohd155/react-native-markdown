import { useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';
import {
  blockItemType,
  renderBlockItem,
  useBlockItems,
  type BlockItem,
} from '../render/blockItems';
import type { NodeTable } from '../model';
import { footnoteTarget } from '../render/footnoteTargets';
import type { FootnotePressInfo } from '../render/context';
import {
  useMarkdownPipeline,
  type FootnoteJumpRef,
  type MarkdownInput,
  type MarkdownRenderOptions,
} from './pipeline';

/**
 * Options of `useMarkdownBlocks()`: the same input and rendering props as
 * `<Markdown>` (`source` or `document`, preset, plugins, components, theme,
 * handlers, images, html, softBreak, scriptFallback, selectable,
 * maxFontSizeMultiplier, backend), with the same internal memoization.
 */
export type UseMarkdownBlocksOptions = MarkdownInput &
  MarkdownRenderOptions & {
    /**
     * The footnote jump for your own list (P3-14). Setting it makes footnote
     * references and back-links pressable; a press runs `onFootnotePress`
     * first (return `false` to skip), then calls this with the block to
     * scroll to: the footnote section for a reference, the block holding the
     * reference for a back-link. `index` is that block's index, which is also
     * its position in `data` (add your own offset when one list shows several
     * documents). `label` and `info` are those of `onFootnotePress`. The app
     * scrolls its list, and handles a list that has not measured the target
     * yet (a FlatList without `getItemLayout`: `onScrollToIndexFailed`).
     * Never called, and links stay inert, while a stream runs until `done()`
     * (P3-12).
     */
    readonly onFootnoteScrollTo?: (
      index: number,
      label: string,
      info: FootnotePressInfo
    ) => void;
  };

/**
 * One top-level block, as an item of `data`. Opaque apart from these
 * fields: pass items back to `renderItem`, `keyExtractor` and `getItemType`
 * unchanged, and don't create your own.
 *
 * Items are immutable and reused while their block is unchanged (during a
 * stream, every closed block), so lists that compare items skip them.
 */
export interface MarkdownBlock {
  /** Position of the block in the document, from 0. */
  readonly index: number;
  /**
   * Stable key: the block index (P1-9), so streaming keeps every block
   * mounted. Prefix it when one list shows blocks of several documents.
   */
  readonly key: string;
}

/** What `renderItem` reads from the list's render info. */
export interface MarkdownBlockRenderInfo {
  readonly item: MarkdownBlock;
}

/**
 * Props for your own list (FlatList, FlashList, LegendList, a Reanimated
 * list). Pass `getItemType` only to lists that take it (FlashList).
 */
export interface UseMarkdownBlocksResult {
  /**
   * One item per top-level block. A new array on every document change (each
   * stream flush), so a `PureComponent` list re-renders; changed blocks get
   * new items, unchanged blocks keep theirs.
   */
  readonly data: readonly MarkdownBlock[];
  /** Returns `item.key`. Never changes identity. */
  readonly keyExtractor: (item: MarkdownBlock, index?: number) => string;
  /**
   * Renders the block, with the theme and render context it needs: no
   * provider is needed around the list. Never changes identity.
   */
  readonly renderItem: (info: MarkdownBlockRenderInfo) => ReactElement;
  /**
   * The block's element name (`'Heading'`, `'Paragraph'`, `'Image'`,
   * `'CodeBlock'`, `'List'`, `'Table'`, ..., or a plugin node's name): a
   * FlashList recycling hint, ignored by FlatList. Never changes identity.
   */
  readonly getItemType: (item: MarkdownBlock, index?: number) => string;
}

// Every item in `data` is a `BlockItem` (../render/blockItems); the public
// type hides its table and render context.
const internal = (item: MarkdownBlock) => item as BlockItem;

// Also the owned FlatList's (./containers).
export const keyExtractor = (item: MarkdownBlock): string => item.key;
export const renderItem = ({ item }: MarkdownBlockRenderInfo): ReactElement =>
  renderBlockItem({ item: internal(item) });
const getItemType = (item: MarkdownBlock): string =>
  blockItemType(internal(item));

/**
 * Registers the jump on `jumpRef` against the latest table and callback, as
 * the containers do (P3-8): a press resolves in the table that was rendered.
 * No ref (no `onFootnoteScrollTo`), no jump.
 */
function useFootnoteJump(
  jumpRef: FootnoteJumpRef | undefined,
  table: NodeTable,
  onFootnoteScrollTo: UseMarkdownBlocksOptions['onFootnoteScrollTo']
) {
  const latest = useRef(onFootnoteScrollTo);
  useLayoutEffect(() => {
    latest.current = onFootnoteScrollTo;
  });
  useLayoutEffect(() => {
    if (jumpRef === undefined) return;
    jumpRef.current = (label, info) => {
      const target = footnoteTarget(table, label, info);
      if (target !== undefined) latest.current?.(target, label, info);
    };
    return () => {
      jumpRef.current = null;
    };
  }, [jumpRef, table]);
}

/**
 * Headless rendering for your own list (P3-3).
 * Spec: docs/rewrite/phase-3/virtualization.md
 *
 * Takes the same props as `<Markdown>` and returns `data`, `keyExtractor`,
 * `renderItem` and `getItemType`. Works with a static `source`, a
 * `document` from `parse()`, and a streamed `document` from
 * `useMarkdownStream()`:
 *
 * ```tsx
 * const stream = useMarkdownStream();
 * const blocks = useMarkdownBlocks({ document: stream.document, theme });
 * return (
 *   <FlatList
 *     data={blocks.data}
 *     keyExtractor={blocks.keyExtractor}
 *     renderItem={blocks.renderItem}
 *   />
 * );
 * ```
 *
 * Footnote jump in your own list (P3-14): pass `onFootnoteScrollTo` and scroll
 * there. A FlatList without `getItemLayout` needs `onScrollToIndexFailed`:
 *
 * ```tsx
 * const ref = useRef<FlatList>(null);
 * const blocks = useMarkdownBlocks({
 *   document,
 *   onFootnoteScrollTo: (index) =>
 *     ref.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }),
 * });
 * ```
 *
 * Only `data` changes identity, once per document change; the functions
 * are module-level constants. Each item carries what its block renders
 * from, so no provider is needed and blocks of several documents can share
 * one list (prefix their keys). The library does not follow the tail in
 * your list: use the list's own option (P3-5).
 */
export function useMarkdownBlocks(
  options: UseMarkdownBlocksOptions
): UseMarkdownBlocksResult {
  const { onFootnoteScrollTo } = options;
  const jump = useRef<FootnoteJumpRef['current']>(null);
  const jumpRef: FootnoteJumpRef | undefined =
    onFootnoteScrollTo === undefined ? undefined : jump;
  const { table, ctx, fade } = useMarkdownPipeline(
    options,
    'useMarkdownBlocks()',
    jumpRef
  );
  useFootnoteJump(jumpRef, table, onFootnoteScrollTo);
  const data = useBlockItems(table, ctx, fade);
  return useMemo(
    () => ({ data, keyExtractor, renderItem, getItemType }),
    [data]
  );
}
