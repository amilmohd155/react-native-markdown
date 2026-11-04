import { definePlugin } from './definePlugin';

/**
 * Built-in GFM plugins. The `gfm` preset is exactly this list, in order.
 * Spec: docs/rewrite/04-api.md#plugins, docs/rewrite/phase-1/work-breakdown.md#m2--gfm-plugins
 *
 * Their tokens map to built-in node types (Table, Strikethrough, …), which
 * the converter handles directly, so they declare no `nodes`.
 */

/** GFM tables: markdown-it's core `table` rule. Mapping: token-mapping.md#block-tokens */
export const tables = definePlugin({
  name: 'tables',
  syntax: { markdownIt: (md) => md.enable('table') },
});

/**
 * GFM strikethrough: markdown-it's core `strikethrough` rule (inline and
 * post-processing). Mapping: token-mapping.md#inline-tokens-inlinechildren
 */
export const strikethrough = definePlugin({
  name: 'strikethrough',
  syntax: { markdownIt: (md) => md.enable('strikethrough') },
});

export const GFM_PLUGINS = Object.freeze([tables, strikethrough] as const);

export type GfmPluginName = (typeof GFM_PLUGINS)[number]['name'];
