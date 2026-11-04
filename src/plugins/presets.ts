import type { MarkdownPlugin } from './definePlugin';
import { GFM_PLUGINS, type GfmPluginName } from './gfm';

export type PresetName = 'commonmark' | 'gfm';

/**
 * Which syntax set to parse. Spec: docs/rewrite/04-api.md#plugins
 *
 * - `'gfm'` (default): CommonMark plus every built-in GFM plugin.
 * - `'commonmark'`: strict CommonMark, no plugins.
 * - `{ base: 'gfm', exclude }`: GFM minus some built-in plugins, e.g.
 *   `{ base: 'gfm', exclude: ['autolinks'] }`.
 */
export type Preset =
  | PresetName
  | {
      readonly base: 'gfm';
      readonly exclude?: readonly GfmPluginName[];
    };

const BASES: Readonly<Record<PresetName, readonly MarkdownPlugin[]>> = {
  commonmark: Object.freeze([]),
  gfm: GFM_PLUGINS,
};

const KNOWN = new Set<string>(GFM_PLUGINS.map((p) => p.name));

/** Resolved `{ base: 'gfm', exclude }` lists by sorted exclusions, so equal presets share one parser. */
const resolved = new Map<string, readonly MarkdownPlugin[]>();

/**
 * The built-in plugins a preset stands for, in order. Returns the same array
 * for equal presets (the parser cache is keyed by plugin identity). Throws
 * on an unknown base or plugin name.
 */
export function resolvePreset(preset: Preset): readonly MarkdownPlugin[] {
  if (typeof preset === 'string') return baseOf(preset);

  if (preset.base !== 'gfm') {
    throw new TypeError(
      `Unknown preset base "${String(preset.base)}"; expected 'gfm'`
    );
  }
  const base = GFM_PLUGINS;
  const exclude = preset.exclude ?? [];
  if (exclude.length === 0) return base;
  for (const name of exclude) {
    if (!KNOWN.has(name)) {
      throw new TypeError(
        `Unknown built-in plugin "${name}" in preset.exclude; expected one of: ${[...KNOWN].join(', ')}`
      );
    }
  }

  const key = [...new Set(exclude)].sort().join(',');
  let plugins = resolved.get(key);
  if (!plugins) {
    const skip = new Set<string>(exclude);
    plugins = Object.freeze(base.filter((p) => !skip.has(p.name)));
    resolved.set(key, plugins);
  }
  return plugins;
}

function baseOf(name: PresetName): readonly MarkdownPlugin[] {
  if (name !== 'gfm' && name !== 'commonmark') {
    throw new TypeError(
      `Unknown preset "${String(name)}"; expected 'gfm' or 'commonmark'`
    );
  }
  return BASES[name];
}
