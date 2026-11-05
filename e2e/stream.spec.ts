import { expect, test } from '@playwright/test';

/**
 * Stream smoke test: opens the example app's Stream tab, runs the default
 * preset (F2 through useMarkdownStream) and checks the final result. The app's
 * own check, `final == parse(full)`, is read from the result card.
 */
test('streams a fixture to the final document', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('tab', { name: 'Stream' }).click();
  // Every tab stays mounted (hidden), so address the Stream tab's own controls.
  const run = page.getByRole('button', { name: 'Run', exact: true });
  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  await expect(run).toBeEnabled();

  await run.click();
  await expect(stop).toBeEnabled();

  // The run ends on its own: Run is available again and the result card shows.
  await expect(run).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByText('final == parse(full): yes')).toBeVisible();
  await expect(page.getByText(/commits \d+ {2}\(\d+ chunks\)/)).toBeVisible();
  expect(errors).toEqual([]);
});
