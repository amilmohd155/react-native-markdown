import { footnoteSectionIndex, footnoteTarget } from '../footnoteTargets';
import { tableFor } from './helpers';

const press = (direction: 'definition' | 'reference', reference = 1) => ({
  index: 1,
  direction,
  reference,
});

describe('footnoteSectionIndex', () => {
  it('is the last block when there are footnotes, else -1', () => {
    const table = tableFor('a[^1]\n\nb\n\n[^1]: x\n');
    expect(footnoteSectionIndex(table)).toBe(table.blockCount - 1);
    expect(footnoteSectionIndex(tableFor('plain\n\ntext'))).toBe(-1);
  });
});

describe('footnoteTarget', () => {
  const source = [
    'intro[^a]',
    '',
    '> quote with[^b]',
    '',
    '- item with[^a]',
    '',
    '| h |',
    '| - |',
    '| c[^a] |',
    '',
    '[^a]: A.',
    '[^b]: B.',
    '',
  ].join('\n');

  it('sends a reference to the section', () => {
    const table = tableFor(source);
    expect(footnoteTarget(table, 'a', press('definition'))).toBe(
      table.blockCount - 1
    );
  });

  it('sends a back-link to the top-level block of the Nth reference', () => {
    const table = tableFor(source);
    // Blocks: 0 intro, 1 quote, 2 list, 3 table, 4 section.
    expect(footnoteTarget(table, 'a', press('reference', 1))).toBe(0);
    expect(footnoteTarget(table, 'a', press('reference', 2))).toBe(2);
    expect(footnoteTarget(table, 'a', press('reference', 3))).toBe(3);
    expect(footnoteTarget(table, 'b', press('reference', 1))).toBe(1);
  });

  it('has no target for an unknown label, reference or section', () => {
    const table = tableFor(source);
    expect(footnoteTarget(table, 'zzz', press('reference'))).toBeUndefined();
    expect(footnoteTarget(table, 'b', press('reference', 2))).toBeUndefined();
    expect(
      footnoteTarget(tableFor('plain'), 'a', press('definition'))
    ).toBeUndefined();
  });
});
