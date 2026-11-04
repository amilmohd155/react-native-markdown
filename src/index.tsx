/**
 * Package entry point.
 *
 * The `v1` branch is mid-rewrite, and two implementations live side by side
 * until Phase 1 · M5:
 *
 * - v0.x (exported below): components/, libs/, types/, utils/. It stays the
 *   public API so the example app and CI keep working. Removed when M5 swaps
 *   this entry point and M6 migrates the example.
 * - v1 (not exported yet): model/, parse/, plugins/, render/, theme/, api/.
 *   Built milestone by milestone.
 *
 * Design: docs/rewrite/ · Plan: docs/rewrite/phase-1/ · Tracking: issue #7
 */
import './types';

export { default as Markdown } from './components/Markdown';
export type { MarkdownProps } from './components/Markdown.types';

export type { RenderRules } from './components/ASTRenderer.types';
export type { StyleMap } from './types/style';
