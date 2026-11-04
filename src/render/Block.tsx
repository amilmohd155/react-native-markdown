import { memo } from 'react';
import { View } from 'react-native';
import { blockKey, isSameBlock, type NodeTable } from '../model';
import { MarkdownThemeContext } from '../theme';
import type { RenderCtx } from './context';
import { RenderCtxContext } from './contexts';
import { renderBlock } from './renderBlock';

export interface BlockProps {
  readonly table: NodeTable;
  /** Position in the table's block index (not a node id). */
  readonly index: number;
  readonly ctx: RenderCtx;
}

function BlockImpl({ table, index, ctx }: BlockProps) {
  return renderBlock(table, index, ctx);
}

/**
 * Whether a block can skip re-rendering (P1-9): same render context, and
 * the block renders identically in both tables (document context, block
 * context, source text).
 */
export function blockPropsEqual(a: BlockProps, b: BlockProps): boolean {
  return a.ctx === b.ctx && isSameBlock(a.table, a.index, b.table, b.index);
}

/**
 * One top-level block. Spec: docs/rewrite/03-architecture.md#block-memoized
 *
 * A bailed-out block keeps the props of its last render, including that
 * render's table, so unchanged blocks can keep an older table alive until
 * they next re-render.
 */
export const Block = memo(BlockImpl, blockPropsEqual);

export interface BlockListProps {
  readonly table: NodeTable;
  readonly ctx: RenderCtx;
}

/**
 * Every top-level block in a plain `View`, keyed by block index (P1-9):
 * editing a block keeps every later block mounted.
 * Spec: docs/rewrite/03-architecture.md#blocklist
 *
 * Virtualization (`virtualize`, FlashList) is phase 3.
 */
export function BlockList({ table, ctx }: BlockListProps) {
  const blocks = new Array(table.blockCount);
  for (let i = 0; i < table.blockCount; i++) {
    blocks[i] = <Block key={blockKey(i)} table={table} index={i} ctx={ctx} />;
  }
  return (
    <RenderCtxContext.Provider value={ctx}>
      <MarkdownThemeContext.Provider value={ctx.theme}>
        <View>{blocks}</View>
      </MarkdownThemeContext.Provider>
    </RenderCtxContext.Provider>
  );
}
