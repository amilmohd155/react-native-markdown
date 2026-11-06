/**
 * Derives a CommonMark-only variant of a fixture (F3-cm, issue #36 / P1-25).
 *
 * v0.8.5 parses without GFM, so on F3 it does less work than v1: tables,
 * task lists, strikethrough, autolinks and footnotes are plain text to it.
 * F3-cm removes those constructs from the text so both libraries do the same
 * work. Pure and deterministic: the same input gives the same output.
 *
 * Removed (everything else is kept as is):
 * - tables: every table line (a line starting with `|`), and the blank line after
 * - task-list markers: `- [x] ` / `- [ ] ` become `- `
 * - strikethrough: `~~text~~` becomes `text`
 * - autolinks: `<https://x>` loses its brackets and a bare `https://x` loses its
 *   scheme, so no GFM autolink (or linkify match) is left; `[text](url)` links
 *   are untouched
 * - footnotes: `[^id]` references and `[^id]: text` definition lines
 *
 * Fenced code blocks and inline code spans are never touched.
 */

export interface CommonMarkRemoved {
  /** Table blocks (runs of lines starting with `|`). */
  readonly tables: number;
  /** Table lines, header and delimiter rows included. */
  readonly tableLines: number;
  readonly taskMarkers: number;
  readonly strikethrough: number;
  /** `<url>` autolinks. */
  readonly angleAutolinks: number;
  /** Bare `http(s)://` URLs. */
  readonly bareUrls: number;
  readonly footnoteRefs: number;
  readonly footnoteDefinitions: number;
}

export interface CommonMarkResult {
  readonly source: string;
  readonly removed: CommonMarkRemoved;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const TABLE_LINE = /^ {0,3}\|/;
const FOOTNOTE_DEF = /^ {0,3}\[\^[^\]\s]+\]:/;
const TASK = /^(\s*(?:[-*+]|\d+[.)]) )\[[ xX]\] /;
const ANGLE_URL = /<(https?:\/\/[^\s<>]+)>/g;
const BARE_URL = /(?<![\](<\w/.:-])https?:\/\/(?=[^\s<>)\]])/g;
const STRIKE = /~~(?=\S)([^~]*?\S)~~/g;
const FOOTNOTE_REF = /\[\^[^\]\s]+\]/g;
const CODE_SPAN = /(`+)[^`]*?\1/g;

export function toCommonMark(source: string): CommonMarkResult {
  const removed = {
    tables: 0,
    tableLines: 0,
    taskMarkers: 0,
    strikethrough: 0,
    angleAutolinks: 0,
    bareUrls: 0,
    footnoteRefs: 0,
    footnoteDefinitions: 0,
  };
  const out: string[] = [];
  let fence: string | null = null;
  let inTable = false;
  // True while the last kept line follows a dropped one, to collapse the
  // blank lines a removal would leave doubled.
  let afterDrop = false;

  for (const line of source.split('\n')) {
    if (fence !== null) {
      out.push(line);
      const close = FENCE.exec(line);
      if (
        close &&
        close[1]![0] === fence[0] &&
        close[1]!.length >= fence.length
      )
        fence = null;
      continue;
    }
    const open = FENCE.exec(line);
    if (open) {
      fence = open[1]!;
      inTable = false;
      afterDrop = false;
      out.push(line);
      continue;
    }

    if (TABLE_LINE.test(line)) {
      if (!inTable) removed.tables++;
      inTable = true;
      removed.tableLines++;
      afterDrop = true;
      continue;
    }
    inTable = false;
    if (FOOTNOTE_DEF.test(line)) {
      removed.footnoteDefinitions++;
      afterDrop = true;
      continue;
    }
    if (line.trim() === '' && afterDrop && out[out.length - 1]?.trim() === '') {
      continue;
    }
    afterDrop = false;

    out.push(stripInline(line, removed));
  }

  // The last definition leaves a trailing blank line behind: end on one \n.
  let text = out.join('\n');
  text = text.replace(/\n{2,}$/, '\n');
  return { source: text, removed };
}

type Counters = { -readonly [K in keyof CommonMarkRemoved]: number };

function stripInline(line: string, removed: Counters): string {
  const task = TASK.exec(line);
  if (task) {
    removed.taskMarkers++;
    line = task[1] + line.slice(task[0].length);
  }
  // Rewrite only outside inline code spans.
  let result = '';
  let last = 0;
  for (const span of line.matchAll(CODE_SPAN)) {
    result += stripText(line.slice(last, span.index), removed) + span[0];
    last = span.index + span[0].length;
  }
  return result + stripText(line.slice(last), removed);
}

function stripText(text: string, removed: Counters): string {
  return text
    .replace(STRIKE, (_m, inner: string) => {
      removed.strikethrough++;
      return inner;
    })
    .replace(FOOTNOTE_REF, () => {
      removed.footnoteRefs++;
      return '';
    })
    .replace(ANGLE_URL, (_m, url: string) => {
      removed.angleAutolinks++;
      return url.replace(/^https?:\/\//, '');
    })
    .replace(BARE_URL, () => {
      removed.bareUrls++;
      return '';
    });
}
