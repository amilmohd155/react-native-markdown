import { useMemo, type ReactElement } from 'react';
import {
  blockItemType,
  renderBlockItem,
  useBlockItems,
  type BlockItem,
} from '../render/blockItems';
import {
  useMarkdownPipeline,
  type MarkdownInput,
  type MarkdownRenderOptions,
} from './pipeline';

/**
 * Options of `useMarkdownBlocks()`: the same input and rendering props as
 * `<Markdown>` (`source` or `document`, preset, plugins, components, theme,
 * handlers, images, html, softBreak, scriptFallback, selectable,
 * maxFontSizeMultiplier, backend), with the same internal memoization.
 */
export type UseMarkdownBlocksOptions = MarkdownInput & MarkdownRenderOptions;

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
 * Only `data` changes identity, once per document change; the functions
 * are module-level constants. Each item carries what its block renders
 * from, so no provider is needed and blocks of several documents can share
 * one list (prefix their keys). The library does not follow the tail in
 * your list: use the list's own option (P3-5).
 */
export function useMarkdownBlocks(
  options: UseMarkdownBlocksOptions
): UseMarkdownBlocksResult {
  const { table, ctx } = useMarkdownPipeline(options, 'useMarkdownBlocks()');
  const data = useBlockItems(table, ctx);
  return useMemo(
    () => ({ data, keyExtractor, renderItem, getItemType }),
    [data]
  );
}
