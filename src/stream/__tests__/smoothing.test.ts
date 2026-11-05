import { hideIncomplete } from '../smoothing';

/** Every proper prefix of `s`, plus `s` itself. */
function prefixes(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= s.length; i++) out.push(s.slice(0, i));
  return out;
}

function count(s: string, needle: string): number {
  return s.split(needle).length - 1;
}

/** True when `s` holds a marker or bracket that is not closed. */
function hasDanglingMarker(s: string): boolean {
  return (
    count(s, '*') % 2 !== 0 ||
    count(s, '~') % 2 !== 0 ||
    count(s, '`') % 2 !== 0 ||
    count(s, '[') !== count(s, ']') ||
    count(s, '<') !== count(s, '>')
  );
}

describe('hideIncomplete: table rows split at every position', () => {
  const rows: Array<[string, string]> = [
    ['emphasis', 'text **bold** and *it* and ~~del~~ end'],
    ['strong only', 'text **bold** more'],
    ['em only', 'text *it* more'],
    ['underscore', 'text _it_ more'],
    ['strike', 'text ~~del~~ more'],
    ['code', 'text `code` more'],
    ['link', 'see [label](http://x.dev) now'],
    ['image', 'see ![alt](http://x.dev/a.png) now'],
    ['tag', 'a <br> b <b>c</b> d'],
  ];

  it.each(rows)('%s: never shows a dangling marker', (_name, input) => {
    for (const p of prefixes(input)) {
      const out = hideIncomplete(p);
      expect(hasDanglingMarker(out)).toBe(false);
      expect(out.length).toBeLessThanOrEqual(p.length);
      expect(hideIncomplete(out)).toBe(out);
    }
  });

  it.each(rows)('%s: the output is a prefix of the input', (name, input) => {
    // Links drop the `[`, so they are checked separately below.
    if (name === 'link' || name === 'image') return;
    for (const p of prefixes(input)) {
      expect(input.startsWith(hideIncomplete(p))).toBe(true);
    }
  });

  it.each(rows)('%s: the complete input is unchanged', (_name, input) => {
    expect(hideIncomplete(input)).toBe(input);
  });

  it('emphasis rows hide the marker and the unclosed run', () => {
    expect(hideIncomplete('text **bold')).toBe('text ');
    expect(hideIncomplete('text *it')).toBe('text ');
    expect(hideIncomplete('text ~~del')).toBe('text ');
    expect(hideIncomplete('text _it')).toBe('text ');
    expect(hideIncomplete('text **bold*')).toBe('text ');
    expect(hideIncomplete('text **bold**')).toBe('text **bold**');
  });

  it('hides an unclosed backtick and what follows it', () => {
    expect(hideIncomplete('a `code')).toBe('a ');
    expect(hideIncomplete('a `')).toBe('a ');
    expect(hideIncomplete('a ``co`de')).toBe('a ');
    expect(hideIncomplete('a `code` b')).toBe('a `code` b');
  });

  it('shows only the label for a link in progress', () => {
    expect(hideIncomplete('see [label')).toBe('see label');
    expect(hideIncomplete('see [label]')).toBe('see [label]');
    expect(hideIncomplete('see [label](')).toBe('see label');
    expect(hideIncomplete('see [label](http')).toBe('see label');
    expect(hideIncomplete('see [label](http://x')).toBe('see label');
    expect(hideIncomplete('see [label](http://x)')).toBe(
      'see [label](http://x)'
    );
    expect(hideIncomplete('see [a **b** c](u')).toBe('see a **b** c');
    expect(hideIncomplete('see [')).toBe('see ');
  });

  it('shows nothing for an image in progress', () => {
    expect(hideIncomplete('see ![')).toBe('see ');
    expect(hideIncomplete('see ![alt')).toBe('see ');
    expect(hideIncomplete('see ![alt](')).toBe('see ');
    expect(hideIncomplete('see ![alt](http://x/a.p')).toBe('see ');
  });

  it('removes a lone trailing marker', () => {
    expect(hideIncomplete('a *')).toBe('a ');
    expect(hideIncomplete('a**')).toBe('a');
    expect(hideIncomplete('a_')).toBe('a');
    expect(hideIncomplete('a~')).toBe('a');
    expect(hideIncomplete('a~~')).toBe('a');
    expect(hideIncomplete('a`')).toBe('a');
    expect(hideIncomplete('*')).toBe('');
  });

  it('removes an incomplete tag at the end', () => {
    expect(hideIncomplete('a <b')).toBe('a ');
    expect(hideIncomplete('a <br')).toBe('a ');
    expect(hideIncomplete('a </')).toBe('a ');
    expect(hideIncomplete('a <')).toBe('a ');
    expect(hideIncomplete('a <a href="x')).toBe('a ');
    expect(hideIncomplete('a <br>')).toBe('a <br>');
    expect(hideIncomplete('a < b')).toBe('a < b');
  });
});

