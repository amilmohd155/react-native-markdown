/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-shadow */
// @ts-ignore
import type { Node } from 'mdast';

declare module 'mdast' {
  interface Node {
    key?: string; // Add key property to all nodes
  }
}
