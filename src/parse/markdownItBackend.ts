import type { ParseOptions, ParserBackend } from './backend';
import { convertTokens, type ConvertResult } from './convert';
import { getMarkdownIt } from './markdownIt';

/** Parses with markdown-it and returns the table plus dev-mode warnings. */
export function parseWithMarkdownIt(
  source: string,
  options: ParseOptions = {}
): ConvertResult {
  const md = getMarkdownIt(options.preset ?? 'gfm');
  const tokens = md.parse(source, {});
  return convertTokens(md, tokens, source, { html: options.html ?? 'safe' });
}

/** The default, pure-JS parser backend. */
export const markdownItBackend: ParserBackend = {
  name: 'markdown-it',
  parse: (source, options) => parseWithMarkdownIt(source, options).table,
};
