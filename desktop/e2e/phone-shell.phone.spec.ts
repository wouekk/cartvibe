import { expect, Page, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import { uniqueName } from './helpers/provisioning';

// The app as it is used in the shop: on a phone, by touch. The file runs in the two phone projects of
// playwright.config.ts (Chromium as a Pixel 7, WebKit as an iPhone, the closest thing to Safari CI has), and in no
// desktop project. It moves only by taps from the landing page, the way a person does, so it proves the tab bar
// leads everywhere it should.
//
// The admin's own household is used: it exists on a fresh database and the admin may do everything in it.
test.use({ storageState: 'e2e/.auth/admin.json' });

const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test('the tab bar leads to a list that takes an item and a cross-off, to receipts as cards, and to the scan', async ({ page }) => {
  await stubTokenRefresh(page);
  await page.goto('/');

  // The phone shell: the tab bar instead of the sidebar button, and nothing wider than the screen.
  await expect(page.getByTestId('tab-bar')).toBeVisible();
  await expect(page.getByTestId('sidebar-toggle')).toHaveCount(0);
  await noSidewaysScroll(page);

  // Lists: a new list, an item added and crossed off.
  await page.getByTestId('tab-nav-shopping-lists').tap();
  await expect(page.getByRole('heading', { name: 'Shopping Lists' })).toBeVisible();
  await expect(page.getByTestId('tab-nav-shopping-lists')).toHaveAttribute('aria-current', 'page');

  const list = uniqueName('phone-list');
  await page.getByTestId('shopping-list-add').tap();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add List' });
  await dialog.getByLabel('Name').fill(list);
  await dialog.getByTestId('dialog-submit-button').tap();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('region', { name: new RegExp(list) })).toBeVisible();

  await page.getByLabel('Add an item').fill('Milk');
  await page.getByLabel('Add an item').press('Enter');
  const milk = page.getByTestId('shopping-list-active-items').getByRole('checkbox', { name: /Milk/ });
  await expect(milk).toBeVisible();
  await milk.tap();
  await expect(milk).toHaveCount(0);
  await expect(page.getByTestId('shopping-list-crossed-off-toggle')).toHaveText(/Crossed off \(1\)/);
  await noSidewaysScroll(page);

  // Receipts: the period strip, and cards or the empty state, never a table that scrolls sideways.
  await page.getByTestId('tab-nav-receipts').tap();
  await expect(page.getByTestId('receipts-period-row')).toBeVisible();
  await expect(page.getByTestId('tab-nav-receipts')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('app-table table')).toHaveCount(0);
  await noSidewaysScroll(page);

  // Scan: a dialog opens from any page (Quick Scan, or the question for an AI key when none is set).
  await page.getByTestId('tab-scan').tap();
  await expect(page.getByRole('dialog')).toBeVisible();
});
