import { expect, Page, test } from '@playwright/test';
import { creds, stubTokenRefresh } from './helpers/auth';
import {
  midMonthIso,
  apiCreateGroup,
  apiCreateReceipt,
  apiDeleteGroupById,
  apiGetUserId,
  uniqueName,
  withAdminApi,
} from './helpers/provisioning';
import { openReceiptsOverflowMenu } from './helpers/receipts-table';

test.use({ storageState: 'e2e/.auth/admin.json' });

// Serial: the tests share one seeded group. The column configuration does NOT
// carry between them - it lives in localStorage and every test gets a fresh
// context - so each test switches the column on itself.
test.describe.configure({ mode: 'serial' });

/**
 * The receipts table's Note column: each receipt's note, sortable.
 *
 * The unit specs build columns against a mocked store, so they prove nothing
 * about the wire. What only an e2e can show: a receipt created with a note
 * carrying it in the paged list, and the `note` sort key round-tripping to the
 * API instead of being rejected.
 *
 * It seeds its own group so the rows are exactly these, in a known order.
 */
test.describe('Receipts table — Note column', () => {
  const groupName = uniqueName('note-col-grp');
  let groupId: number;

  // Created out of alphabetical order, so a list that came back in creation
  // order would be visibly unsorted.
  const receipts = [
    { name: 'note-col-bravo', note: 'bravo note' },
    { name: 'note-col-zulu', note: 'zulu note' },
    { name: 'note-col-alpha', note: 'alpha note' },
  ];

  test.beforeAll(async () => {
    await withAdminApi(async (api) => {
      const adminId = await apiGetUserId(api, creds('admin').username);
      groupId = (await apiCreateGroup(api, groupName)).id;

      for (const receipt of receipts) {
        await apiCreateReceipt(api, {
          groupId,
          paidByUserId: adminId,
          name: receipt.name,
          note: receipt.note,
          // The table opens on "this month": dated mid-month so the rows are in it whatever today is.
          date: midMonthIso(),
        });
      }
    });
  });

  test.afterAll(async () => {
    try {
      await withAdminApi(async (api) => {
        if (groupId) {
          await apiDeleteGroupById(api, String(groupId));
        }
      });
    } catch {
      // Best-effort cleanup: never mask a real failure with a teardown error.
    }
  });

  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
  });

  async function gotoTable(page: Page): Promise<void> {
    await page.goto(`/receipts/group/${groupId}`);
    await expect(page.getByTestId('receipts-overflow-menu')).toBeVisible();
  }

  async function openConfigureColumns(page: Page) {
    await openReceiptsOverflowMenu(page);
    await page.getByTestId('configure-columns').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async function showNoteColumn(page: Page): Promise<void> {
    const dialog = await openConfigureColumns(page);
    // The checkbox button sits inside its label: click the label text (check() can toggle twice).
    await dialog.getByText('Note', { exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: 'Note', exact: true })).toBeChecked();
    await dialog.getByTestId('dialog-submit-button').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('columnheader', { name: 'Note' })).toBeVisible();
  }

  /** The rendered row order, which is what every sort assertion compares. */
  async function receiptNames(page: Page): Promise<string[]> {
    const names = await page.locator('td a[href^="/receipts/"]').allTextContents();
    // The date cell is a link too; keep this spec's receipts by name.
    return names.map((name) => name.trim()).filter((name) => name.startsWith('note-col-'));
  }

  function rowFor(page: Page, receiptName: string) {
    return page.getByRole('row').filter({ hasText: receiptName });
  }

  test('is offered in Configure Columns, unchecked by default', async ({ page }) => {
    await gotoTable(page);

    const dialog = await openConfigureColumns(page);
    const checkbox = dialog.getByRole('checkbox', { name: 'Note', exact: true });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    await expect(page.getByRole('columnheader', { name: 'Note' })).toHaveCount(0);
  });

  test("shows each receipt's note", async ({ page }) => {
    await gotoTable(page);
    await showNoteColumn(page);

    await expect(rowFor(page, 'note-col-zulu').getByTestId('receipt-note')).toHaveText('zulu note');
    await expect(rowFor(page, 'note-col-alpha').getByTestId('receipt-note')).toHaveText('alpha note');
  });

  test('sorts by the note in both directions', async ({ page }) => {
    await gotoTable(page);
    await showNoteColumn(page);

    const header = page.getByRole('columnheader', { name: 'Note' });

    // A 500 here would mean the API rejected note as an untrusted orderBy.
    await header.click();
    await expect
      .poll(() => receiptNames(page))
      .toEqual(['note-col-alpha', 'note-col-bravo', 'note-col-zulu']);

    await header.click();
    await expect
      .poll(() => receiptNames(page))
      .toEqual(['note-col-zulu', 'note-col-bravo', 'note-col-alpha']);
  });
});
