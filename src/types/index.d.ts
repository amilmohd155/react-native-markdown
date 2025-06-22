// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Node } from 'mdast';

declare module 'mdast' {
  interface Node {
    key?: string; // Add key property to all nodes
  }
}
