import { gfmAutolinks } from './autolinks';
import { definePlugin } from './definePlugin';
import { gfmFootnotes } from './footnotes';
import { gfmStrikethrough } from './strikethrough';
import { gfmTagfilter } from './tagfilter';
import { gfmTaskLists } from './taskLists';

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
 * GFM strikethrough (`~x~`, `~~x~~`): in-house rules with cmark-gfm's
 * semantics, replacing markdown-it's core rule (P1-11).
 * Mapping: token-mapping.md#inline-tokens-inlinechildren
 */
export const strikethrough = definePlugin({
  name: 'strikethrough',
  syntax: { markdownIt: gfmStrikethrough },
});

/** GFM task list items: an in-house core rule. Mapping: token-mapping.md#task-lists */
export const taskLists = definePlugin({
  name: 'taskLists',
  syntax: { markdownIt: gfmTaskLists },
});

/**
 * GFM autolinks (`www.x.com`, `https://…`, emails): linkify-it plus a thin
 * GFM wrapper (P1-1). Links carry the `AUTOLINK` flag.
 */
export const autolinks = definePlugin({
  name: 'autolinks',
  syntax: { markdownIt: gfmAutolinks },
});

/**
 * Footnotes (GitHub, not in the GFM spec; on by default): markdown-it-footnote.
 * Mapping: token-mapping.md#footnotes
 */
export const footnotes = definePlugin({
  name: 'footnotes',
  syntax: { markdownIt: gfmFootnotes },
});

/**
 * GFM tagfilter (disallowed raw HTML): in-house. Records the filtered HTML
 * on `HtmlBlock` / `HtmlInline` nodes as `filteredHtml` (P1-13).
 */
export const tagfilter = definePlugin({
  name: 'tagfilter',
  syntax: { markdownIt: gfmTagfilter },
});

export const GFM_PLUGINS = Object.freeze([
  tables,
  taskLists,
  strikethrough,
  autolinks,
  footnotes,
  tagfilter,
] as const);

export type GfmPluginName = (typeof GFM_PLUGINS)[number]['name'];
