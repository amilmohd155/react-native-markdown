import {
  createElement,
  type Attributes,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  getAttrs,
  PLUGIN_NODE_TYPE_MIN,
  type NodeTable,
  type PluginNodeAttrs,
  type PluginNodeInfo,
} from '../model';
import type { ElementStyle } from '../theme';
import type { RenderCtx } from './context';
import { isDev } from './devInline';

/**
 * Rendering of plugin nodes: node types 128+, named by the plugin's `nodes`.
 * Spec: docs/rewrite/04-api.md#plugins
 *
 * A plugin node renders through the component registered under its name
 * (plugin `components`, or the `components` prop), with the attributes its
 * `from(token)` returned as props, plus `style` from the theme and, for
 * container nodes, `children`.
 */

const NO_ATTRS: PluginNodeAttrs = Object.freeze({});
const NO_STYLE: ElementStyle = Object.freeze({ text: {}, container: {} });

type PluginComponent = ComponentType<Record<string, unknown>>;

const warned = new Set<string>();

/** Test hook: forget which missing components already warned. */
export function resetPluginWarnings(): void {
  warned.clear();
}

/** The plugin node info for `id`, or `undefined` for built-in nodes. */
export function pluginNodeOf(
  table: NodeTable,
  id: number
): PluginNodeInfo | undefined {
  const type = table.type[id]!;
  return type >= PLUGIN_NODE_TYPE_MIN
    ? table.pluginNodes[type - PLUGIN_NODE_TYPE_MIN]
    : undefined;
}

/** The props `from(token)` produced for plugin node `id`. */
export function pluginPropsOf(table: NodeTable, id: number): PluginNodeAttrs {
  return (getAttrs(table, id) as PluginNodeAttrs | null) ?? NO_ATTRS;
}

/** The component for plugin element `name`, if the map has one. */
export function pluginComponentOf(
  ctx: RenderCtx,
  name: string
): PluginComponent | undefined {
  const component = (ctx.components as unknown as Record<string, unknown>)[
    name
  ];
  if (component !== undefined) return component as PluginComponent;
  if (isDev() && !warned.has(name)) {
    warned.add(name);
    console.warn(
      `[react-native-markdown] No component for the plugin element "${name}": ` +
        "its content renders without a wrapper. Add one to the plugin's `components` or the `components` prop."
    );
  }
  return undefined;
}

/** The resolved style of plugin element `name` (empty without overrides). */
export function pluginStyleOf(ctx: RenderCtx, name: string): ElementStyle {
  return ctx.theme.pluginElements[name] ?? NO_STYLE;
}

/** Calls the plugin component, keyed by node id. */
export function createPluginElement(
  component: PluginComponent,
  key: number,
  props: PluginNodeAttrs,
  style: ElementStyle,
  children: ReactNode | undefined,
  extra?: Record<string, unknown>
): ReactNode {
  const full: Record<string, unknown> = { ...props, ...extra, style, key };
  if (children !== undefined) full.children = children;
  return createElement(component, full as Record<string, unknown> & Attributes);
}
