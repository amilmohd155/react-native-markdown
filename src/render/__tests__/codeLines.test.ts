import {
  codeChunks,
  codeLineCount,
  codeLines,
  gutterText,
  rowText,
  singleGutterText,
  type CodeChunk,
} from '../codeLines';

const texts = (chunks: readonly CodeChunk[]) => chunks.map((c) => c.text);

/** Every chunk's numbers follow on from the previous chunk's. */
function expectContinuous(code: string, chunks: readonly CodeChunk[]) {
  let next = 1;
  for (const chunk of chunks) {
    expect(chunk.firstLine).toBe(next);
    expect(chunk.lineCount).toBeGreaterThan(0);
    next += chunk.lineCount;
  }
  expect(next - 1).toBe(codeLineCount(code));
}

describe('codeLines and codeLineCount', () => {
  it('has no lines for an empty string', () => {
    expect(codeLines('')).toEqual([]);
    expect(codeLineCount('')).toBe(0);
    expect(codeChunks('', false)).toEqual([]);
    expect(codeChunks('', true)).toEqual([]);
  });

  it('counts a single line with or without a final newline', () => {
    expect(codeLines('a')).toEqual(['a']);
    expect(codeLines('a\n')).toEqual(['a']);
    expect(codeLineCount('a')).toBe(1);
    expect(codeLineCount('a\n')).toBe(1);
  });

  it('opens no extra line for a final newline, but keeps blank lines', () => {
    expect(codeLines('a\nb\n')).toEqual(['a', 'b']);
    expect(codeLines('a\n\nb\n\n')).toEqual(['a', '', 'b', '']);
    expect(codeLines('\n')).toEqual(['']);
    expect(codeLineCount('a\n\nb\n\n')).toBe(4);
    expect(codeLineCount('\n')).toBe(1);
  });

  it('splits on \\n only: a CR stays in its line (the parser normalises CRLF)', () => {
    expect(codeLines('a\r\nb\r\n')).toEqual(['a\r', 'b\r']);
    expect(codeLineCount('a\r\nb\r\n')).toBe(2);
    // A line of only `\r` is blank, so grouping matches the LF form.
    const crlf = codeChunks('a\r\nb\r\n\r\nc\r\nd\r\n', true);
    const lf = codeChunks('a\nb\n\nc\nd\n', true);
    expect(crlf.map((c) => c.lineCount)).toEqual(lf.map((c) => c.lineCount));
  });

  it('agrees with codeLines on the count', () => {
    for (const code of ['x', 'x\n', 'x\ny', '\n\n', 'a\n\n\nb', ' \n']) {
      expect(codeLineCount(code)).toBe(codeLines(code).length);
    }
  });
});

