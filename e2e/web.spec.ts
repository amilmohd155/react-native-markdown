import { expect, test, type Page } from '@playwright/test';
import {
  HIGHLIGHT_CODE,
  HIGHLIGHT_LARGE_CODE,
  LONG_LINE_CODE,
  NUMBERED_CODE,
  NUMBERED_LONG_LINE,
  NUMBERED_SMALL_CODE,
  WEB_FIXTURES,
} from '../test/web/fixtures';

/**
 * Web smoke test: the example app's `/#smoke` screen renders the shared
 * fixtures (test/web/fixtures.ts) in a real browser. Text must be in the
 * page; links must be pressable and open their URL.
 */
test.beforeEach(async ({ page }) => {
  // Record window.open instead of opening tabs (react-native-web's
  // Linking.openURL uses it).
  await page.addInitScript(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = (url) => {
      (window as unknown as { opened: string[] }).opened.push(String(url));
      return null;
    };
  });
  await page.goto('/#smoke');
  await expect(page.getByTestId(WEB_FIXTURES[0]!.name)).toBeVisible();
});

for (const fixture of WEB_FIXTURES) {
  test(`renders ${fixture.name}`, async ({ page }) => {
    const box = page.getByTestId(fixture.name);
    for (const text of fixture.text) {
      await expect(box).toContainText(text);
    }
  });

  for (const alt of fixture.images ?? []) {
    test(`shows the ${alt} image of ${fixture.name}`, async ({ page }) => {
      await expect(
        page.getByTestId(fixture.name).locator('img').first()
      ).toHaveAttribute('alt', alt);
    });
  }

  for (const href of fixture.links ?? []) {
    test(`opens ${href} from ${fixture.name}`, async ({ page }) => {
      await page.getByTestId(fixture.name).getByRole('link').first().click();
      const opened = await page.evaluate(
        () => (window as unknown as { opened: string[] }).opened
      );
      expect(opened).toEqual([href]);
    });
  }
}

test('highlights a small ts fence as one text of coloured spans', async ({
  page,
}) => {
  const block = await page.getByTestId('highlight').evaluate((root, code) => {
    // The deepest element holding the whole code with spans inside: the
    // block's one Text (its ancestors hold the same text).
    const holders = Array.from(root.querySelectorAll('*')).filter(
      (el) => el.textContent === code && el.querySelector('span') !== null
    );
    const text = holders[holders.length - 1];
    if (text === undefined) return null;
    const colours = new Set(
      Array.from(
        text.querySelectorAll('span'),
        (s) => getComputedStyle(s).color
      )
    );
    colours.add(getComputedStyle(text).color);
    return { text: text.textContent, colours: colours.size };
  }, HIGHLIGHT_CODE);
  expect(block?.text).toBe(HIGHLIGHT_CODE);
  expect(block?.colours).toBeGreaterThanOrEqual(3);
});

test('selects a chunked highlighted block as the code exactly', async ({
  page,
}) => {
  const selected = await page
    .getByTestId('highlight-large')
    .evaluate((root) => {
      // The column of chunk Texts: the parent of the first non-empty Text.
      const first = Array.from(root.querySelectorAll('div[dir]')).find(
        (el) => el.textContent !== ''
      );
      const column = first?.parentElement;
      if (column === null || column === undefined) return null;
      const range = document.createRange();
      range.selectNodeContents(column);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return { chunks: column.children.length, text: selection.toString() };
    });
  expect(selected?.chunks).toBeGreaterThan(100);
  expect(selected?.text).toBe(HIGHLIGHT_LARGE_CODE);
});

test('draws a chunked highlighted block as tall as the plain one', async ({
  page,
}) => {
  const height = (id: string) =>
    page
      .getByTestId(id)
      .evaluate((root) => root.getBoundingClientRect().height);
  expect(await height('highlight-large')).toBeCloseTo(
    await height('plain-large'),
    0
  );
});

// The code block header (P3-35): fixtures with `codeBlock={{ header: true }}`
// and an `onCopyPress` that writes the clipboard.
const HEADER_FIXTURES = [
  { id: 'codeblock-header', code: HIGHLIGHT_CODE },
  { id: 'codeblock-header-highlight', code: HIGHLIGHT_CODE },
  { id: 'codeblock-header-long', code: LONG_LINE_CODE },
];

