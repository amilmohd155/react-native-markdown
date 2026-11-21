import { expect, test } from '@playwright/test';
import {
  HIGHLIGHT_CODE,
  HIGHLIGHT_LARGE_CODE,
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

test('loads without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await expect(page.getByTestId('heading')).toBeVisible();
  expect(errors).toEqual([]);
});
