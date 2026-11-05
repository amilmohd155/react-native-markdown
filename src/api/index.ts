/**
 * Public v1 API surface (Phase 1 · M5).
 *
 * Contents:
 * - <Markdown> and its props (./Markdown)
 * - parse() → opaque MarkdownDocument (./parse, ./document)
 * - read-only visit() (./visit)
 * - defaults, inlineView(): wrap or declare elements (../render)
 * - definePlugin and plugin types (../plugins)
 * - createTheme, built-in themes, useMarkdownTheme (../theme)
 * - element, event and theme types
 *
 * Design:
 * - docs/rewrite/04-api.md
 *
 * This is the package entry point (src/index.tsx re-exports it). `tableOf`
 * (./document) and every internal type (NodeTable, markdown-it `Token`)
 * must never be exported or reachable from here: `yarn check:public-types`
 * walks the built declarations and fails if one is.
 */

export type { MarkdownDocument } from './document';
export { Markdown, type MarkdownProps } from './Markdown';
export { parse, type ParseOptions } from './parse';
export {
  useMarkdownStream,
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
export { defaults, inlineView } from '../render';
export type {
  AnyElementName,
  Components,
  ElementProps,
  FootnotePressInfo,
  HeadingLevel,
  ImagePressInfo,
  ImagesPolicy,
  InlineBaseline,
  InlineViewProps,
  LinkPressInfo,
  PluginComponents,
  ScriptFallback,
  SoftBreak,
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
export type {
  ElementName,
  ElementOverride,
  ElementOverrides,
  ElementStyle,
  FontFaces,
  FontFamily,
  MarkdownTheme,
  Theme,
  ThemeInput,
  ThemeProp,
  ThemeTokens,
} from '../theme';