for (const { id, code } of HEADER_FIXTURES) {
  test(`shows a header with the language and Copy on ${id}`, async ({
    page,
  }) => {
    const box = page.getByTestId(id);
    await expect(box.getByText('ts', { exact: true })).toBeVisible();
    await expect(box.getByRole('button', { name: 'Copy code' })).toBeVisible();
  });

  test(`keeps the header outside the labelled code on ${id}`, async ({
    page,
  }) => {
    const labelled = await page.getByTestId(id).evaluate(
      (root, text) =>
        Array.from(root.querySelectorAll('[aria-label]'))
          .filter((el) => el.getAttribute('aria-label') === text)
          .map((el) => ({
            buttons: el.querySelectorAll('button, [role="button"]').length,
            text: el.textContent,
          })),
      code
    );
    expect(labelled).toEqual([{ buttons: 0, text: code }]);
  });

  test(`copies exactly the code from ${id}`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const box = page.getByTestId(id);
    await box.getByRole('button', { name: 'Copy code' }).click();
    await expect(page.getByTestId(`${id}-status`)).toHaveText(
      `copied ${code.length} chars`
    );
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(code);
  });
}

test('keeps the header in place while long code scrolls', async ({ page }) => {
  const box = page.getByTestId('codeblock-header-long');
  const copy = box.getByRole('button', { name: 'Copy code' });
  const label = box.getByText('ts', { exact: true });
  const before = [await copy.boundingBox(), await label.boundingBox()];
  const scrolled = await box.evaluate((root) => {
    // The body's horizontal ScrollView: the element that overflows in x.
    const scroller = Array.from(root.querySelectorAll('div')).find(
      (el) => el.scrollWidth > el.clientWidth + 100
    );
    if (scroller === undefined) return null;
    scroller.scrollLeft = 300;
    return scroller.scrollLeft;
  });
  expect(scrolled).toBeGreaterThan(0);
  const after = [await copy.boundingBox(), await label.boundingBox()];
  expect(after).toEqual(before);
});

test('shows no header when the option is off', async ({ page }) => {
  for (const id of ['code', 'highlight', 'plain-large']) {
    await expect(page.getByTestId(id).getByRole('button')).toHaveCount(0);
  }
});

// Line numbers and wrap (P3-35): `NUMBERED_CODE` with the header on.
// `gutter` is numbers without wrap (a fixed gutter column beside the
// horizontal scroller), `rows` numbers with wrap (one row per line).
const NUMBERED_FIXTURES = [
  { id: 'codeblock-numbers', layout: 'gutter' },
  { id: 'codeblock-numbers-highlight', layout: 'gutter' },
  { id: 'codeblock-numbers-wrap', layout: 'rows' },
  { id: 'codeblock-numbers-wrap-highlight', layout: 'rows' },
] as const;

const NUMBERS = Array.from(
  { length: NUMBERED_CODE.split('\n').length },
  (_, i) => i + 1
).join('\n');

interface Box {
  readonly top: number;
  readonly height: number;
  readonly text: string;
}

interface CodeLayout {
  /** Elements labelled with the code, and the buttons inside each. */
  readonly labelled: number;
  readonly labelledButtons: number;
  /** The gutter `Text`s: the non-selectable Texts of the labelled body. */
  readonly gutter: readonly (Box & { readonly userSelect: string })[];
  /** The code `Text`s (selectable) and, per code Text, its row container. */
  readonly code: readonly (Box & {
    readonly row: { readonly top: number; readonly height: number };
    readonly gutterHolder: number;
  })[];
  /** Whether an element of the body overflows sideways (a scroller). */
  readonly overflows: boolean;
  /** The code text's line height, px. */
  readonly lineHeight: number;
}

