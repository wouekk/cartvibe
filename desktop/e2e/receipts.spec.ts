import { expect, test, type Page } from '@playwright/test';
import { loginViaUi } from './helpers/auth';

function uniqueName(tag: string) {
  return `e2e-${tag}-${Date.now()}`;
}

async function getGroupId(page: Page): Promise<string> {
  await page.waitForURL(/\/dashboard\/group\/\d+/);
  const match = page.url().match(/\/dashboard\/group\/(\d+)/);
  return match![1];
}

async function openAddReceipt(page: Page) {
  await page.goto('/receipts/add');
  await expect(page.getByLabel('Name')).toBeVisible();
}

async function selectFirstOption(page: Page, label: string) {
  await page.getByLabel(label).click();
  await page.getByRole('option').first().click();
}

async function fillBasics(page: Page, name: string, amount = '42.00') {
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Amount').fill(amount);
  await selectFirstOption(page, 'Group');
  await selectFirstOption(page, 'Paid By');
}

async function saveReceipt(page: Page) {
  // Top-level form Save button (dialog Saves are scoped separately in tests).
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page).toHaveURL(/\/receipts\/\d+\/view/);
}

async function ensureCustomFieldExists(page: Page) {
  await page.goto('/custom-fields');
  // Header renders an "add" icon button (no accessible name) next to the H1.
  const existingRows = await page.locator('tbody tr').count();
  if (existingRows > 0) {
    return;
  }
  // Click the add button in the table header.
  await page.locator('app-table-header').getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill('e2e-field');
  await dialog.getByLabel('Description').fill('Created by e2e suite');
  // Pick the first type (Text) — required field, no default.
  await dialog.getByLabel('Type').click();
  await page.getByRole('option').first().click();
  await dialog.locator('button:has(mat-icon:has-text("done"))').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('tbody tr')).not.toHaveCount(0);
}

async function deleteReceiptByName(page: Page, groupId: string, name: string) {
  await page.goto(`/receipts/group/${groupId}`);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  // The delete action is the mat-icon "delete" inside the row's action cell.
  await row.locator('button:has(mat-icon:has-text("delete"))').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Confirm button renders as an icon-only "done" button with no accessible name.
  await dialog.locator('button:has(mat-icon:has-text("done"))').click();
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
}

