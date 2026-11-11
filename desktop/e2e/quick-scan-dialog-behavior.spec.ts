import { expect, type Page, type Route, test } from '@playwright/test';
import { creds, stubTokenRefresh } from './helpers/auth';
import {
  apiCreateGroup,
  apiDeleteGroupById,
  apiGetUserId,
  uniqueName,
  withAdminApi,
} from './helpers/provisioning';
import {
  injectQuickScanAppData,
  openQuickScanDialog,
  parseMultipartFields,
  selectImageGroup,
  uploadQuickScanImages,
} from './helpers/quick-scan';

// What a Quick Scan sends, complementing quick-scan-dialog.spec.ts (what the dialog shows). Everything is driven
// by client-side AppData injection (see helpers/quick-scan.ts) so no server config is mutated, and POST
// /receipt/quickScan is answered by a stub: with no AI configured the server would refuse the scan, and capturing
// the request is the only way to read the exact multipart the client builds.

test.use({ storageState: 'e2e/.auth/admin.json' });

test.describe('Quick scan dialog behavior', () => {
  let groupA: { id: number; name: string };
  let groupB: { id: number; name: string };
  let adminId: number;

  test.beforeAll(async () => {
    await withAdminApi(async (api) => {
      groupA = await apiCreateGroup(api, uniqueName('qs-a'));
      groupB = await apiCreateGroup(api, uniqueName('qs-b'));
      adminId = await apiGetUserId(api, creds('admin').username);
    });
  });

  test.afterAll(async () => {
    await withAdminApi(async (api) => {
      await apiDeleteGroupById(api, String(groupA.id));
      await apiDeleteGroupById(api, String(groupB.id));
    });
  });

  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
  });

  /** Answers every scan with 200 and keeps what was sent. */
  async function captureScans(page: Page): Promise<{ body: Buffer | null; contentType: string }[]> {
    const requests: { body: Buffer | null; contentType: string }[] = [];
    await page.route('**/api/receipt/quickScan', async (route: Route) => {
      const req = route.request();
      requests.push({
        body: req.postDataBuffer(),
        contentType: req.headers()['content-type'] ?? '',
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    return requests;
  }

  // The person's own defaults are cleared so the multipart below does not depend on what the admin account
  // happens to have stored.
  const noPersonalDefaults = { quickScanDefaultStatus: '', quickScanDefaultPaidById: null };

  test('a note rides the multipart, beside the scanner as the payer and nothing else chosen', async ({ page }) => {
    await injectQuickScanAppData(page, {
      groupConfigs: [{ groupId: groupA.id, config: { quickScanNoteEnabled: true } }],
      userPreferences: noPersonalDefaults,
    });
    const requests = await captureScans(page);

    const dialog = await openQuickScanDialog(page, groupA.id);
    await uploadQuickScanImages(dialog, 1);
    await selectImageGroup(page, dialog, groupA.name);

    const note = dialog.getByTestId('quick-scan-note').getByRole('textbox');
    await expect(note).toBeVisible();
    await note.fill('Birthday dinner, the big table');

    await dialog.getByTestId('dialog-submit-button').click();
    await expect(page.getByText('Receipts uploaded', { exact: false })).toBeVisible();

    expect(requests).toHaveLength(1);
    const fields = parseMultipartFields(requests[0].body!, requests[0].contentType);
    expect(fields.get('groupIds')).toEqual([String(groupA.id)]);
    // Whoever scans paid; the empty status leaves it to the household's default, then "To check".
    expect(fields.get('paidByUserIds')).toEqual([String(adminId)]);
    expect(fields.get('statuses')).toEqual(['']);
    expect(fields.get('categoryIds')).toEqual(['']);
    expect(fields.get('tagIds')).toEqual(['']);
    expect(fields.get('notes')).toEqual(['Birthday dinner, the big table']);
    // The field the server read before the note replaced comments is not sent any more.
    expect(fields.has('comments')).toBe(false);
  });

  test('the note is not asked for while the household hides the note', async ({ page }) => {
    await injectQuickScanAppData(page, {
      groupConfigs: [{ groupId: groupA.id, config: { quickScanNoteEnabled: true, hideNote: true } }],
      userPreferences: noPersonalDefaults,
    });
    const requests = await captureScans(page);

    const dialog = await openQuickScanDialog(page, groupA.id);
    await uploadQuickScanImages(dialog, 1);
    await selectImageGroup(page, dialog, groupA.name);

    await expect(dialog.getByTestId('quick-scan-note')).toHaveCount(0);

    await dialog.getByTestId('dialog-submit-button').click();
    await expect(page.getByText('Receipts uploaded', { exact: false })).toBeVisible();
    expect(requests).toHaveLength(1);
    const fields = parseMultipartFields(requests[0].body!, requests[0].contentType);
    expect(fields.get('notes')).toEqual(['']);
  });

  // The note follows the photo's household: one typed for a household that asks is not carried to one that
  // does not when the photo is moved.
  test('a note typed for one household is not sent to another that does not ask for one', async ({ page }) => {
    await injectQuickScanAppData(page, {
      groupConfigs: [
        { groupId: groupA.id, config: { quickScanNoteEnabled: true } },
        { groupId: groupB.id, config: { quickScanNoteEnabled: false } },
      ],
      userPreferences: noPersonalDefaults,
    });
    const requests = await captureScans(page);

    const dialog = await openQuickScanDialog(page, groupA.id);
    await uploadQuickScanImages(dialog, 1);
    await selectImageGroup(page, dialog, groupA.name);
    await dialog.getByTestId('quick-scan-note').getByRole('textbox').fill('meant for the first household');

    await selectImageGroup(page, dialog, groupB.name);
    await expect(dialog.getByTestId('quick-scan-note')).toHaveCount(0);

    await dialog.getByTestId('dialog-submit-button').click();
    await expect(page.getByText('Receipts uploaded', { exact: false })).toBeVisible();

    expect(requests).toHaveLength(1);
    const fields = parseMultipartFields(requests[0].body!, requests[0].contentType);
    expect(fields.get('groupIds')).toEqual([String(groupB.id)]);
    expect(fields.get('notes')).toEqual(['']);
  });
});