/** Reads the code block body of a fixture (labelled with `code`). */
function readLayout(root: Element, source: string): CodeLayout | null {
  const labelled = Array.from(root.querySelectorAll('[aria-label]')).filter(
    (el) => el.getAttribute('aria-label') === source
  );
  const body = labelled[0];
  if (body === undefined) return null;
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height, text: el.textContent ?? '' };
  };
  const texts = Array.from(body.querySelectorAll('div[dir]'));
  const gutter = texts
    .filter((el) => getComputedStyle(el).userSelect === 'none')
    .map((el) => ({ ...box(el), userSelect: getComputedStyle(el).userSelect }));
  const codeTexts = texts.filter(
    (el) => getComputedStyle(el).userSelect === 'text'
  );
  const code = codeTexts.map((el) => {
    const row = el.parentElement!.getBoundingClientRect();
    // In a row, the first child holds the gutter Text.
    const holder = el.parentElement!.firstElementChild!;
    return {
      ...box(el),
      row: { top: row.top, height: row.height },
      gutterHolder: holder.getBoundingClientRect().height,
    };
  });
  const overflows = Array.from(body.querySelectorAll('div')).some(
    (el) => el.scrollWidth > el.clientWidth + 1
  );
  return {
    labelled: labelled.length,
    labelledButtons: body.querySelectorAll('button, [role="button"]').length,
    gutter,
    code,
    overflows,
    lineHeight: parseFloat(getComputedStyle(codeTexts[0]!).lineHeight),
  };
}

const layoutOf = async (page: Page, id: string, code = NUMBERED_CODE) => {
  const layout = await page.getByTestId(id).evaluate(readLayout, code);
  expect(layout).not.toBeNull();
  return layout!;
};

/**
 * Selects the block's code with a real mouse drag: from the start of the
 * first code line to just past the end of the last one. Returns the
 * selection's text.
 */
async function dragSelect(
  page: Page,
  id: string,
  source = NUMBERED_CODE
): Promise<string> {
  const points = await page.getByTestId(id).evaluate((root, code) => {
    const body = Array.from(root.querySelectorAll('[aria-label]')).find(
      (el) => el.getAttribute('aria-label') === code
    )!;
    const texts = Array.from(body.querySelectorAll('div[dir]')).filter(
      (el) => getComputedStyle(el).userSelect === 'text'
    );
    const first = texts[0]!;
    const last = texts[texts.length - 1]!;
    first.scrollIntoView({ block: 'start' });
    window.getSelection()!.removeAllRanges();
    const start = first.getBoundingClientRect();
    // The last non-empty text node: its last line box ends the code.
    const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
    let node: Node | null = null;
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      if (n.textContent !== '') node = n;
    }
    const range = document.createRange();
    range.selectNodeContents(node!);
    const rects = range.getClientRects();
    const end = rects[rects.length - 1]!;
    return {
      from: { x: start.left + 1, y: start.top + 4 },
      to: { x: end.right + 4, y: end.top + end.height / 2 },
    };
  }, source);
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 10 });
  await page.mouse.up();
  return page.evaluate(() => window.getSelection()!.toString());
}

/** The lines of `text` that are empty, 1-based. */
const blankLines = (text: string) =>
  text
    .split('\n')
    .map((line, i) => (line === '' ? i + 1 : 0))
    .filter((n) => n > 0);

