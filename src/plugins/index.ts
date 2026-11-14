/**
 * Plugin system and built-in GFM plugins (Phase 1 · M2).
 *
 * Contents:
 * - definePlugin and the internal plugin types (./definePlugin)
 * - Plugin registry: node type ids and token lookup (./registry)
 * - Built-in GFM plugins (./gfm): tables, taskLists, strikethrough,
 *   autolinks, footnotes, tagfilter (rules in ./taskLists, ./strikethrough,
 *   ./autolinks, ./footnotes, ./tagfilter)
 * - Presets: 'gfm' (default), 'commonmark', { base: 'gfm', exclude } (./presets)
 *
 * Design:
 * - docs/rewrite/04-api.md#plugins
 * - docs/rewrite/phase-1/token-mapping.md#plugin-tokens
 * - docs/rewrite/phase-1/decisions.md#p1-1-gfm-autolinks-linkify-it--thin-wrapper-custom-code-only-for-proven-gaps
 *
 * Public typing (generic MarkdownPlugin, components, theme) since M5; the
 * entry point re-exports it when M5 swaps it to v1.
 */

export {
  definePlugin,
  type MarkdownPlugin,
  type PluginElementComponentProps,
  type PluginNodeSpec,
} from './definePlugin';
export { GFM_PLUGINS, type GfmPluginName } from './gfm';
export { type Preset } from './presets';
