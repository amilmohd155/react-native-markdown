import { useState, type ReactElement } from 'react';
import { blockKey, NodeType, NONE, type NodeTable } from '../model';
import { blockElement, BlockProviders } from './Block';
import type { RenderCtx } from './context';
import type { FadePlan } from './fade';
import { imageAllowed } from './imagePolicy';
import { pluginNodeOf } from './pluginNodes';
import { blockImageOf, imageProps } from './props';
import { blockTaskCount } from './tasks';

/**
 * One top-level block as a list item: the table and render context it
 * renders from, so a list cell renders without any provider above the list,
 * and blocks of several documents can share one list.
 *
 * Immutable. An item is reused across flushes while its block is unchanged,
 * so a list that compares items (FlatList cells, FlashList, LegendList)
 * skips unchanged blocks before `Block`'s memo is even reached.
 */
export interface BlockItem {
  /** Position in the table's block index. */
  readonly index: number;
  /** `blockKey(index)` (P1-9), computed once per item. */
  readonly key: string;
  readonly table: NodeTable;
  readonly ctx: RenderCtx;
  /**
   * The stream's fade plan when the item was made (P2b-5), or null. Null or
   * not for a stream's whole life, so the rendered type never flips.
   */
  readonly fade: FadePlan | null;
  /**
   * Task items in the blocks before this one (P3-17): the prefix sum of the
   * per-block counts, so a task's global index is this plus its offset
   * inside the block.
   */
  readonly taskBase: number;
}

function createItem(
  table: NodeTable,
  ctx: RenderCtx,
  fade: FadePlan | null,
  index: number,
  taskBase: number
) {
  const item: BlockItem = Object.freeze({
    index,
    key: blockKey(index),
    table,
    ctx,
    fade,
    taskBase,
  });
  return item;
}

interface ItemsState {
  readonly table: NodeTable;
  readonly ctx: RenderCtx;
  readonly fade: FadePlan | null;
  readonly items: readonly BlockItem[];
}

/**
 * Items for `table`, reusing `prev`'s item for every block that is unchanged
 * by construction: both tables come from the same stream prefix
 * (`prefixId`) and the block sits in both stable prefixes. Every other block
 * gets a new item (the open tail, new blocks, everything after a full
 * re-parse or a `ctx` change); `Block`'s memo still skips the unchanged ones
 * among those.
 *
 * `taskBase` (P3-17) is a prefix sum of per-block task counts. A reused
 * item keeps its base: the stable prefix is identical in both tables, so
 * the blocks before it, and their counts, cannot have changed. Only the
 * tail is counted; the last block's own count is never needed.
 *
 * Cost per streaming flush: one array of `blockCount` pointers plus one item
 * and one task count per changed block. No source text is compared here.
 */
function buildItems(
  prev: ItemsState | null,
  table: NodeTable,
  ctx: RenderCtx,
  fade: FadePlan | null
): readonly BlockItem[] {
  const count = table.blockCount;
  let reused = 0;
  if (
    prev !== null &&
    prev.ctx === ctx &&
    (prev.fade === null) === (fade === null) &&
    table.prefixId !== undefined &&
    table.prefixId === prev.table.prefixId
  ) {
    reused = Math.min(
      prev.table.stableCount ?? 0,
      table.stableCount ?? 0,
      prev.items.length,
      count
    );
  }
  const items = new Array<BlockItem>(count);
  for (let i = 0; i < reused; i++) items[i] = prev!.items[i]!;
  // The base after the reused prefix: its last block's base plus its count.
  let base =
    reused === 0
      ? 0
      : items[reused - 1]!.taskBase + blockTaskCount(table, reused - 1);
  for (let i = reused; i < count; i++) {
    items[i] = createItem(table, ctx, fade, i, base);
    if (i + 1 < count) base += blockTaskCount(table, i);
  }
  return Object.freeze(items);
}

/**
 * List data for `table`: a new array whenever the table or `ctx` changes
 * (so a `PureComponent` list re-renders on every flush), holding new items
 * only for blocks that may have changed.
 */
export function useBlockItems(
  table: NodeTable,
  ctx: RenderCtx,
  fade: FadePlan | null
): readonly BlockItem[] {
  // The previous items, kept in state and replaced by a render-phase update
  // (React re-runs the component at once, before rendering children), as
  // `useStable` does: no ref read or write during render.
  const [state, setState] = useState<ItemsState>(() => ({
    table,
    ctx,
    fade,
    items: buildItems(null, table, ctx, fade),
  }));
  if (state.table === table && state.ctx === ctx && state.fade === fade) {
    return state.items;
  }
  const next: ItemsState = {
    table,
    ctx,
    fade,
    items: buildItems(state, table, ctx, fade),
  };
  setState(next);
  return next.items;
}

/**
 * A list's `renderItem`: the memoized `Block` (P1-9), inside the contexts
 * its elements read. Module-level, so its identity never changes.
 */
export function renderBlockItem({
  item,
}: {
  readonly item: BlockItem;
}): ReactElement {
  return (
    <BlockProviders ctx={item.ctx}>
      {blockElement(
        undefined,
        item.table,
        item.index,
        item.ctx,
        item.fade,
        item.taskBase
      )}
    </BlockProviders>
  );
}

/**
 * The element a top-level block renders as, by block kind: a FlashList
 * recycling hint (`getItemType`). Plugin blocks use their node name.
 */
export function blockItemType(item: BlockItem): string {
  const { table, ctx } = item;
  const id = table.blocks[item.index]!;
  switch (table.type[id]) {
    case NodeType.Heading:
      return 'Heading';
    case NodeType.Paragraph: {
      const image = blockImageOf(table, id);
      return image !== NONE &&
        imageAllowed(ctx.options.images, imageProps(table, image).src)
        ? 'Image'
        : 'Paragraph';
    }
    case NodeType.Blockquote:
      return 'Blockquote';
    case NodeType.List:
      return 'List';
    case NodeType.CodeBlock:
      return 'CodeBlock';
    case NodeType.Divider:
      return 'Divider';
    case NodeType.HtmlBlock:
      return 'HtmlBlock';
    case NodeType.Table:
      return 'Table';
    case NodeType.FootnoteSection:
      return 'FootnoteSection';
    default:
      return pluginNodeOf(table, id)?.name ?? 'Unknown';
  }
}
