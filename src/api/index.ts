/**
 * Public v1 API surface (Phase 1 · M5).
 *
 * Contents:
 * - <Markdown> and its props (./Markdown), scroll and virtualize options
 *   (./scrollOptions; the containers are ./containers)
 * - useMarkdownBlocks(): the same blocks for the user's own list (./useMarkdownBlocks)
 * - parse() → opaque MarkdownDocument (./parse, ./document)
 * - read-only visit() (./visit)
 * - defaults, inlineView(): wrap or declare elements (../render)
 * - definePlugin and plugin types (../plugins)
 * - createTheme, built-in themes, useMarkdownTheme (../theme)
 * - element, event and theme types
 *
 * Design:
 * - docs/rewrite/04-api.md
 * - docs/rewrite/phase-3/virtualization.md (useMarkdownBlocks)
 *
 * This is the package entry point (src/index.tsx re-exports it). `tableOf`
 * (./document), the shared pipeline (./pipeline) and every internal type
 * (NodeTable, RenderCtx, markdown-it `Token`)
 * must never be exported or reachable from here: `yarn check:public-types`
 * walks the built declarations and fails if one is.
 */

export type { MarkdownDocument } from './document';
export { Markdown, type MarkdownProps } from './Markdown';
export type { FootnotesOptions, FootnoteScrollOffset } from './pipeline';
export { parse, type ParseOptions } from './parse';
export type {
  MarkdownListComponent,
  MarkdownListComponentProps,
  MarkdownListRef,
  MarkdownScrollComponent,
  MarkdownScrollComponentProps,
  MarkdownScrollToBlockOptions,
  MarkdownScrollToOptions,
  ScrollOptions,
  VirtualizeOptions,
} from './scrollOptions';
export {
  useMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownBlockRenderInfo,
  type UseMarkdownBlocksOptions,
  type UseMarkdownBlocksResult,
} from './useMarkdownBlocks';
export {
  useMarkdownStream,
  type StreamAnimation,
  type StreamingConfig,
  type UseMarkdownStreamOptions,
  type UseMarkdownStreamResult,
} from './useMarkdownStream';
export {
  visit,
  type VisitElementName,
  type VisitInfo,
  type VisitProps,
  type Visitor,
} from './visit';
export type { HtmlMode, Preset } from '../parse';

// Elements
export { defaults, inlineView, useTaskState } from '../render';
export type {
  AnyElementName,
  CodeBlockOptions,
  CodeCopyInfo,
  Components,
  ElementProps,
  FootnoteBackLinkMark,
  FootnoteA11yLabels,
  FootnotePressInfo,
  HeadingLevel,
  ImagePressInfo,
  ImagesPolicy,
  InlineBaseline,
  InlineViewProps,
  LinkPressInfo,
  MentionPressInfo,
  PluginComponents,
  ScriptFallback,
  SoftBreak,
  TaskState,
  TaskToggleInfo,
} from '../render';

// Plugins
export { definePlugin } from '../plugins';
export type {
  GfmPluginName,
  MarkdownPlugin,
  PluginElementComponentProps,
  PluginNodeSpec,
} from '../plugins';

// Theme
// `export *` on purpose: see ../theme/pluginElements (by-name augmentation).
export * from '../theme/pluginElements';
export { createTheme, darkTheme, lightTheme, useMarkdownTheme } from '../theme';
// TODO(M5): final public cleanup (ThemeTokens stays for `useMarkdownTheme()`
// until its return type is decided; lightTheme/darkTheme are flat blocks now).
export type {
  ElementName,
  ElementStyle,
  FlatThemeBlock,
  FlatThemeInput,
  FontFaces,
  FontFamily,
  MarkdownTheme,
  SyntaxTokenType,
  ThemeProp,
  ThemeTokens,
} from '../theme';