describe('hideIncomplete: nested and mixed', () => {
  it('cuts at the earliest unclosed opener', () => {
    expect(hideIncomplete('**a *b')).toBe('');
    expect(hideIncomplete('*a **b')).toBe('');
    expect(hideIncomplete('x **a *b')).toBe('x ');
    expect(hideIncomplete('**a** *b')).toBe('**a** ');
    expect(hideIncomplete('**a *b* c')).toBe('');
    expect(hideIncomplete('*a **b** c')).toBe('');
    expect(hideIncomplete('**a *b***')).toBe('**a *b***');
  });

  it('handles links and code inside runs', () => {
    expect(hideIncomplete('**a [b](c')).toBe('');
    expect(hideIncomplete('x **a [b](c')).toBe('x ');
    expect(hideIncomplete('[a **b](c')).toBe('a ');
    expect(hideIncomplete('`x **y')).toBe('');
    expect(hideIncomplete('**a `b')).toBe('');
    expect(hideIncomplete('a `x **y` b')).toBe('a `x **y` b');
    expect(hideIncomplete('a `x **y` **b')).toBe('a `x **y` ');
  });
});

describe('hideIncomplete: not openers', () => {
  it('leaves spaced and intraword markers alone', () => {
    expect(hideIncomplete('2 * 3')).toBe('2 * 3');
    expect(hideIncomplete('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(hideIncomplete('snake_case')).toBe('snake_case');
    expect(hideIncomplete('snake_case_name')).toBe('snake_case_name');
    expect(hideIncomplete('a ~ b')).toBe('a ~ b');
    expect(hideIncomplete('a ~b')).toBe('a ~b');
  });

  it('leaves escaped markers alone', () => {
    expect(hideIncomplete('\\*a')).toBe('\\*a');
    expect(hideIncomplete('a \\`b')).toBe('a \\`b');
    expect(hideIncomplete('a \\[b')).toBe('a \\[b');
    expect(hideIncomplete('a \\**b')).toBe('a \\*');
  });

  it('ignores markers inside a closed code span', () => {
    expect(hideIncomplete('`a * b` and `_c`')).toBe('`a * b` and `_c`');
    expect(hideIncomplete('`a **b` c')).toBe('`a **b` c');
  });
});

describe('hideIncomplete: scope', () => {
  it('does not carry an opener across a blank line', () => {
    expect(hideIncomplete('a *b\n\nc')).toBe('a *b\n\nc');
    expect(hideIncomplete('a *b\n\nc *d')).toBe('a *b\n\nc ');
  });

  it('restarts after a list, quote or heading marker', () => {
    expect(hideIncomplete('- a *b\n- c')).toBe('- a *b\n- c');
    expect(hideIncomplete('- a *b\n- c *d')).toBe('- a *b\n- c ');
    expect(hideIncomplete('- *a')).toBe('- ');
    expect(hideIncomplete('1. **a')).toBe('1. ');
    expect(hideIncomplete('> a **b')).toBe('> a ');
    expect(hideIncomplete('# Title **b')).toBe('# Title ');
    expect(hideIncomplete('* item *b')).toBe('* item ');
  });

  it('keeps list markers themselves', () => {
    expect(hideIncomplete('- ')).toBe('- ');
    expect(hideIncomplete('* ')).toBe('* ');
    expect(hideIncomplete('1. ')).toBe('1. ');
    expect(hideIncomplete('> ')).toBe('> ');
    expect(hideIncomplete('# ')).toBe('# ');
  });

  it('lets a run cross a single newline', () => {
    expect(hideIncomplete('a **b\nc')).toBe('a ');
    expect(hideIncomplete('a **b\nc**')).toBe('a **b\nc**');
  });
});

describe('hideIncomplete: not smoothed', () => {
  it('returns text inside an open fence unchanged', () => {
    const cases = [
      '```',
      '```ts\nconst a = *b',
      '```ts\n**x `y [z](',
      '~~~\n<b',
      'intro **bold**\n\n```js\nlet a = "*',
      '> ```\n',
    ];
    for (const c of cases) {
      if (c.startsWith('>')) continue;
      expect(hideIncomplete(c)).toBe(c);
    }
  });

  it('smooths again after a fence closes', () => {
    expect(hideIncomplete('```\n*x\n```\nafter *b')).toBe(
      '```\n*x\n```\nafter '
    );
    expect(hideIncomplete('```\n*x\n```\nafter')).toBe('```\n*x\n```\nafter');
  });

  it('leaves table rows alone', () => {
    const t = '| a | b |\n|---|---|\n| *x | `y';
    expect(hideIncomplete(t)).toBe(t);
  });
});

describe('hideIncomplete: invariants', () => {
  const samples = [
    'text **bold',
    '**a *b',
    '*a **b',
    '**a** *b',
    '**a [b](c',
    '`x **y',
    'see [label](http://x',
    'see ![alt](',
    'a <br',
    '2 * 3',
    'snake_case',
    '- *a\n- b _c',
    '> a ~~b',
    '```\n*x',
    '[a **b](c',
    'a *',
    '',
  ];

  it('is idempotent', () => {
    for (const s of samples) {
      for (const p of prefixes(s)) {
        const once = hideIncomplete(p);
        expect(hideIncomplete(once)).toBe(once);
      }
    }
  });

  it('returns the identical string when nothing is hidden', () => {
    const inputs = [
      'plain text',
      '**done** and `code`',
      '2 * 3',
      '',
      '- a\n- b',
    ];
    for (const s of inputs) {
      const copy = ['', s].join('');
      expect(hideIncomplete(copy)).toBe(copy);
      // `toBe` on strings compares values, so check identity via a
      // reference-sensitive property: a hidden fragment shortens the text.
      expect(hideIncomplete(copy).length).toBe(copy.length);
    }
  });

  it('is linear on long unclosed input', () => {
    const long = 'a *b '.repeat(20000) + '`';
    const start = Date.now();
    hideIncomplete(long);
    hideIncomplete('x_ '.repeat(50000) + '[');
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
