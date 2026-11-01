import { expect, test, type Page } from '@playwright/test';
import { creds, stubTokenRefresh } from './helpers/auth';
import {
  apiCreateGroup,
  apiCreateReceipt,
  apiDeleteGroupById,
  apiGetUserId,
  uniqueName,
  withAdminApi,
} from './helpers/provisioning';

// The receipts table's period control (the same picker as the Dashboard) and its filter chips, end to end.
//
// The unit specs cover the period resolution and the chip labels against a mocked store, so what only an e2e can
// prove is the wire: a period written by the picker is a BETWEEN the SERVER understands, so the table actually
// narrows; and the picker and the filter dialog share one filter, so a condition added in the dialog is clearable
// from its chip without disturbing the date range.
//
// (This replaced the month stepper's spec: the stepper, its field picker and its panel are gone from the table.)
//
// Runs as admin and seeds its own group so the buckets contain exactly this spec's receipts.

test.use({ storageState: 'e2e/.auth/admin.json' });

test.describe('Receipts period filter', () => {
  test.describe.configure({ mode: 'serial' });

  const thisMonthReceipt = uniqueName('pf-this');
  const lastMonthReceipt = uniqueName('pf-last');
  const olderReceipt = uniqueName('pf-older');

  let group: { id: number; name: string };

  /** One instant for the whole suite, so a run crossing a month boundary cannot leave the app a month ahead of its fixture. */
  const REFERENCE_TIME = new Date();

  /** An ISO date in the middle of the UTC month [delta] months from the reference. */
  function isoInMonth(delta: number): string {
    return new Date(
      Date.UTC(REFERENCE_TIME.getUTCFullYear(), REFERENCE_TIME.getUTCMonth() + delta, 15),
    ).toISOString();
  }

  /** The picker's own text format, DD/MM/YYYY, for the [day] of the UTC month [delta] months from the reference. */
  function typed(delta: number, day: number): string {
    const date = new Date(Date.UTC(REFERENCE_TIME.getUTCFullYear(), REFERENCE_TIME.getUTCMonth() + delta, day));
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${date.getUTCFullYear()}`;
  }

  const rowLink = (page: Page, name: string) => page.getByRole('link', { name });

  async function setCustomRange(page: Page, from: string, to: string): Promise<void> {
    await page.getByTestId('overview-custom-from').fill(from);
    await page.getByTestId('overview-custom-to').fill(to);
  }

  test.beforeAll(async () => {
    await withAdminApi(async (api) => {
      const adminId = await apiGetUserId(api, creds('admin').username);
      group = await apiCreateGroup(api, uniqueName('pf-group'));

      for (const [name, delta] of [
        [thisMonthReceipt, 0],
        [lastMonthReceipt, -1],
        [olderReceipt, -2],
      ] as const) {
        await apiCreateReceipt(api, {
          groupId: group.id,
          paidByUserId: adminId,
          name,
          date: isoInMonth(delta),
        });
      }
    });
  });

  test.afterAll(async () => {
    await withAdminApi(async (api) => {
      try {
        await apiDeleteGroupById(api, String(group.id));
      } catch {
        // Best effort — a cleanup failure must not mask a real result.
      }
    });
  });

  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
  });

  async function gotoSeededGroup(page: Page): Promise<void> {
    await page.goto(`/receipts/group/${group.id}`);
    await expect(page.getByTestId('receipts-overflow-menu')).toBeVisible();
  }

  test('opens on this month and chips the date condition', async ({ page }) => {
    await gotoSeededGroup(page);

    await expect(rowLink(page, thisMonthReceipt)).toBeVisible();
    await expect(rowLink(page, lastMonthReceipt)).toHaveCount(0);
    await expect(rowLink(page, olderReceipt)).toHaveCount(0);

    await expect(page.getByTestId('receipt-filter-chip-date')).toContainText('Receipt Date');
    await expect(page.getByTestId('receipts-filter-reset')).toBeVisible();
  });

  test('a typed custom range narrows the table to the receipts inside it', async ({ page }) => {
    await gotoSeededGroup(page);
    await expect(rowLink(page, thisMonthReceipt)).toBeVisible();

    // Exactly last month: from its 1st to its 28th (every month has one).
    await setCustomRange(page, typed(-1, 1), typed(-1, 28));

    await expect(rowLink(page, lastMonthReceipt)).toBeVisible();
    await expect(rowLink(page, thisMonthReceipt)).toHaveCount(0);
    await expect(rowLink(page, olderReceipt)).toHaveCount(0);
    await expect(page.getByTestId('receipt-filter-chip-date')).toBeVisible();
  });

  test('a range over several months lists every receipt in it', async ({ page }) => {
    await gotoSeededGroup(page);
    await expect(rowLink(page, thisMonthReceipt)).toBeVisible();

    await setCustomRange(page, typed(-2, 1), typed(0, 28));

    await expect(rowLink(page, olderReceipt)).toBeVisible();
    await expect(rowLink(page, lastMonthReceipt)).toBeVisible();
    await expect(rowLink(page, thisMonthReceipt)).toBeVisible();
  });

  test('clears one dialog-set condition from its chip without losing the date range', async ({ page }) => {
    await gotoSeededGroup(page);
    await expect(rowLink(page, thisMonthReceipt)).toBeVisible();

    // Add a second condition through the real filter dialog.
    await page.getByTestId('receipts-filter').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Name').fill(thisMonthReceipt);
    await dialog.getByTestId('dialog-submit-button').click();
    await expect(dialog).toBeHidden();

    const nameChip = page.getByTestId('receipt-filter-chip-name');
    await expect(nameChip).toContainText(`Name contains ${thisMonthReceipt}`);
    // Both conditions are chipped; clearing one must not touch the other.
    await expect(page.getByTestId('receipt-filter-chip-date')).toBeVisible();

    await page.getByTestId('receipt-filter-chip-clear-name').click();

    await expect(nameChip).toHaveCount(0);
    await expect(page.getByTestId('receipt-filter-chip-date')).toBeVisible();
    await expect(rowLink(page, thisMonthReceipt)).toBeVisible();
    await expect(rowLink(page, lastMonthReceipt)).toHaveCount(0);
  });

  test('clearing the date chip lists every receipt again', async ({ page }) => {
    await gotoSeededGroup(page);
    await expect(rowLink(page, thisMonthReceipt)).toBeVisible();
    await expect(rowLink(page, olderReceipt)).toHaveCount(0);

    await page.getByTestId('receipt-filter-chip-clear-date').click();

    await expect(page.getByTestId('receipt-filter-chip-date')).toHaveCount(0);
    await expect(rowLink(page, olderReceipt)).toBeVisible();
    await expect(rowLink(page, lastMonthReceipt)).toBeVisible();
    await expect(rowLink(page, thisMonthReceipt)).toBeVisible();
  });
});
