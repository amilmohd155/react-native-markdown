import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type SpecSuite = 'commonmark' | 'gfm' | 'gfm-extensions';

export interface SpecExample {
  suite: SpecSuite;
  /** 1-based, in file order, as the spec numbers them. */
  example: number;
  section: string;
  /** 1-based line of the opening fence in the fixture file. */
  line: number;
  /** Extension named on the fence (`example table`), if any. */
  extension: string | null;
  markdown: string;
  html: string;
}

const FIXTURES = join(__dirname, '..', 'fixtures');
const FENCE = '`'.repeat(32);

/**
 * Reads a spec file in the CommonMark spec format (also used by cmark-gfm's
 * spec.txt and extensions.txt): examples sit between a 32-backtick fence
 * with the word `example` and a closing 32-backtick fence; a line with a
 * single `.` separates markdown from expected HTML; `→` stands for a tab.
 * Mirrors the behaviour of the spec's own `spec_tests.py --dump-tests`.
 */
export function readSpec(file: string, suite: SpecSuite): SpecExample[] {
  const lines = readFileSync(join(FIXTURES, file), 'utf8').split('\n');
  const examples: SpecExample[] = [];

  let section = '';
  let inExample = false;
  let inHtml = false;
  let markdown: string[] = [];
  let html: string[] = [];
  let start = 0;
  let extension: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (!inExample) {
      if (line.trim() === '<!-- END TESTS -->') break;
      const heading = /^#{1,6} (.*)$/.exec(line);
      if (heading) section = heading[1]!.trim();
      if (line.startsWith(FENCE) && /\bexample\b/.test(line)) {
        inExample = true;
        inHtml = false;
        markdown = [];
        html = [];
        start = i + 1;
        const ext = line.slice(FENCE.length).trim().split(/\s+/)[1];
        extension = ext ?? null;
      }
      continue;
    }

    if (line.startsWith(FENCE)) {
      examples.push({
        suite,
        example: examples.length + 1,
        section,
        line: start,
        extension,
        markdown: toText(markdown),
        html: toText(html),
      });
      inExample = false;
      continue;
    }

    if (line === '.' && !inHtml) {
      inHtml = true;
      continue;
    }

    (inHtml ? html : markdown).push(line);
  }

  return examples;
}

function toText(lines: string[]): string {
  return lines.length === 0 ? '' : lines.join('\n').replace(/→/g, '\t') + '\n';
}
