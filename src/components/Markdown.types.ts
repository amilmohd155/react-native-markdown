import type { ASTRendererOptions } from './ASTRenderer.types';

export interface MarkdownProps extends ASTRendererOptions {
  markdown: Uint8Array | string;
}
