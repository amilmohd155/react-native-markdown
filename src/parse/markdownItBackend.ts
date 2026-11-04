import type { Env } from 'markdown-it';
import type { HtmlMode, ParseOptions, ParserBackend } from './backend';
import { convertTokens, type ConvertResult } from './convert';
import { getParser } from './markdownIt';

/** Parses with markdown-it and returns the table plus dev-mode warnings. */
export function parseWithMarkdownIt(
  source: string,
  options: ParseOptions = {}
): ConvertResult {
  const preset = options.preset ?? 'gfm';
  const html = options.html ?? 'safe';
  const { md, registry } = getParser(preset, options.plugins);
  const env: Env = {};
  const tokens = md.parse(source, env);
  return convertTokens(md, tokens, source, {
    html,
    registry,
    context: documentContext(preset, html, registry.names, env.references),
  });
}

/**
 * Everything outside a block's source text that changes the tree: preset,
 * html mode, plugin names and the link reference definitions (P1-9).
 */
function documentContext(
  preset: string,
  html: HtmlMode,
  plugins: readonly string[],
  references: unknown
): string {
  return JSON.stringify([preset, html, plugins, references ?? null]);
}

/** The default, pure-JS parser backend. */
export const markdownItBackend: ParserBackend = {
  name: 'markdown-it',
  parse: (source, options) => parseWithMarkdownIt(source, options).table,
};
