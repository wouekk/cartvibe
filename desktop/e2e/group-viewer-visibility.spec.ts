import { expect, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import {
  apiDeleteGroupById,
  createGroupWithMember,
  uniqueName,
  withAdminApi,
} from './helpers/provisioning';

// A group VIEWER (low-tier member) must be denied the group-scoped edit actions
// — editing the group, its receipt settings, and creating receipts — while
// still able to VIEW the group (proving the denial is selective, not a blanket
// lockout). The rest of the suite runs as a Legacy Admin or as e2e-user acting
// as a group OWNER, so this is the first coverage of the group-scoped *deny*
// path (a Viewer/Editor tier being held back from what an Owner can do).
//
// e2e-user has no low-tier membership by default (creating a group makes them
// the Owner), so the admin API provisions a group and adds e2e-user as a
// "Legacy Viewer" (the household member dialog only offers the family roles).
// The assertions then run as the default project user (e2e-user = the Viewer)
// against that group.

test.describe('Group Viewer is denied group/receipt edits', () => {
  // Provision the viewer group once, then run the independent assertions
  // against it in order.
  test.describe.configure({ mode: 'serial' });

  let viewerGroupId: string;
  let groupName: string;

  test.beforeAll(async () => {
    groupName = uniqueName('viewer-grp');
    viewerGroupId = await createGroupWithMember(null, {
      groupName,
      memberDisplayName: 'E2E User',
      roleName: 'Legacy Viewer',
    });
  });

  test.afterAll(async () => {
    try {
      await withAdminApi((api) => apiDeleteGroupById(api, viewerGroupId));
    } catch {
      // Best-effort cleanup — don't mask a test failure with a cleanup error.
    }
  });

  // Assertions run as the default project user (e2e-user = the Viewer).
  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
  });

  test('cannot open the group edit route', async ({ page }) => {
    await page.goto(`/groups/${viewerGroupId}/details/edit`);
    // groupPermissionGuard denies (group.update) and redirects to the dashboard or the receipts list.
    await expect(page).toHaveURL(/\/(overview|receipts)\/group\/\d+/);
  });

  test('cannot open the receipt-settings edit route', async ({ page }) => {
    await page.goto(`/groups/${viewerGroupId}/receipt-settings/edit`);
    await expect(page).toHaveURL(/\/(overview|receipts)\/group\/\d+/);
  });

  test('group row exposes no edit or delete action', async ({ page }) => {
    await page.goto('/groups');
    const row = page.getByRole('row').filter({ hasText: groupName }).first();
    await expect(row).toBeVisible();
    // Neither gate (group.update / group.delete) is held for this group.
    await expect(row.getByTestId('group-edit')).toHaveCount(0);
    await expect(row.getByTestId('group-delete')).toHaveCount(0);
  });

  test('cannot add a receipt in the group', async ({ page }) => {
    await page.goto(`/receipts/group/${viewerGroupId}`);
    // Add Receipt is gated on group.receipts.* which a Viewer lacks.
    await expect(
      page.getByRole('button', { name: 'Add Receipt' }),
    ).toHaveCount(0);
  });

  test('can still view the group (denial is selective)', async ({ page }) => {
    await page.goto(`/groups/${viewerGroupId}/details/view`);
    await expect(page).toHaveURL(
      new RegExp(`/groups/${viewerGroupId}/details/view`),
    );
    // A Viewer holds group.view — the read path is allowed, only writes deny.
    await expect(page.getByLabel('Group Name')).toHaveValue(groupName);
  });
});
