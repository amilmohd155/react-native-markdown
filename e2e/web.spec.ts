import { expect, test } from '@playwright/test';
import { WEB_FIXTURES } from '../test/web/fixtures';

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

test('loads without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await expect(page.getByTestId('heading')).toBeVisible();
  expect(errors).toEqual([]);
});
