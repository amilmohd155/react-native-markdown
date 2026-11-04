import type { Env } from 'markdown-it';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import { resolvePreset } from '../plugins/presets';
import type { HtmlMode, ParseOptions, ParserBackendImpl } from './backend';
import { convertTokens, type ConvertResult } from './convert';
import { getParser } from './markdownIt';

/** Parses with markdown-it and returns the table plus dev-mode warnings. */
export function parseWithMarkdownIt(
  source: string,
  options: ParseOptions = {}
): ConvertResult {
  const html = options.html ?? 'safe';
  const { md, registry } = getParser(pluginList(options));
  const env: Env = {};
  const tokens = md.parse(source, env);
  return convertTokens(md, tokens, source, {
    html,
    registry,
    context: documentContext(html, registry.names, env.references),
  });
}

/** The preset's built-in plugins, then the user's. */
function pluginList(options: ParseOptions): readonly MarkdownPlugin[] {
  const preset = resolvePreset(options.preset ?? 'gfm');
  const extra = options.plugins;
  return extra && extra.length > 0 ? [...preset, ...extra] : preset;
}

/**
 * Everything outside a block's source text that changes the tree: html
 * mode, plugin names (which include the preset's) and the link reference
 * definitions (P1-9).
 */
function documentContext(
  html: HtmlMode,
  plugins: readonly string[],
  references: unknown
): string {
  return JSON.stringify([html, plugins, references ?? null]);
}

/** The default, pure-JS parser backend. */
export const markdownItBackend: ParserBackendImpl = {
  name: 'markdown-it',
  parse: (source, options) => parseWithMarkdownIt(source, options).table,
};
