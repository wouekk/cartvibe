import { comboboxNamed } from './helpers/ui';
import { expect, type Route, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import {
  apiCreateGroup,
  apiDeleteGroupById,
  uniqueName,
  withAdminApi,
} from './helpers/provisioning';
import {
  injectQuickScanAppData,
  openQuickScanDialog,
  selectImageGroup,
  uploadQuickScanImages,
} from './helpers/quick-scan';

// The Quick Scan DIALOG: a photo, its household, and nothing else unless the household asks for a note.
//
// The dialog is only reachable via a button gated behind the `aiPoweredReceipts` feature flag, which is off in
// dev/CI. Rather than mutate that global server config, the AppData response is intercepted client-side (see
// helpers/quick-scan.ts) to flip the flag on and switch the note on for the target household. The scan itself is
// answered by a stub: with no AI configured the server would refuse it, and what is proved here is the dialog.

test.use({ storageState: 'e2e/.auth/admin.json' });

test.describe('Quick scan dialog', () => {
  let group: { id: number; name: string };

  test.beforeAll(async () => {
    await withAdminApi(async (api) => {
      group = await apiCreateGroup(api, uniqueName('qs-dlg'));
    });
  });

  test.afterAll(async () => {
    await withAdminApi(async (api) => {
      await apiDeleteGroupById(api, String(group.id));
    });
  });

  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
    await injectQuickScanAppData(page, {
      groupConfigs: [{ groupId: group.id, config: { quickScanNoteEnabled: true } }],
    });
  });

  test('asks for the household, then for a note only where the household wants one', async ({ page }) => {
    let scansSent = 0;
    await page.route('**/api/receipt/quickScan', async (route: Route) => {
      scansSent += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const dialog = await openQuickScanDialog(page, group.id);
    await uploadQuickScanImages(dialog, 1);

    // No household is selected yet (the admin belongs to several, so none is seeded), and a photo with no
    // household has no settings to follow: only the Group field renders. The toHaveValue('') is load-bearing: an
    // auto-filled household would turn the absence checks below into vacuous truths.
    const groupField = comboboxNamed(dialog, 'Group');
    await expect(groupField).toBeVisible();
    await expect(groupField).toHaveValue('');
    await expect(dialog.getByTestId('quick-scan-note')).toHaveCount(0);

    // Without a household the scan is refused and nothing is sent.
    await dialog.getByTestId('dialog-submit-button').click();
    await expect(page.getByText('Please fill in all required fields', { exact: false })).toBeVisible();
    expect(scansSent).toBe(0);

    await selectImageGroup(page, dialog, group.name);

    // The note is the only field a household can add. Who paid, the status, categories and tags are never asked.
    await expect(dialog.getByTestId('quick-scan-note')).toBeVisible();
    await expect(comboboxNamed(dialog, 'Paid By')).toHaveCount(0);
    await expect(comboboxNamed(dialog, 'Status')).toHaveCount(0);
    await expect(comboboxNamed(dialog, 'Categories')).toHaveCount(0);
    await expect(comboboxNamed(dialog, 'Tags')).toHaveCount(0);

    // The note can stay empty: the photo and its household are enough.
    await dialog.getByTestId('dialog-submit-button').click();
    await expect(page.getByText('Receipts uploaded', { exact: false })).toBeVisible();
    expect(scansSent).toBe(1);
  });
});
