import type { Env } from 'markdown-it';
import type { HtmlMode, ParseOptions, ParserBackend } from './backend';
import { convertTokens, type ConvertResult } from './convert';
import { getMarkdownIt } from './markdownIt';

/** Parses with markdown-it and returns the table plus dev-mode warnings. */
export function parseWithMarkdownIt(
  source: string,
  options: ParseOptions = {}
): ConvertResult {
  const preset = options.preset ?? 'gfm';
  const html = options.html ?? 'safe';
  const md = getMarkdownIt(preset);
  const env: Env = {};
  const tokens = md.parse(source, env);
  return convertTokens(md, tokens, source, {
    html,
    context: documentContext(preset, html, env.references),
  });
}

/**
 * Everything outside a block's source text that changes the tree: preset,
 * html mode and the link reference definitions (P1-9). Plugins join in M2.
 */
function documentContext(
  preset: string,
  html: HtmlMode,
  references: unknown
): string {
  return JSON.stringify([preset, html, references ?? null]);
}

/** The default, pure-JS parser backend. */
export const markdownItBackend: ParserBackend = {
  name: 'markdown-it',
  parse: (source, options) => parseWithMarkdownIt(source, options).table,
};
