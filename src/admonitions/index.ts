import { definePlugin } from '../plugins/definePlugin';
import { Admonition, DEFAULT_TITLES, type AdmonitionAttrs } from './Admonition';
import { admonitionRule, kindOf, KINDS, type AdmonitionKind } from './rule';

export type { AdmonitionAttrs } from './Admonition';
export type { AdmonitionKind } from './rule';

/** Options for {@link admonitions}. */
export type AdmonitionsOptions = {
  /** Titles by kind, replacing the English defaults (`Note`, `Tip`, ...). */
  titles?: Partial<Record<AdmonitionKind, string>>;
};

/**
 * GitHub alerts: a blockquote whose first line is `[!NOTE]` (`TIP`,
 * `IMPORTANT`, `WARNING`, `CAUTION`; any case) becomes an `Admonition` node
 * `{ kind, title }`. Anything else stays a blockquote. The resolved titles
 * are the plugin's `contextKey`, so different titles never share a cached
 * parse.
 */
export function admonitions(options?: AdmonitionsOptions) {
  const titles = Object.fromEntries(
    KINDS.map((k) => [k, options?.titles?.[k] ?? DEFAULT_TITLES[k]])
  ) as Record<AdmonitionKind, string>;
  return definePlugin<'admonitions', { Admonition: AdmonitionAttrs }>({
    name: 'admonitions',
    contextKey: JSON.stringify(titles),
    syntax: { markdownIt: admonitionRule },
    nodes: {
      Admonition: {
        kind: 'block',
        token: 'admonition',
        from: (token) => {
          const kind = kindOf(token.meta) ?? 'note';
          return { kind, title: titles[kind] };
        },
      },
    },
    components: { Admonition },
  });
}
