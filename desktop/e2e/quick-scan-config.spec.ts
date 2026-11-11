import { comboboxNamed, setAppCheckbox } from './helpers/ui';
import { expect, type Page, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import {
  apiCreateGroup,
  apiDeleteGroupById,
  uniqueName,
  withAdminApi,
} from './helpers/provisioning';

// Drives a household's Receipt Settings as an admin (the household's owner). A Quick Scan is a photo and nothing
// else, so the page holds one switch (ask for a note) and two defaults (who paid, the status of a new scan).
// The settings page is always editable: Save stays on /edit and answers with a toast, so a save is proven by the
// PUT /groupReceiptSettings response and by what a reload shows, not by a navigation.

test.use({ storageState: 'e2e/.auth/admin.json' });

test.describe('Household receipt settings', () => {
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

  async function openSettings(page: Page): Promise<void> {
    await page.goto(`/groups/${groupId}/receipt-settings/edit`);
    // The page has loaded once its (uniquely identified) controls are present.
    await expect(page.getByTestId('quick-scan-note-show').getByRole('checkbox')).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
    await openSettings(page);
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

  test('a new household asks for nothing in Quick Scan, and has no switch per field', async ({ page }) => {
    await expect(page.getByTestId('quick-scan-note-show').getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByTestId('receipt-settings-hide-note').getByRole('checkbox')).not.toBeChecked();
    await expect(comboboxNamed(page, 'Paid by, when a scan does not say')).toContainText('The person scanning');

    // The switches that showed or required a field per photo are gone.
    await expect(page.getByTestId('quick-scan-paidby-show')).toHaveCount(0);
    await expect(page.getByTestId('quick-scan-status-show')).toHaveCount(0);
    await expect(page.getByTestId('quick-scan-comment-show')).toHaveCount(0);
  });

  test('asks who, and only then, for "Always the same person"', async ({ page }) => {
    const paidBy = comboboxNamed(page, 'Paid by, when a scan does not say');
    const person = comboboxNamed(page, 'Person');
    await expect(person).toHaveCount(0);

    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/groupReceiptSettings')) {
        requests.push(r.url());
      }
    });

    // "Always the same person" with nobody chosen: the form is invalid and Save sends nothing.
    await paidBy.click();
    await page.getByRole('option', { name: 'Always the same person', exact: true }).click();
    await expect(person).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(person).toBeVisible();
    expect(requests).toHaveLength(0);

    // Back to the person scanning: the picker goes and the server takes the save.
    await paidBy.click();
    await page.getByRole('option', { name: 'The person scanning', exact: true }).click();
    await expect(person).toHaveCount(0);
    expect(await saveAndGetStatus(page)).toBe(200);
    expect(requests).toHaveLength(1);
  });

  test('greys out the Quick Scan note switch while the note is hidden, keeping its value', async ({ page }) => {
    const askForNote = page.getByTestId('quick-scan-note-show').getByRole('checkbox');

    await setAppCheckbox(page.getByTestId('quick-scan-note-show'), true);
    await expect(askForNote).toBeEnabled();

    // Hiding the note for the household hides it in Quick Scan too: the switch greys out but keeps its value.
    await setAppCheckbox(page.getByTestId('receipt-settings-hide-note'), true);
    await expect(askForNote).toBeDisabled();
    await expect(askForNote).toBeChecked();
    await expect(page.getByTestId('quick-scan-note-hidden-hint')).toBeVisible();

    // Showing the note again restores the switch exactly as it was.
    await setAppCheckbox(page.getByTestId('receipt-settings-hide-note'), false);
    await expect(askForNote).toBeEnabled();
    await expect(askForNote).toBeChecked();
    await expect(page.getByTestId('quick-scan-note-hidden-hint')).toHaveCount(0);
  });

  test('keeps the note switch through a save made while the note is hidden', async ({ page }) => {
    await setAppCheckbox(page.getByTestId('quick-scan-note-show'), true);
    await setAppCheckbox(page.getByTestId('receipt-settings-hide-note'), true);
    expect(await saveAndGetStatus(page)).toBe(200);

    // Reload: both come back as saved. A greyed-out switch left out of the request would come back off.
    await openSettings(page);
    await expect(page.getByTestId('receipt-settings-hide-note').getByRole('checkbox')).toBeChecked();
    await expect(page.getByTestId('quick-scan-note-show').getByRole('checkbox')).toBeChecked();

    await setAppCheckbox(page.getByTestId('receipt-settings-hide-note'), false);
    expect(await saveAndGetStatus(page)).toBe(200);

    await openSettings(page);
    await expect(page.getByTestId('receipt-settings-hide-note').getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByTestId('quick-scan-note-show').getByRole('checkbox')).toBeChecked();
    await expect(page.getByTestId('quick-scan-note-show').getByRole('checkbox')).toBeEnabled();
  });

  test('persists the status of a new scan', async ({ page }) => {
    const status = comboboxNamed(page, 'Status of a new scan');
    await status.click();
    await page.getByRole('option', { name: 'Settled', exact: true }).click();
    expect(await saveAndGetStatus(page)).toBe(200);

    await openSettings(page);
    await expect(comboboxNamed(page, 'Status of a new scan')).toContainText('Settled');
  });
});
