/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-empty-interface */
import type { Node } from 'mdast';

declare module 'mdast' {
  interface Node {
    key?: string; // Add key property to all nodes
  }
}
