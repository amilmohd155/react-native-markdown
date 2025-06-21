import type { Node } from 'mdast';

export function getKey(node: Node): string {
  const { start, end } = node.position ?? {};

  if (start && end) {
    return `${node.type}-${start.line}:${start.column}-${end.line}:${end.column}`;
  }

  // fallback in case position is not available (e.g., synthetic or malformed nodes)
  return `${node.type}-${Math.random().toString(16).slice(2, 8)}`;
}
