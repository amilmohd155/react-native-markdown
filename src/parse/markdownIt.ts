import markdownIt, { type MarkdownIt } from 'markdown-it';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import { resolvePreset, type Preset } from '../plugins/presets';
import { createRegistry, type PluginRegistry } from '../plugins/registry';

/**
 * Maximum block/inline nesting depth. markdown-it parses nested containers
 * recursively and overflows the JS stack on very deep input (25,000 nested
 * `>` throws `RangeError: Maximum call stack size exceeded`), so a cap is
 * required. Beyond the cap the rest of the input is kept as text.
 *
 * 100 matches markdown-it's default preset; its `commonmark` preset uses 20,
 * which real documents (deep lists) can exceed. Pathological spec inputs
 * deeper than this cannot match the spec's output and are allowlisted.
 * See docs/rewrite/phase-1/decisions.md (P1-8).
 */
export const MAX_NESTING = 100;

/** A configured markdown-it instance and the plugin registry it was built with. */
export interface Parser {
  readonly md: MarkdownIt;
  readonly registry: PluginRegistry;
}

/**
 * Cache of parsers per plugin list: a trie keyed by plugin object.
 * `WeakMap` edges, so plugins that are no longer referenced (e.g. created
 * inline per render) don't keep their instances alive.
 */
interface CacheNode {
  parser?: Parser;
  next?: WeakMap<MarkdownPlugin, CacheNode>;
}

const root: CacheNode = {};

/**
 * Returns the shared parser for a plugin list (the preset's plugins, then
 * the user's), creating it once. The same plugin objects in the same order
 * share one instance.
 */
export function getParser(plugins: readonly MarkdownPlugin[]): Parser {
  let node = root;
  for (const plugin of plugins) {
    node.next ??= new WeakMap();
    let child = node.next.get(plugin);
    if (!child) {
      child = {};
      node.next.set(plugin, child);
    }
    node = child;
  }
  node.parser ??= createParser(plugins);
  return node.parser;
}

/** The shared markdown-it instance for a preset without extra plugins. */
export function getMarkdownIt(preset: Preset): MarkdownIt {
  return getParser(resolvePreset(preset)).md;
}

/**
 * Every instance starts from markdown-it's `commonmark` preset; GFM syntax
 * comes only from plugins, so excluding a plugin removes exactly its syntax.
 *
 * - `html: true`: raw HTML is always tokenized; the converter applies the
 *   `html` option (safe subset, text, strip) afterwards (D3).
 * - `linkify: false`: GFM autolinks come from the `autolinks` plugin's
 *   wrapper (P1-1), never from raw linkify.
 * - `typographer: false`: no smart quotes or replacements (not CommonMark).
 * - Default `validateLink` is kept: first layer of URL sanitization (P1-3).
 */
function createParser(plugins: readonly MarkdownPlugin[]): Parser {
  const registry = createRegistry(plugins);
  const md = markdownIt('commonmark', {
    html: true,
    linkify: false,
    typographer: false,
    maxNesting: MAX_NESTING,
  });
  for (const plugin of plugins) plugin.syntax?.markdownIt?.(md);
  return { md, registry };
}