test.describe('receipts', () => {
  let groupId: string;

  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, 'user');
    groupId = await getGroupId(page);
  });

  test('create a basic receipt, see it in the list, and delete it', async ({ page }) => {
    const name = uniqueName('basic');
    await openAddReceipt(page);
    await fillBasics(page, name);
    await saveReceipt(page);

    await page.goto(`/receipts/group/${groupId}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();

    await deleteReceiptByName(page, groupId, name);
  });

  test('create a receipt with a manual share', async ({ page }) => {
    const name = uniqueName('share');
    const shareName = `share-item-${Date.now()}`;

    await openAddReceipt(page);
    await fillBasics(page, name, '30.00');

    // Open the "Add share" inline card (first button in Shares section header).
    const sharesHeader = page.locator('strong:has-text("Shares")');
    await sharesHeader.locator('xpath=../..').getByRole('button').first().click();

    // Add-share card renders inside app-share-list; scope selectors there.
    const shareList = page.locator('app-share-list');
    await shareList.getByLabel('Shared with').click();
    await page.getByRole('option').first().click();
    await shareList.getByLabel('Name').fill(shareName);
    await shareList.getByLabel('Amount').fill('30.00');
    // Footer submit is type=submit, so this also saves the receipt.
    await shareList.locator('button:has(mat-icon:has-text("done"))').click();
    await expect(page).toHaveURL(/\/receipts\/\d+\/view/);

    // Detail view should show the share's total amount owed for the user.
    await expect(page.getByText(/Total amount owed: \$30\.00/)).toBeVisible();

    await page.goto(`/receipts/group/${groupId}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();

    await deleteReceiptByName(page, groupId, name);
  });

  test('create a receipt with a custom field (dynamic)', async ({ page }) => {
    const name = uniqueName('custom');
    await ensureCustomFieldExists(page);
    await openAddReceipt(page);
    await fillBasics(page, name);

    // Attach the first available custom field to this receipt via the
    // "Manage custom fields" menu (list_alt icon near the form title).
    await page.locator('button:has(mat-icon:has-text("list_alt"))').first().click();
    // Menu renders a disabled "No items found" div when filteredItems is empty;
    // skip that and click the first real (non-pe-none) menuitem.
    await page.locator('[role="menuitem"]:not(.pe-none)').first().click();
    await page.keyboard.press('Escape');

    // There is one custom field but we don't know its type. Probe supported
    // control shapes in priority order and fill the first one we find.
    const firstField = page.locator('app-custom-field').first();
    await expect(firstField).toBeVisible();
    const filled = await (async () => {
      const boolean = firstField.locator('input[type="checkbox"]');
      if (await boolean.count()) {
        await boolean.first().check();
        return 'boolean';
      }
      const select = firstField.locator('mat-select');
      if (await select.count()) {
        await select.first().click();
        await page.getByRole('option').first().click();
        return 'select';
      }
      const text = firstField.locator('input[matinput]');
      if (await text.count()) {
        // Currency / text / date inputs all accept a numeric string.
        await text.first().fill('42');
        return 'text';
      }
      return null;
    })();
    expect(filled, 'at least one custom field type should have matched').not.toBeNull();

    await saveReceipt(page);

    await page.goto(`/receipts/group/${groupId}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();

    await deleteReceiptByName(page, groupId, name);
  });

  test('create a receipt with a comment', async ({ page }) => {
    const name = uniqueName('receipt');
    const commentText = `note-${Date.now()}`;

    await openAddReceipt(page);
    await fillBasics(page, name);

    // In add mode the comment is staged locally and persisted on save.
    await page.getByLabel('Comment').fill(commentText);
    await page.getByRole('button', { name: 'Comment', exact: true }).click();

    await saveReceipt(page);

    // The saved comment should render inside the comments section on view.
    const comments = page.locator('app-receipt-comments');
    await expect(comments.getByText(commentText)).toBeVisible();

    await page.goto(`/receipts/group/${groupId}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();

    await deleteReceiptByName(page, groupId, name);
  });

  test('create a receipt using Quick Actions (Split Evenly)', async ({ page }) => {
    const name = uniqueName('quick');
    await openAddReceipt(page);
    await fillBasics(page, name, '100.00');

    // Second button in the Shares header opens the Quick Actions dialog.
    const sharesHeader = page.locator('strong:has-text("Shares")');
    await sharesHeader.locator('xpath=../..').getByRole('button').nth(1).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Default action is "Split Evenly". Pick the first available user.
    await dialog.getByLabel('Users to Split Between').click();
    const firstOption = page.getByRole('option').first();
    const optionCount = await page.getByRole('option').count();
    test.skip(optionCount === 0, 'Quick Actions requires a group with more than one member');

    await firstOption.click();
    // Wait for the selected-user chip to settle before submitting — the
    // autocomplete re-render was causing the submit button to detach/retry.
    await expect(dialog.locator('mat-chip-row, mat-chip').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // Submit the "Split" action via the dialog footer's submit button.
    const submit = dialog.locator('app-dialog-footer app-submit-button button').first();
    await submit.click({ force: true });
    await expect(dialog).toBeHidden();

    await saveReceipt(page);

    await page.goto(`/receipts/group/${groupId}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();

    await deleteReceiptByName(page, groupId, name);
  });

  test.describe('validation', () => {
    async function clickSave(page: Page) {
      await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    }

    test('empty form submit shows all required-field errors and does not navigate', async ({ page }) => {
      await openAddReceipt(page);
      await clickSave(page);

      await expect(page).toHaveURL(/\/receipts\/add$/);
      await expect(page.getByText('Name is required.', { exact: true })).toBeVisible();
      await expect(page.getByText('Amount is required.', { exact: true })).toBeVisible();
      await expect(page.getByText('Group is required.', { exact: true })).toBeVisible();
      await expect(page.getByText('Paid By is required.', { exact: true })).toBeVisible();
    });

    test('missing Name blocks submit and shows the Name error', async ({ page }) => {
      await openAddReceipt(page);
      await page.getByLabel('Amount').fill('10.00');
      await selectFirstOption(page, 'Group');
      await selectFirstOption(page, 'Paid By');
      await clickSave(page);

      await expect(page).toHaveURL(/\/receipts\/add$/);
      await expect(page.getByText('Name is required.', { exact: true })).toBeVisible();
      await expect(page.getByText('Amount is required.', { exact: true })).toBeHidden();
    });

    test('missing Amount blocks submit and shows the Amount error', async ({ page }) => {
      await openAddReceipt(page);
      await page.getByLabel('Name').fill(uniqueName('val'));
      await selectFirstOption(page, 'Group');
      await selectFirstOption(page, 'Paid By');
      await clickSave(page);

      await expect(page).toHaveURL(/\/receipts\/add$/);
      await expect(page.getByText('Amount is required.', { exact: true })).toBeVisible();
      await expect(page.getByText('Name is required.', { exact: true })).toBeHidden();
    });

    test('filling a required field clears its error in place', async ({ page }) => {
      await openAddReceipt(page);
      await clickSave(page);
      await expect(page.getByText('Name is required.', { exact: true })).toBeVisible();

      await page.getByLabel('Name').fill('Not Empty');
      await expect(page.getByText('Name is required.', { exact: true })).toBeHidden();
      // Other errors remain until their fields are filled.
      await expect(page.getByText('Amount is required.', { exact: true })).toBeVisible();
    });
  });

  test('create a receipt with items', async ({ page }) => {
    const name = uniqueName('items');
    const itemName = `apple-${Date.now()}`;

    await openAddReceipt(page);
    await fillBasics(page, name, '50.00');

    // form-section renders "<strong> Items</strong>" inside a column-flex div,
    // and the headerButtonsTemplate (the add button) is a sibling two levels up.
    const itemsHeader = page.locator('strong:has-text("Items")');
    await itemsHeader.locator('xpath=../..').getByRole('button').first().click();

    const itemForm = page.locator('app-item-add-form');
    await itemForm.getByLabel('Name').fill(itemName);
    await itemForm.getByLabel('Amount').fill('10.00');
    await itemForm.getByRole('button', { name: /Add & Done/i }).click();

    // The items section collapses into a summary; verify the count + total.
    await expect(page.getByText(/Items \(1\)/)).toBeVisible();
    await expect(page.getByText(/Total: \$10\.00/)).toBeVisible();

    await saveReceipt(page);

    // Detail view should still show the item count/total summary.
    await expect(page.getByText(/Items \(1\)/)).toBeVisible();
    await expect(page.getByText(/Total: \$10\.00/)).toBeVisible();

    await page.goto(`/receipts/group/${groupId}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();

    await deleteReceiptByName(page, groupId, name);
  });
});
