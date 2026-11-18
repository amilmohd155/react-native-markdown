import { useState } from 'react';
import { BlockList } from '../render';
import {
  listOptions,
  MarkdownFlatList,
  MarkdownScrollView,
} from './containers';
import {
  useMarkdownPipeline,
  type FootnoteJumpRef,
  type MarkdownInput,
  type MarkdownRenderOptions,
} from './pipeline';
import type { ScrollOptions, VirtualizeOptions } from './scrollOptions';

/**
 * Which container renders the blocks (P3-2): a `View` (default), an owned
 * `ScrollView` (`scroll`) or an owned `FlatList` (`virtualize`, which
 * implies `scroll`). `false` is the same as leaving a prop out.
 */
type MarkdownContainerProps =
  | {
      /** Renders an owned `ScrollView` instead of a `View`. */
      readonly scroll?: boolean | ScrollOptions;
      readonly virtualize?: false;
    }
  | {
      /**
       * With `virtualize`, these options are merged under `virtualize`'s;
       * `component` is `virtualize`'s alone (a list, not a scroll view).
       */
      readonly scroll?: boolean | Omit<ScrollOptions, 'component'>;
      /** Renders an owned `FlatList` instead of a `View`. Implies `scroll`. */
      readonly virtualize: true | VirtualizeOptions;
    };

/**
 * Props of `<Markdown>`. Spec: docs/rewrite/04-api.md#markdown
 */
export type MarkdownProps = MarkdownInput &
  MarkdownRenderOptions &
  MarkdownContainerProps;

const NO_SCROLL_OPTIONS: ScrollOptions = Object.freeze({});

/**
 * Renders markdown as native components.
 * Spec: docs/rewrite/04-api.md#markdown
 *
 * Memoization is internal: `theme`, `components`, `plugins`, `preset` and
 * `html` are compared shallowly, key by key, so inline objects and arrays
 * don't rebuild the render context. Handlers are read through a ref, so
 * inline callbacks never re-render a block.
 */
export function Markdown(props: MarkdownProps) {
  // The owned containers jump on a footnote press (P3-8), unless
  // `jumpToFootnotes` is `false`; the pipeline needs to know before it builds
  // the render context.
  const [jump] = useState<FootnoteJumpRef>(() => ({ current: null }));
  const listOpts = props.virtualize
    ? listOptions(props.scroll, props.virtualize)
    : undefined;
  const scrollOpts = props.scroll === true ? NO_SCROLL_OPTIONS : props.scroll;
  const own = listOpts ?? (scrollOpts || undefined);
  const jumps = own !== undefined && own.jumpToFootnotes !== false;
  const { table, ctx, fade, footnotes } = useMarkdownPipeline(
    props,
    '<Markdown>',
    jumps ? jump : undefined
  );
  if (listOpts) {
    return (
      <MarkdownFlatList
        table={table}
        ctx={ctx}
        fade={fade}
        options={listOpts}
        jump={jumps && footnotes ? jump : undefined}
      />
    );
  }
  if (scrollOpts) {
    return (
      <MarkdownScrollView
        table={table}
        ctx={ctx}
        fade={fade}
        options={scrollOpts}
        jump={jumps && footnotes ? jump : undefined}
      />
    );
  }
  return <BlockList table={table} ctx={ctx} fade={fade} />;
}