describe('codeChunks', () => {
  it('groups complete lines in twos', () => {
    const code = 'a\nb\nc\nd\ne\n';
    expect(texts(codeChunks(code, true))).toEqual(['a\nb\n', 'c\nd\n', 'e\n']);
    expect(codeChunks(code, true).map((c) => c.firstLine)).toEqual([1, 3, 5]);
  });

  it('puts an incomplete last line in the last chunk', () => {
    const chunks = codeChunks('a\nb\nc', true);
    expect(texts(chunks)).toEqual(['a\nb\n', 'c']);
    expect(chunks[1]).toEqual({ text: 'c', firstLine: 3, lineCount: 1 });
  });

  it('extends a chunk over blank lines in the middle', () => {
    const code = 'a\n\n  \nb\nc\nd\n';
    const chunks = codeChunks(code, true);
    expect(texts(chunks)).toEqual(['a\n\n  \nb\n', 'c\nd\n']);
    expect(chunks.map((c) => c.lineCount)).toEqual([4, 2]);
    expectContinuous(code, chunks);
  });

  it('keeps a trailing run of blank lines in the last chunk', () => {
    const code = 'a\nb\n\n\n';
    const chunks = codeChunks(code, true);
    expect(texts(chunks)).toEqual(['a\nb\n', '\n\n']);
    expect(chunks[1]).toMatchObject({ firstLine: 3, lineCount: 2 });
    expectContinuous(code, chunks);
  });

  it('never ends a chunk other than the last in a blank line', () => {
    const lines = Array.from({ length: 200 }, (_, i) =>
      i % 3 === 1 || i % 7 === 0 ? (i % 2 ? '' : '   ') : `line ${i}`
    );
    const code = lines.join('\n') + '\n';
    const chunks = codeChunks(code, true);
    for (const chunk of chunks.slice(0, -1)) {
      const own = codeLines(chunk.text);
      expect(own.length).toBe(chunk.lineCount);
      expect(own.length).toBeGreaterThanOrEqual(2);
      expect(own[own.length - 1]?.trim()).not.toBe('');
    }
    expectContinuous(code, chunks);
  });

  it('on web, chunks concatenate back to the code exactly', () => {
    for (const code of [
      'a',
      'a\n',
      'a\nb\nc',
      'a\n\n\nb\n\n',
      '\n\n\n',
      'x\r\ny\r\n\r\nz',
    ]) {
      const chunks = codeChunks(code, true);
      expect(texts(chunks).join('')).toBe(code);
      expectContinuous(code, chunks);
    }
  });

  it('on native, drops the final newline of every chunk but the last', () => {
    const code = 'a\nb\nc\nd\ne\n';
    const native = codeChunks(code, false);
    expect(texts(native)).toEqual(['a\nb', 'c\nd', 'e\n']);
    // Same grouping and numbers as web; joining with \n restores the code.
    const web = codeChunks(code, true);
    const numbers = (chunks: readonly CodeChunk[]) =>
      chunks.map((c) => [c.firstLine, c.lineCount]);
    expect(numbers(native)).toEqual(numbers(web));
    expect(texts(native).join('\n')).toBe(code);
  });

  it('on native, keeps a last chunk without a newline as is', () => {
    expect(texts(codeChunks('a\nb\nc', false))).toEqual(['a\nb', 'c']);
    expect(texts(codeChunks('a\nb\n', false))).toEqual(['a\nb\n']);
  });

  it('chunks a long block in linear time', () => {
    const block = (n: number) =>
      Array.from({ length: n }, (_, i) => (i % 5 === 4 ? '' : `x = ${i}`)).join(
        '\n'
      ) + '\n';
    const code = block(5_000);
    const chunks = codeChunks(code, true);
    expect(texts(chunks).join('')).toBe(code);
    expectContinuous(code, chunks);
    expect(codeLineCount(code)).toBe(5_000);

    // Loose scaling check, no absolute bound: best of several runs, 10x the
    // input must cost well under the 100x a quadratic pass would.
    const best = (input: string) => {
      let min = Infinity;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        codeChunks(input, false);
        min = Math.min(min, performance.now() - start);
      }
      return Math.max(min, 0.05);
    };
    const small = block(1_000);
    const large = block(10_000);
    best(large); // warm up
    expect(best(large) / best(small)).toBeLessThan(40);
  });
});

describe('gutterText', () => {
  it('lists the chunk line numbers, one per line', () => {
    expect(gutterText({ text: 'a\nb\n', firstLine: 1, lineCount: 2 })).toBe(
      '1\n2'
    );
    const chunks = codeChunks('a\nb\n\n\nc\nd\ne', false);
    expect(chunks.map(gutterText)).toEqual(['1\n2', '3\n4\n5', '6\n7']);
  });
});

describe('singleGutterText', () => {
  it('shows line 1 for an empty block', () => {
    expect(singleGutterText('')).toBe('1');
  });

  it('numbers one line, with a bare newline after a final newline', () => {
    expect(singleGutterText('a')).toBe('1');
    expect(singleGutterText('a\n')).toBe('1\n');
  });

  it('numbers trailing blank lines and adds one bare newline', () => {
    expect(singleGutterText('a\nb')).toBe('1\n2');
    expect(singleGutterText('a\n\n')).toBe('1\n2\n');
    expect(singleGutterText('a\n\n\n')).toBe('1\n2\n3\n');
    // Native draws as many lines as the code Text (split on `\n`).
    for (const code of ['a', 'a\n', 'a\n\n', 'a\n\n\n', '\n']) {
      expect(singleGutterText(code).split('\n')).toHaveLength(
        code.split('\n').length
      );
    }
  });
});

describe('rowText', () => {
  it('native: a blank line holds a space, newlines never kept', () => {
    expect(rowText('', true, false)).toBe(' ');
    expect(rowText('', false, false)).toBe(' ');
    expect(rowText('a', true, false)).toBe('a');
    expect(rowText('  ', true, false)).toBe('  ');
  });

  it('web: the line keeps its own newline, a blank line stays empty', () => {
    expect(rowText('', true, true)).toBe('\n');
    expect(rowText('a', true, true)).toBe('a\n');
    expect(rowText('a', false, true)).toBe('a');
  });

  it('web rows concatenate back to the code', () => {
    for (const code of ['a\n\nb', 'a\n\nb\n', 'a\n\n\n', 'x']) {
      const lines = codeLines(code);
      const rows = lines.map((line, i) =>
        rowText(line, i < lines.length - 1 || code.endsWith('\n'), true)
      );
      expect(rows.join('')).toBe(code);
    }
  });
});
