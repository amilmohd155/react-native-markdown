/**
 * Differential variants of F3 for the per-node-type cost sweep (issue #36,
 * task B1). Derived from F3's text by splitting it into top-level source
 * segments and keeping some kinds, so no fixture text is duplicated here.
 * Pure TypeScript (no React Native import): used by the Node sweep and by
 * the device screen (example/src/screens/ProfileBench.tsx).
 */
import { F3 } from '../fixtures';

export type SegmentKind =
  | 'code'
  | 'table'
  | 'list'
  | 'quote'
  | 'heading'
  | 'divider'
  | 'footnote'
  | 'paragraph';

export interface Segment {
  readonly kind: SegmentKind;
  readonly text: string;
}

const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s/;

/** Splits markdown written like F3 into top-level segments. */
export function segmentsOf(source: string): Segment[] {
  const lines = source.split('\n');
  const out: Segment[] = [];
  let i = 0;
  const take = (kind: SegmentKind, to: number) => {
    out.push({ kind, text: lines.slice(i, to).join('\n') });
    i = to;
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
    } else if (line.startsWith('```')) {
      let j = i + 1;
      while (j < lines.length && !lines[j]!.startsWith('```')) j++;
      take('code', Math.min(j + 1, lines.length));
    } else if (line.startsWith('|')) {
      let j = i;
      while (j < lines.length && lines[j]!.startsWith('|')) j++;
      take('table', j);
    } else if (line.startsWith('#')) {
      take('heading', i + 1);
    } else if (/^---+$/.test(line)) {
      take('divider', i + 1);
    } else if (line.startsWith('[^')) {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() !== '') j++;
      take('footnote', j);
    } else if (line.startsWith('>')) {
      let j = i;
      while (j < lines.length && lines[j]!.trim() !== '') j++;
      take('quote', j);
    } else if (LIST_MARKER.test(line)) {
      // A list runs until a blank line followed by a line that is neither
      // indented nor a list marker.
      let j = i;
      for (;;) {
        while (j < lines.length && lines[j]!.trim() !== '') j++;
        let k = j;
        while (k < lines.length && lines[k]!.trim() === '') k++;
        const next = lines[k];
        if (
          next !== undefined &&
          (LIST_MARKER.test(next) || /^\s+\S/.test(next))
        ) {
          j = k;
        } else {
          break;
        }
      }
      take('list', j);
    } else {
      let j = i;
      while (j < lines.length && lines[j]!.trim() !== '') j++;
      take('paragraph', j);
    }
  }
  return out;
}

export interface Variant {
  readonly id: string;
  readonly source: string;
  /** Which segment kinds it keeps, for the report. */
  readonly kinds: readonly SegmentKind[] | 'all-but-table' | 'all';
}

const SEGMENTS = segmentsOf(F3);

function only(kinds: readonly SegmentKind[]): string {
  return SEGMENTS.filter((s) => kinds.includes(s.kind))
    .map((s) => s.text)
    .join('\n\n');
}

/** F3 and its differential variants. `prose` is paragraphs, headings, quotes. */
export const VARIANTS: readonly Variant[] = [
  { id: 'F3', source: F3, kinds: 'all' },
  {
    id: 'no-tables',
    source: SEGMENTS.filter((s) => s.kind !== 'table')
      .map((s) => s.text)
      .join('\n\n'),
    kinds: 'all-but-table',
  },
  { id: 'tables', source: only(['table']), kinds: ['table'] },
  { id: 'code', source: only(['code']), kinds: ['code'] },
  { id: 'lists', source: only(['list']), kinds: ['list'] },
  {
    id: 'prose',
    source: only(['paragraph', 'heading', 'quote']),
    kinds: ['paragraph', 'heading', 'quote'],
  },
];