test.describe('line numbers and wrap', () => {
  // Room for a whole 30-line block, so a drag stays on screen.
  test.use({ viewport: { width: 1280, height: 1000 } });

  test('uses a 30-line fixture with 3 blank lines and one long line', () => {
    const lines = NUMBERED_CODE.split('\n');
    expect(lines).toHaveLength(30);
    expect(blankLines(NUMBERED_CODE)).toEqual([10, 20, 21]);
    expect(lines[NUMBERED_LONG_LINE - 1]!.length).toBeGreaterThan(400);
  });

  for (const { id, layout } of NUMBERED_FIXTURES) {
    test(`shows a non-selectable gutter numbered 1 to 30 on ${id}`, async ({
      page,
    }) => {
      const { gutter, code } = await layoutOf(page, id);
      expect(gutter.length).toBeGreaterThan(0);
      for (const g of gutter) expect(g.userSelect).toBe('none');
      expect(gutter.map((g) => g.text).join('\n')).toBe(NUMBERS);
      // The code Texts concatenate back to the code (web keeps each `\n`).
      expect(code.map((c) => c.text).join('')).toBe(NUMBERED_CODE);
      if (layout === 'rows') expect(code).toHaveLength(30);
    });

    test(`selects exactly the code, no numbers, on ${id}`, async ({ page }) => {
      const selected = await dragSelect(page, id);
      expect(blankLines(selected)).toEqual([10, 20, 21]);
      expect(selected.split('\n')).toHaveLength(30);
      expect(selected).toBe(NUMBERED_CODE);
    });

    test(`labels the body with exactly the code on ${id}`, async ({ page }) => {
      const { labelled, labelledButtons } = await layoutOf(page, id);
      expect(labelled).toBe(1);
      expect(labelledButtons).toBe(0);
    });

    test(`copies exactly the code, no numbers, from ${id}`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page
        .getByTestId(id)
        .getByRole('button', { name: 'Copy code' })
        .click();
      await expect(page.getByTestId(`${id}-status`)).toHaveText(
        `copied ${NUMBERED_CODE.length} chars`
      );
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(NUMBERED_CODE);
    });

    test(`aligns the gutter with the code on ${id}`, async ({ page }) => {
      const { gutter, code } = await layoutOf(page, id);
      if (layout === 'rows') {
        // One number per row, at the top of its code.
        expect(gutter).toHaveLength(code.length);
        code.forEach((c, i) => {
          expect(Math.abs(gutter[i]!.top - c.top)).toBeLessThanOrEqual(0.5);
        });
      } else {
        // One gutter Text per code Text (the whole block, or each chunk).
        expect(gutter).toHaveLength(code.length);
        code.forEach((c, i) => {
          expect(Math.abs(gutter[i]!.top - c.top)).toBeLessThanOrEqual(1);
          expect(Math.abs(gutter[i]!.height - c.height)).toBeLessThanOrEqual(1);
        });
        const total = (boxes: readonly Box[]) =>
          boxes.reduce((sum, b) => sum + b.height, 0);
        expect(Math.abs(total(gutter) - total(code))).toBeLessThanOrEqual(1);
      }
    });

    // react-native-web 0.21 ignores `importantForAccessibility` and
    // `accessibilityElementsHidden`, and the body's `aria-label` sits on a
    // div without a role, so the gutter column carries `aria-hidden`.
    test(`hides the gutter numbers from accessibility on ${id}`, async ({
      page,
    }) => {
      const snapshot = await page.getByTestId(id).ariaSnapshot();
      expect(snapshot).toContain('export const v1');
      expect(snapshot).not.toMatch(/(?:^|[\s:])1 (?:2 3|export const v1)/);
    });
  }

  // A small highlighted block with numbers and no wrap: one code Text
  // beside one gutter Text (P3-35), so a drag selects the whole block.
  const SMALL = 'codeblock-numbers-highlight-small';

  test('uses a small 6-line fixture with one blank line', () => {
    expect(NUMBERED_SMALL_CODE.split('\n')).toHaveLength(6);
    expect(blankLines(NUMBERED_SMALL_CODE)).toEqual([3]);
    expect(NUMBERED_SMALL_CODE.length).toBeLessThan(800);
    expect(NUMBERED_SMALL_CODE).not.toMatch(/\d/);
  });

  test('draws a small numbered block as one code Text and one gutter Text', async ({
    page,
  }) => {
    const { gutter, code, labelled } = await layoutOf(
      page,
      SMALL,
      NUMBERED_SMALL_CODE
    );
    expect(labelled).toBe(1);
    expect(gutter.map((g) => g.text)).toEqual(['1\n2\n3\n4\n5\n6']);
    expect(gutter[0]!.userSelect).toBe('none');
    expect(code.map((c) => c.text)).toEqual([NUMBERED_SMALL_CODE]);
    expect(Math.abs(gutter[0]!.top - code[0]!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(gutter[0]!.height - code[0]!.height)).toBeLessThanOrEqual(
      1
    );
  });

  test('selects a small numbered block as the code exactly', async ({
    page,
  }) => {
    const selected = await dragSelect(page, SMALL, NUMBERED_SMALL_CODE);
    expect(blankLines(selected)).toEqual([3]);
    expect(selected).not.toMatch(/\d/);
    expect(selected).toBe(NUMBERED_SMALL_CODE);
  });

  test('wraps the long line onto rows that keep one number', async ({
    page,
  }) => {
    for (const { id } of NUMBERED_FIXTURES.filter((f) => f.layout === 'rows')) {
      const { gutter, code, overflows, lineHeight } = await layoutOf(page, id);
      expect(overflows).toBe(false);
      const long = code[NUMBERED_LONG_LINE - 1]!;
      const normal = code[0]!;
      const number = gutter[NUMBERED_LONG_LINE - 1]!;
      expect(number.text).toBe(String(NUMBERED_LONG_LINE));
      // The line wraps: its code is several lines tall.
      expect(long.height).toBeGreaterThan(1.5 * lineHeight);
      // Its number stays one line, on the first visual line.
      expect(Math.abs(number.top - long.top)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(number.height - normal.height)).toBeLessThanOrEqual(0.5);
      // The gutter column stretches to the row; the code fills the row.
      expect(Math.abs(long.gutterHolder - long.row.height)).toBeLessThanOrEqual(
        1
      );
      expect(Math.abs(long.height - long.row.height)).toBeLessThanOrEqual(1);
    }
  });

  test('wraps without numbers in one text and no scroller', async ({
    page,
  }) => {
    const { gutter, code, overflows, lineHeight, labelled } = await layoutOf(
      page,
      'codeblock-wrap'
    );
    expect(labelled).toBe(1);
    expect(gutter).toEqual([]);
    expect(code.map((c) => c.text)).toEqual([NUMBERED_CODE]);
    expect(overflows).toBe(false);
    // 30 lines, the long one on several.
    expect(code[0]!.height).toBeGreaterThan(31.5 * lineHeight);
  });

  test('selects exactly the code from a wrapped block', async ({ page }) => {
    expect(await dragSelect(page, 'codeblock-wrap')).toBe(NUMBERED_CODE);
  });

  test('copies exactly the code from a wrapped block', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page
      .getByTestId('codeblock-wrap')
      .getByRole('button', { name: 'Copy code' })
      .click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(NUMBERED_CODE);
  });

  // Each fixture starts in one wrap state; the header's Wrap flips it.
  const TOGGLES = [
    { id: 'codeblock-numbers', wrapped: false, numbered: true },
    { id: 'codeblock-numbers-highlight', wrapped: false, numbered: true },
    { id: 'codeblock-numbers-wrap', wrapped: true, numbered: true },
    { id: 'codeblock-numbers-wrap-highlight', wrapped: true, numbered: true },
    { id: 'codeblock-wrap', wrapped: true, numbered: false },
  ];
  for (const { id, wrapped, numbered } of TOGGLES) {
    test(`toggles wrap from the header on ${id}`, async ({ page }) => {
      const overflows = async () => (await layoutOf(page, id)).overflows;
      const wrapButton = page
        .getByTestId(id)
        .getByRole('button', { name: 'Wrap lines' });
      expect(await overflows()).toBe(!wrapped);
      await wrapButton.click();
      await expect.poll(overflows).toBe(wrapped);
      // The code and numbers are unchanged by the new layout.
      const after = await layoutOf(page, id);
      expect(after.code.map((c) => c.text).join('')).toBe(NUMBERED_CODE);
      expect(after.gutter.map((g) => g.text).join('\n')).toBe(
        numbered ? NUMBERS : ''
      );
      await wrapButton.click();
      await expect.poll(overflows).toBe(!wrapped);
    });
  }

  // react-native-web 0.21 does not read `accessibilityState`, and ARIA has
  // no `aria-selected` on `role="button"`: the toggle takes `aria-pressed`.
  test('exposes the Wrap state on the button', async ({ page }) => {
    const wrapButton = page
      .getByTestId('codeblock-numbers')
      .getByRole('button', { name: 'Wrap lines' });
    const state = () =>
      wrapButton.evaluate((el) => el.getAttribute('aria-pressed'));
    expect(await state()).toBe('false');
    await wrapButton.click();
    await expect.poll(state).toBe('true');
  });

  test('shows no gutter when line numbers are off', async ({ page }) => {
    for (const id of [
      'code',
      'highlight',
      'plain-large',
      'highlight-large',
      'codeblock-header',
      'codeblock-header-highlight',
      'codeblock-header-long',
      'codeblock-wrap',
    ]) {
      const gutters = await page
        .getByTestId(id)
        .evaluate(
          (root) =>
            Array.from(root.querySelectorAll('div[dir]')).filter((el) =>
              /^\d+(\n\d+)*$/.test(el.textContent ?? '')
            ).length
        );
      expect(gutters).toBe(0);
    }
  });
});

test('loads without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await expect(page.getByTestId('heading')).toBeVisible();
  expect(errors).toEqual([]);
});
