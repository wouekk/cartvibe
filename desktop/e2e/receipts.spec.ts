import { expect, test, type Page } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';

function uniqueName(tag: string) {
  return `e2e-${tag}-${Date.now()}`;
}

async function getGroupId(page: Page): Promise<string> {
  // storageState loaded by the project means we're already authed; going to
  // `/` should redirect to /overview/group/<id>.
  await page.goto('/');
  await page.waitForURL(/\/overview\/group\/\d+/);
  const match = page.url().match(/\/overview\/group\/(\d+)/);
  return match![1];
}

async function openAddReceipt(page: Page) {
  await page.goto('/receipts/add');
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  // The form hides the Group when the user belongs to exactly one. Other specs add e2e-user to groups while this
  // one runs, so when the picker is there, take the shared Household.
  const group = page.getByRole('combobox', { name: 'Group', exact: true });
  if (await group.isVisible()) {
    await group.click();
    await group.fill('Household');
    await page.getByRole('option', { name: 'Household', exact: true }).click();
  }
}

// The family rework removed the Paid By, Group (for a single-household user), shares and items from this form: the
// payer is the signed-in user, and the Name is pre-filled ("Receipt <date>").
async function fillBasics(page: Page, name: string, amount = '42.00') {
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Amount').fill(amount);
  await page.getByLabel('Amount').press('Tab');
}

async function saveReceipt(page: Page) {
  const save = page.getByRole('button', { name: 'Save', exact: true }).first();
  await save.waitFor({ state: 'visible' });
  await save.click();
  await expect(page).toHaveURL(/\/receipts\/\d+\/view/);
}

async function deleteReceiptByName(page: Page, groupId: string, name: string) {
  await page.goto(`/receipts/group/${groupId}`);
  // `.first()` defends against orphan rows that would otherwise trip strict mode.
  const row = page.getByRole('row').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByTestId('receipt-delete').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
}

test.describe('receipts', () => {
  let groupId: string;
  // Tests that persist a receipt set this to the receipt's unique name after
  // saveReceipt(), and clear it after the explicit deleteReceiptByName(). If a
  // test fails between save and delete, the afterEach below reaps the orphan.
  let currentReceiptName: string | null = null;

  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
    groupId = await getGroupId(page);
  });

  test.afterEach(async ({ page }) => {
    if (!currentReceiptName) return;
    const leftover = currentReceiptName;
    currentReceiptName = null;
    try {
      await deleteReceiptByName(page, groupId, leftover);
    } catch {
      // Best-effort — the test already failed and we don't want to mask it with a cleanup error.
    }
  });

  test('create a basic receipt, see it in the list, and delete it', async ({ page }) => {
    const name = uniqueName('basic');
    await openAddReceipt(page);
    await fillBasics(page, name);
    await saveReceipt(page);
    currentReceiptName = name;

    await page.goto(`/receipts/group/${groupId}`);
    await expect(page.getByRole('row').filter({ hasText: name }).first()).toBeVisible();

    await deleteReceiptByName(page, groupId, name);
    currentReceiptName = null;
  });

  test('create a receipt with a note', async ({ page }) => {
    const name = uniqueName('receipt');
    const noteText = `note-${Date.now()}`;

    await openAddReceipt(page);
    await fillBasics(page, name);

    // The note is one field of the receipt: it is saved with it, in the same request.
    await page.getByTestId('receipt-note').getByRole('textbox').fill(noteText);

    await saveReceipt(page);
    currentReceiptName = name;

    // The saved receipt opens with its note.
    await expect(page.getByTestId('receipt-note').getByRole('textbox')).toHaveValue(noteText);

    await deleteReceiptByName(page, groupId, name);
    currentReceiptName = null;
  });

  test.describe('validation', () => {
    async function clickSave(page: Page) {
      await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    }

    test('an empty Name and Amount block submit and show their errors', async ({ page }) => {
      await openAddReceipt(page);
      await page.getByLabel('Name', { exact: true }).clear();
      await clickSave(page);

      await expect(page).toHaveURL(/\/receipts\/add$/);
      await expect(page.getByText('Name is required.', { exact: true })).toBeVisible();
      await expect(page.getByText('Amount is required.', { exact: true })).toBeVisible();
    });

    test('missing Amount blocks submit and shows only the Amount error', async ({ page }) => {
      await openAddReceipt(page);
      await page.getByLabel('Name', { exact: true }).fill(uniqueName('val'));
      await clickSave(page);

      await expect(page).toHaveURL(/\/receipts\/add$/);
      await expect(page.getByText('Amount is required.', { exact: true })).toBeVisible();
      await expect(page.getByText('Name is required.', { exact: true })).toBeHidden();
    });

    test('filling a required field clears its error in place', async ({ page }) => {
      await openAddReceipt(page);
      await page.getByLabel('Name', { exact: true }).clear();
      await clickSave(page);
      await expect(page.getByText('Name is required.', { exact: true })).toBeVisible();

      await page.getByLabel('Name', { exact: true }).fill('Not Empty');
      await expect(page.getByText('Name is required.', { exact: true })).toBeHidden();
      // Other errors remain until their fields are filled.
      await expect(page.getByText('Amount is required.', { exact: true })).toBeVisible();
    });
  });
});
