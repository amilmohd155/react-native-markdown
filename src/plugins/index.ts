/**
 * Plugin system and built-in GFM plugins (Phase 1 · M2).
 *
 * Contents:
 * - definePlugin and the internal plugin types (./definePlugin)
 * - Plugin registry: node type ids and token lookup (./registry)
 *
 * Planned contents:
 * - Built-in plugins: tables, taskLists, strikethrough, autolinks, footnotes, tagfilter
 * - Presets: 'gfm' (default) and 'commonmark'
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
export {
  baseTokenType,
  createRegistry,
  EMPTY_REGISTRY,
  type PluginRegistry,
  type RegisteredNode,
} from './registry';
