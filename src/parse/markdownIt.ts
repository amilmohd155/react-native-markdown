import markdownIt, { type MarkdownIt } from 'markdown-it';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import { createRegistry, type PluginRegistry } from '../plugins/registry';
import type { Preset } from './backend';

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
 * Cache of parsers per preset, then per plugin list: a trie keyed by plugin
 * object. `WeakMap` edges, so plugins that are no longer referenced (e.g.
 * created inline per render) don't keep their instances alive.
 */
interface CacheNode {
  parser?: Parser;
  next?: WeakMap<MarkdownPlugin, CacheNode>;
}

const roots = new Map<Preset, CacheNode>();

/**
 * Returns the shared parser for a preset plus extra plugins, creating it
 * once. The same plugin objects in the same order share one instance.
 */
export function getParser(
  preset: Preset,
  plugins: readonly MarkdownPlugin[] = []
): Parser {
  let node = roots.get(preset);
  if (!node) {
    node = {};
    roots.set(preset, node);
  }
  for (const plugin of plugins) {
    node.next ??= new WeakMap();
    let child = node.next.get(plugin);
    if (!child) {
      child = {};
      node.next.set(plugin, child);
    }
    node = child;
  }
  node.parser ??= createParser(preset, plugins);
  return node.parser;
}

/** The shared markdown-it instance for a preset without extra plugins. */
export function getMarkdownIt(preset: Preset): MarkdownIt {
  return getParser(preset).md;
}

/**
 * - `html: true`: raw HTML is always tokenized; the converter applies the
 *   `html` option (safe subset, text, strip) afterwards (D3).
 * - `linkify: false`: GFM autolinks come from the `autolinks` plugin's
 *   wrapper (P1-1, M2), never from raw linkify.
 * - `typographer: false`: no smart quotes or replacements (not CommonMark).
 * - Default `validateLink` is kept: first layer of URL sanitization (P1-3).
 *
 * In M1, `gfm` only differs by markdown-it's built-in table and
 * strikethrough rules. The GFM plugins (task lists, autolinks, footnotes,
 * tagfilter) are registered on top in M2.
 */
function createParser(
  preset: Preset,
  plugins: readonly MarkdownPlugin[]
): Parser {
  const registry = createRegistry(plugins);
  const options = {
    html: true,
    linkify: false,
    typographer: false,
    maxNesting: MAX_NESTING,
  };

  // `default` = CommonMark rules plus table and strikethrough.
  const md = markdownIt(
    preset === 'commonmark' ? 'commonmark' : 'default',
    options
  );
  for (const plugin of plugins) plugin.syntax?.markdownIt?.(md);
  return { md, registry };
}
