import type { MarkdownPlugin } from '../plugins/definePlugin';
import { defaultComponents } from '../render/defaults';
import type { Components } from '../render/elements';

/**
 * The component map of one `<Markdown>`: defaults → plugins (in order) →
 * the `components` prop. A later layer replaces an earlier one per element.
 * Spec: docs/rewrite/04-api.md#plugins
 *
 * Returns `defaultComponents` itself when nothing overrides it, so the
 * common case shares one map (and one render context) across instances.
 */
export function mergeComponents(
  plugins: readonly MarkdownPlugin[],
  components: Partial<Components> | undefined
): Components {
  let merged: Record<string, unknown> | null = null;
  const layer = (source: object | undefined) => {
    if (!source) return;
    for (const [name, component] of Object.entries(source)) {
      if (component === undefined) continue;
      merged ??= { ...defaultComponents };
      merged[name] = component;
    }
  };
  for (const plugin of plugins) layer(plugin.components);
  layer(components);
  return (merged ?? defaultComponents) as Components;
}
