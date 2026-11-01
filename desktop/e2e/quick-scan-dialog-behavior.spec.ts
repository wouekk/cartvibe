import { comboboxNamed } from './helpers/ui';
import { expect, type Route, test } from '@playwright/test';
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

// Deeper Quick Scan DIALOG behavior, complementing quick-scan-dialog.spec.ts
// (which asserts a single static config snapshot). Everything is driven by
// client-side AppData injection (see helpers/quick-scan.ts) so no server config
// is mutated. The two SUBMIT specs mock POST /receipt/quickScan: the backend
// validates each group's PERSISTED config (which we intentionally don't touch),
// so a real submit would 400 — capturing the request instead lets us assert the
// exact multipart the client builds (the "falls off the submission" half the
// mobile suite can't observe, since its queued receipt has no id).

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
  // The comment field: shown per config AND the caller's group.comments.create,
  // required blocks the submit, and the typed text rides the multipart.
  test('a required comment blocks submit until filled, then rides the multipart', async ({
    page,
  }) => {
    await injectQuickScanAppData(page, {
      groupConfigs: [
        {
          groupId: groupA.id,
          config: {
            quickScanPaidByEnabled: false,
            quickScanStatusEnabled: false,
            quickScanDefaultStatus: 'OPEN',
            quickScanCategoriesEnabled: false,
            quickScanTagsEnabled: false,
            quickScanCommentEnabled: true,
            quickScanCommentRequired: true,
          },
        },
      ],
      groupPermissions: { [groupA.id]: ['group.receipts.quick-scan', 'group.comments.create'] },
    });

    const requests: { body: Buffer | null; contentType: string }[] = [];
    await page.route('**/api/receipt/quickScan', async (route: Route) => {
      const req = route.request();
      requests.push({
        body: req.postDataBuffer(),
        contentType: req.headers()['content-type'] ?? '',
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const dialog = await openQuickScanDialog(page, groupA.id);
    await uploadQuickScanImages(dialog, 1);
    await selectImageGroup(page, dialog, groupA.name);

    const comment = dialog.getByTestId('quick-scan-comment').getByRole('textbox');
    await expect(comment).toBeVisible();

    // Empty + required → the submit is refused and nothing is sent.
    await dialog.getByTestId('dialog-submit-button').click();
    await expect(page.getByText('Please fill in all required fields', { exact: false })).toBeVisible();
    expect(requests).toHaveLength(0);

    await comment.fill('Client dinner, reimbursable');
    await dialog.getByTestId('dialog-submit-button').click();
    await expect(page.getByText('Receipts uploaded', { exact: false })).toBeVisible();

    expect(requests).toHaveLength(1);
    const fields = parseMultipartFields(requests[0].body!, requests[0].contentType);
    expect(fields.get('comments')).toEqual(['Client dinner, reimbursable']);
  });

  // Without group.comments.create the field is hidden even when the group enables
  // AND requires it — otherwise a member who cannot comment could never quick scan.
  test('the comment field is hidden without group.comments.create and does not block submit', async ({
    page,
  }) => {
    await injectQuickScanAppData(page, {
      groupConfigs: [
        {
          groupId: groupA.id,
          config: {
            quickScanPaidByEnabled: false,
            quickScanStatusEnabled: false,
            quickScanDefaultStatus: 'OPEN',
            quickScanCategoriesEnabled: false,
            quickScanTagsEnabled: false,
            quickScanCommentEnabled: true,
            quickScanCommentRequired: true,
          },
        },
      ],
      groupPermissions: { [groupA.id]: ['group.receipts.quick-scan'] },
    });

    const requests: { body: Buffer | null; contentType: string }[] = [];
    await page.route('**/api/receipt/quickScan', async (route: Route) => {
      const req = route.request();
      requests.push({
        body: req.postDataBuffer(),
        contentType: req.headers()['content-type'] ?? '',
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const dialog = await openQuickScanDialog(page, groupA.id);
    await uploadQuickScanImages(dialog, 1);
    await selectImageGroup(page, dialog, groupA.name);

    await expect(dialog.getByTestId('quick-scan-comment')).toHaveCount(0);

    await dialog.getByTestId('dialog-submit-button').click();
    await expect(page.getByText('Receipts uploaded', { exact: false })).toBeVisible();
    expect(requests).toHaveLength(1);
    const fields = parseMultipartFields(requests[0].body!, requests[0].contentType);
    expect(fields.get('comments')).toEqual(['']);
  });

  // hideComments hides the whole group's comments, so it hides the quick-scan
  // comment field too, without the config being changed.
  test('the comment field is hidden when the group hides comments', async ({ page }) => {
    await injectQuickScanAppData(page, {
      groupConfigs: [
        {
          groupId: groupA.id,
          config: {
            quickScanPaidByEnabled: false,
            quickScanStatusEnabled: false,
            quickScanDefaultStatus: 'OPEN',
            quickScanCategoriesEnabled: false,
            quickScanTagsEnabled: false,
            quickScanCommentEnabled: true,
            quickScanCommentRequired: true,
            hideComments: true,
          },
        },
      ],
      groupPermissions: { [groupA.id]: ['group.receipts.quick-scan', 'group.comments.create'] },
    });

    const dialog = await openQuickScanDialog(page, groupA.id);
    await uploadQuickScanImages(dialog, 1);
    await selectImageGroup(page, dialog, groupA.name);

    await expect(dialog.getByTestId('quick-scan-comment')).toHaveCount(0);
  });
});
