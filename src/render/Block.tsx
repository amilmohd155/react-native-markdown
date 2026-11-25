import { memo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { blockKey, isSameBlock, type NodeTable } from '../model';
import { MarkdownThemeContext } from '../theme';
import type { RenderCtx } from './context';
import { RenderCtxContext } from './contexts';
import { FadeIn, fadeOnMount, type FadePlan } from './fade';
import { renderBlock } from './renderBlock';
import { blockTaskCount } from './tasks';

export interface BlockProps {
  readonly table: NodeTable;
  /** Position in the table's block index (not a node id). */
  readonly index: number;
  readonly ctx: RenderCtx;
  /**
   * Task items in the blocks before this one (P3-17). A real prop, compared
   * by the memo: `isSameBlock` only sees this block's own content, so a task
   * inserted above must still re-render the tasks below it.
   */
  readonly taskBase: number;
}

function BlockImpl({ table, index, ctx, taskBase }: BlockProps) {
  return renderBlock(table, index, ctx, taskBase);
}

/**
 * Whether a block can skip re-rendering (P1-9): same render context, and
 * the block renders identically in both tables (document context, block
 * context, source text), the same task base, and the same open-fence state.
 */
export function blockPropsEqual(a: BlockProps, b: BlockProps): boolean {
  return (
    a.ctx === b.ctx &&
    a.taskBase === b.taskBase &&
    // CodeBlock `open` (P3-33): `done()` closes a tail fence without
    // changing its text.
    (a.table.openFenceBlock === a.index) ===
      (b.table.openFenceBlock === b.index) &&
    // Table `open` (P3-37): the closing flush leaves the text unchanged.
    (a.table.openBlock === a.index) === (b.table.openBlock === b.index) &&
    isSameBlock(a.table, a.index, b.table, b.index)
  );
}

/**
 * One top-level block. Spec: docs/rewrite/03-architecture.md#block-memoized
 *
 * A bailed-out block keeps the props of its last render, including that
 * render's table, so unchanged blocks can keep an older table alive until
 * they next re-render.
 */
const Block = memo(BlockImpl, blockPropsEqual);

interface FadingBlockProps extends BlockProps {
  readonly fade: FadePlan;
}

function FadingBlockImpl({
  table,
  index,
  ctx,
  taskBase,
  fade,
}: FadingBlockProps) {
  // Decided once, at mount: a later plan never re-renders or unwraps it.
  const [duration] = useState(() => fadeOnMount(fade, index));
  const block = renderBlock(table, index, ctx, taskBase);
  return duration > 0 ? <FadeIn duration={duration}>{block}</FadeIn> : block;
}

/**
 * `Block` for a stream with `animation` on (P2b-5): the same memo comparison
 * (`fade` is ignored, so closed blocks still bail out), plus a fade-in
 * wrapper on a block that mounts right after it was born live.
 */
const FadingBlock = memo(FadingBlockImpl, blockPropsEqual);

/**
 * One block element: `Block`, or `FadingBlock` while the stream's plan is
 * set. `fade` is null or not for a stream's whole life, so the type is
 * stable and nothing remounts.
 */
export function blockElement(
  key: string | undefined,
  table: NodeTable,
  index: number,
  ctx: RenderCtx,
  fade: FadePlan | null,
  taskBase: number
): ReactElement {
  return fade === null ? (
    <Block
      key={key}
      table={table}
      index={index}
      ctx={ctx}
      taskBase={taskBase}
    />
  ) : (
    <FadingBlock
      key={key}
      table={table}
      index={index}
      ctx={ctx}
      taskBase={taskBase}
      fade={fade}
    />
  );
}

/**
 * The contexts default elements and `useMarkdownTheme()` read: the render
 * context and its theme. Every block container renders inside them.
 */
export function BlockProviders({
  ctx,
  children,
}: {
  readonly ctx: RenderCtx;
  readonly children: ReactNode;
}) {
  return (
    <RenderCtxContext.Provider value={ctx}>
      <MarkdownThemeContext.Provider value={ctx.theme}>
        {children}
      </MarkdownThemeContext.Provider>
    </RenderCtxContext.Provider>
  );
}

/**
 * One keyed `Block` per top-level block, for a container that mounts every
 * block (`View`, and the owned `ScrollView`). Keyed by block index (P1-9):
 * editing a block keeps every later block mounted.
 */
export function blockElements(
  table: NodeTable,
  ctx: RenderCtx,
  fade: FadePlan | null
): ReactNode[] {
  const blocks = new Array<ReactNode>(table.blockCount);
  let taskBase = 0;
  for (let i = 0; i < table.blockCount; i++) {
    blocks[i] = blockElement(blockKey(i), table, i, ctx, fade, taskBase);
    if (i + 1 < table.blockCount) taskBase += blockTaskCount(table, i);
  }
  return blocks;
}

export interface BlockListProps {
  readonly table: NodeTable;
  readonly ctx: RenderCtx;
  /** The stream's fade plan (P2b-5). Default null: plain `Block`s. */
  readonly fade?: FadePlan | null;
}

/**
 * Every top-level block in a plain `View` (the default container, P3-2).
 * Spec: docs/rewrite/03-architecture.md#blocklist
 *
 * Lists render the same blocks through `useBlockItems` (./blockItems).
 */
export function BlockList({ table, ctx, fade = null }: BlockListProps) {
  return (
    <BlockProviders ctx={ctx}>
      <View>{blockElements(table, ctx, fade)}</View>
    </BlockProviders>
  );
}
