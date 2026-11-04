import type { Token } from 'markdown-it';
import {
  PLUGIN_NODE_TYPE_MAX,
  PLUGIN_NODE_TYPE_MIN,
  type PluginNodeAttrs,
  type PluginNodeInfo,
} from '../model';
import type { MarkdownPlugin, PluginNodeSpec } from './definePlugin';

/** A registered plugin node, with its assigned node type id. */
export interface RegisteredNode extends PluginNodeInfo {
  readonly type: number;
  readonly from: (token: Token) => PluginNodeAttrs;
}

/**
 * The resolved plugin set of one parse configuration: node type ids and the
 * token lookup the converter uses. Built once per plugin list and cached
 * with its markdown-it instance.
 */
export interface PluginRegistry {
  readonly plugins: readonly MarkdownPlugin[];
  /** Index `type - PLUGIN_NODE_TYPE_MIN`. */
  readonly nodes: readonly RegisteredNode[];
  /** `nodes` without the converter-only fields; stored on the node table. */
  readonly info: readonly PluginNodeInfo[];
  /** Plugin names in order, for the document context (P1-9). */
  readonly names: readonly string[];
  /** Block node for a token's base type, if registered. */
  block(baseType: string): RegisteredNode | undefined;
  /** Inline node for a token's base type, if registered. */
  inline(baseType: string): RegisteredNode | undefined;
}

const NO_NODES: ReadonlyMap<string, RegisteredNode> = new Map();

export const EMPTY_REGISTRY: PluginRegistry = createRegistry([]);

/**
 * Validates a plugin list and assigns node type ids from 128 upward, in
 * plugin order. Throws on duplicate plugin or node names, a token registered
 * twice for the same kind, `inlineView` on a block node, or more than 128
 * plugin nodes (the type column is a `Uint8`).
 */
export function createRegistry(
  plugins: readonly MarkdownPlugin[]
): PluginRegistry {
  const pluginNames = new Set<string>();
  const nodeNames = new Set<string>();
  const nodes: RegisteredNode[] = [];
  const blocks = new Map<string, RegisteredNode>();
  const inlines = new Map<string, RegisteredNode>();

  for (const plugin of plugins) {
    if (!plugin.name) throw new TypeError('A plugin needs a non-empty name');
    if (pluginNames.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is registered twice`);
    }
    pluginNames.add(plugin.name);

    // Typed per plugin for authors; erased here.
    const specs: Readonly<Record<string, PluginNodeSpec>> = plugin.nodes ?? {};
    for (const [name, spec] of Object.entries(specs)) {
      const where = `plugin "${plugin.name}", node "${name}"`;
      if (nodeNames.has(name)) {
        throw new Error(`Node "${name}" is registered twice (${where})`);
      }
      if (spec.kind !== 'block' && spec.kind !== 'inline') {
        throw new TypeError(`kind must be 'block' or 'inline' (${where})`);
      }
      if (spec.inlineView && spec.kind !== 'inline') {
        throw new TypeError(
          `inlineView is only valid on inline nodes (${where})`
        );
      }
      const byToken = spec.kind === 'block' ? blocks : inlines;
      if (byToken.has(spec.token)) {
        throw new Error(
          `Token "${spec.token}" is already mapped to node "${byToken.get(spec.token)!.name}" (${where})`
        );
      }
      const type = PLUGIN_NODE_TYPE_MIN + nodes.length;
      if (type > PLUGIN_NODE_TYPE_MAX) {
        throw new RangeError(
          `Too many plugin nodes: at most ${PLUGIN_NODE_TYPE_MAX - PLUGIN_NODE_TYPE_MIN + 1} (${where})`
        );
      }
      const node: RegisteredNode = {
        type,
        name,
        kind: spec.kind,
        inlineView: spec.inlineView === true,
        from: spec.from,
      };
      nodeNames.add(name);
      nodes.push(node);
      byToken.set(spec.token, node);
    }
  }

  const blockMap = blocks.size ? blocks : NO_NODES;
  const inlineMap = inlines.size ? inlines : NO_NODES;
  return {
    plugins,
    nodes,
    info: Object.freeze(
      nodes.map(({ name, kind, inlineView }) =>
        Object.freeze({ name, kind, inlineView })
      )
    ),
    names: plugins.map((p) => p.name),
    block: (baseType) => blockMap.get(baseType),
    inline: (baseType) => inlineMap.get(baseType),
  };
}

/** `container_note_open` → `container_note`; self-contained types unchanged. */
export function baseTokenType(token: Token): string {
  if (token.nesting === 1) return token.type.replace(/_open$/, '');
  if (token.nesting === -1) return token.type.replace(/_close$/, '');
  return token.type;
}
