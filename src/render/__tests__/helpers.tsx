import { createElement, type ComponentType, type ReactNode } from 'react';
import { tableOf } from '../../api/document';
import { parse, type ParseOptions } from '../../api/parse';
import type { NodeTable } from '../../model';
import { ELEMENT_NAMES, type ElementName } from '../../theme';
import type { Components } from '../elements';

/** The node table for `source`. */
export function tableFor(source: string, options?: ParseOptions): NodeTable {
  return tableOf(parse(source, options));
}

/** Node ids of every node of `type`, in document order. */
export function nodesOfType(table: NodeTable, type: number): number[] {
  const ids: number[] = [];
  for (let id = 0; id < table.count; id++) {
    if (table.type[id] === type) ids.push(id);
  }
  return ids;
}

type AnyElementProps = { children?: ReactNode; style?: unknown } & Record<
  string,
  unknown
>;

/**
 * A component map rendering each element as a host node named after it
 * (`<Heading level={1}>`), without `style`, for readable assertions.
 * `overrides` replace single elements.
 */
export function hostComponents(
  overrides: Partial<Record<ElementName, ComponentType<never>>> = {}
): Components {
  const map: Record<string, ComponentType<AnyElementProps>> = {};
  for (const name of ELEMENT_NAMES) {
    map[name] = ({ children, style: _style, ...props }: AnyElementProps) =>
      createElement(name, props, children);
  }
  return Object.freeze({ ...map, ...overrides }) as unknown as Components;
}
