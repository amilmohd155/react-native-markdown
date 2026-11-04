/**
 * Plugin system and built-in GFM plugins (Phase 1 · M2).
 *
 * Contents:
 * - definePlugin and the internal plugin types (./definePlugin)
 * - Plugin registry: node type ids and token lookup (./registry)
 * - Built-in GFM plugins (./gfm): tables, strikethrough
 * - Presets: 'gfm' (default), 'commonmark', { base, exclude } (./presets)
 *
 * Planned contents:
 * - Built-in plugins: taskLists, autolinks, footnotes, tagfilter
 *
 * Design:
 * - docs/rewrite/04-api.md#plugins
 * - docs/rewrite/phase-1/token-mapping.md#plugin-tokens
 * - docs/rewrite/phase-1/decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps
 *
 * Internal until M5, which adds the public typing (components, theme).
 */

export {
  definePlugin,
  type MarkdownPlugin,
  type PluginNodeSpec,
} from './definePlugin';
export { GFM_PLUGINS, strikethrough, tables, type GfmPluginName } from './gfm';
export { resolvePreset, type Preset, type PresetName } from './presets';
export {
  baseTokenType,
  createRegistry,
  EMPTY_REGISTRY,
  type PluginRegistry,
  type RegisteredNode,
} from './registry';
