import { comboboxNamed, setAppCheckbox } from './helpers/ui';
import { expect, type Page, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import {
  apiCreateGroup,
  apiDeleteGroupById,
  uniqueName,
  withAdminApi,
} from './helpers/provisioning';

// Drives the group receipt settings "Quick Scan" config UI as an admin (group owner → group.update).
// Asserts the section renders, the conditional default controls appear/disappear per the Show/Require
// toggles, and that the form's validation gates Save when an optional field has no configured default.
// The settings page is always editable: Save stays on /edit and answers with a toast, so a save is
// proven by the PUT /groupReceiptSettings response, not by a navigation.

test.use({ storageState: 'e2e/.auth/admin.json' });

test.describe('Quick scan group receipt settings', () => {
  test.describe.configure({ mode: 'serial' });

  let groupId: string;

  test.beforeAll(async () => {
    await withAdminApi(async (api) => {
      const group = await apiCreateGroup(api, uniqueName('qs-cfg'));
      groupId = String(group.id);
    });
  });

  test.afterAll(async () => {
    await withAdminApi(async (api) => {
      await apiDeleteGroupById(api, groupId);
    });
  });

  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
    await page.goto(`/groups/${groupId}/receipt-settings/edit`);
    // The Quick Scan section has loaded once its (uniquely identified) controls are present.
    await expect(page.getByTestId('quick-scan-paidby-show').getByRole('checkbox')).toBeVisible();
  });

  /** Clicks Save and returns the status of the settings PUT it sends. */
  async function saveAndGetStatus(page: Page): Promise<number> {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'PUT' && r.url().includes(`/api/group/${groupId}/groupReceiptSettings`),
      ),
      page.getByRole('button', { name: 'Save' }).click(),
    ]);
    return response.status();
  }

  test('reveals the paid-by/status defaults only when the field is optional', async ({ page }) => {
    const defaultPaidBy = comboboxNamed(page, 'Default Paid By');
    const defaultPaidByUser = comboboxNamed(page, 'Default Paid By User');

    // Shown + required → no default needed → default controls hidden.
    await setAppCheckbox(page.getByTestId('quick-scan-paidby-show'), true);
    await setAppCheckbox(page.getByTestId('quick-scan-paidby-require'), true);
    await expect(defaultPaidBy).toHaveCount(0);

    // Optional → the default paid-by selector appears.
    await setAppCheckbox(page.getByTestId('quick-scan-paidby-require'), false);
    await expect(defaultPaidBy).toBeVisible();

    // "Specific user" reveals the member autocomplete; "Uploader" hides it again.
    await defaultPaidBy.click();
    await page.getByRole('option', { name: 'Specific user', exact: true }).click();
    await expect(defaultPaidByUser).toBeVisible();

    await defaultPaidBy.click();
    await page.getByRole('option', { name: 'Uploader', exact: true }).click();
    await expect(defaultPaidByUser).toHaveCount(0);

    // Status behaves the same way.
    const defaultStatus = comboboxNamed(page, 'Default Status');
    await setAppCheckbox(page.getByTestId('quick-scan-status-show'), true);
    await setAppCheckbox(page.getByTestId('quick-scan-status-require'), true);
    await expect(defaultStatus).toHaveCount(0);
    await setAppCheckbox(page.getByTestId('quick-scan-status-require'), false);
    await expect(defaultStatus).toBeVisible();
  });

  test('blocks save until an optional paid-by has a default', async ({ page }) => {
    await setAppCheckbox(page.getByTestId('quick-scan-paidby-show'), true);
    await setAppCheckbox(page.getByTestId('quick-scan-paidby-require'), false);

    // "Specific user" with no user chosen → form invalid → Save sends nothing.
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/groupReceiptSettings')) {
        requests.push(r.url());
      }
    });
    await comboboxNamed(page, 'Default Paid By').click();
    await page.getByRole('option', { name: 'Specific user', exact: true }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(comboboxNamed(page, 'Default Paid By User')).toBeVisible();
    expect(requests).toHaveLength(0);

    // Switch to "Uploader" (a complete default) → Save is accepted by the server.
    await comboboxNamed(page, 'Default Paid By').click();
    await page.getByRole('option', { name: 'Uploader', exact: true }).click();
    expect(await saveAndGetStatus(page)).toBe(200);
    expect(requests).toHaveLength(1);
  });

  test('greys out the comment toggles while comments are hidden, keeping their values', async ({ page }) => {
    const commentShow = page.getByTestId('quick-scan-comment-show').getByRole('checkbox');
    const commentRequire = page.getByTestId('quick-scan-comment-require').getByRole('checkbox');
    const hideComments = page.getByText('Hide Comments', { exact: true });

    await setAppCheckbox(page.getByTestId('quick-scan-comment-show'), true);
    await setAppCheckbox(page.getByTestId('quick-scan-comment-require'), true);
    await expect(commentShow).toBeEnabled();

    // Hiding comments group-wide hides the quick-scan comment too — the toggles grey out but keep
    // their values (derived state, nothing is cleared).
    await hideComments.click();
    await expect(commentShow).toBeDisabled();
    await expect(commentRequire).toBeDisabled();
    await expect(commentShow).toBeChecked();
    await expect(commentRequire).toBeChecked();

    // Un-hiding restores them exactly as configured.
    await hideComments.click();
    await expect(commentShow).toBeEnabled();
    await expect(commentShow).toBeChecked();
    await expect(commentRequire).toBeChecked();
  });

  test('persists the comment configuration', async ({ page }) => {
    await setAppCheckbox(page.getByTestId('quick-scan-comment-show'), true);
    await setAppCheckbox(page.getByTestId('quick-scan-comment-require'), true);
    expect(await saveAndGetStatus(page)).toBe(200);

    // Reload the edit page: the toggles must come back checked. A field missing from the API's
    // update assignment block persists nothing and fails only here.
    await page.goto(`/groups/${groupId}/receipt-settings/edit`);
    await expect(page.getByTestId('quick-scan-comment-show').getByRole('checkbox')).toBeChecked();
    await expect(page.getByTestId('quick-scan-comment-require').getByRole('checkbox')).toBeChecked();
  });
});
