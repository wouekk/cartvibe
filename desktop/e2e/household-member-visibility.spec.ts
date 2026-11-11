import { expect, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import {
  apiDeleteGroupById,
  createGroupWithMember,
  uniqueName,
  withAdminApi,
  withApiAs,
} from './helpers/provisioning';

// A Member of a household works with its receipts and lists, and is held back from the household itself:
// editing it, its receipt settings, and deleting it stay with its Owner. The Member can still VIEW the
// household (proving the denial is selective, not a blanket lockout).
//
// The admin API provisions a household and adds e2e-user as a Member. The assertions then run as the
// default project user (e2e-user) against that household.

test.describe('A Member is denied the household\'s own settings', () => {
  // Provision the household once, then run the independent assertions against it in order.
  test.describe.configure({ mode: 'serial' });

  let memberGroupId: string;
  let groupName: string;

  test.beforeAll(async () => {
    groupName = uniqueName('member-grp');
    memberGroupId = await createGroupWithMember(null, {
      groupName,
      memberDisplayName: 'E2E User',
      roleName: 'Member',
    });
  });

  test.afterAll(async () => {
    try {
      await withAdminApi((api) => apiDeleteGroupById(api, memberGroupId));
    } catch {
      // Best-effort cleanup — don't mask a test failure with a cleanup error.
    }
  });

  // Assertions run as the default project user (e2e-user = the Member).
  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
  });

  test('cannot open the group edit route', async ({ page }) => {
    await page.goto(`/groups/${memberGroupId}/details/edit`);
    // groupPermissionGuard denies (group.update) and redirects to the dashboard or the receipts list.
    await expect(page).toHaveURL(/\/(overview|receipts)\/group\/\d+/);
  });

  test('cannot open the receipt-settings edit route', async ({ page }) => {
    await page.goto(`/groups/${memberGroupId}/receipt-settings/edit`);
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

  test('renaming the household is denied by the server (API 403)', async () => {
    await withApiAs('user', async (api) => {
      const res = await api.put(`/api/group/${memberGroupId}`, {
        data: { name: `${groupName}-renamed`, status: 'ACTIVE', groupMembers: [] },
      });
      expect(res.status()).toBe(403);
    });
  });

  test('can still view the group (denial is selective)', async ({ page }) => {
    await page.goto(`/groups/${memberGroupId}/details/view`);
    await expect(page).toHaveURL(
      new RegExp(`/groups/${memberGroupId}/details/view`),
    );
    // A Member holds group.view — the read path is allowed, only the household's own writes deny.
    await expect(page.getByLabel('Group Name')).toHaveValue(groupName);
  });
});
