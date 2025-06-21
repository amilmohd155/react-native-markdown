import type { Node } from 'mdast';

let uuid = new Date().getTime();

export function getKey(node: Node): string {
  const random = ++uuid;
  return `${node.type}-${random.toString(16)}`;
}
