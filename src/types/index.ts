import 'mdast';

declare module 'mdast' {
  interface Node {
    key?: string; // Add key property to all nodes
  }
}
