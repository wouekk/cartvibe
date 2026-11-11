import { expect, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import { uniqueName, withApiAs } from './helpers/provisioning';

// A User (the app role every account but an Admin holds) keeps their own account, the shared categories
// and tags and the AI page, and nothing of people, system settings or households. These tests lock in that
// such a user cannot reach the admin-only areas. Access is asserted through the route guards (no UI
// fiddling), through the one button the households page gates, and through an API call that must 403.

// Admin-only areas a User must be redirected away from.
const ADMIN_ONLY_ROUTES = ['/users', '/system-settings', '/groups/create'];
// The guard sends a denied route to the landing page: the Dashboard, the receipts list or the root.
const LANDING = /^[^?]*(\/(overview|receipts)\/group\/\d+|\/)$/;

test.describe('User visibility', () => {
  // The default chromium project uses e2e/.auth/user.json (e2e-user = User).
  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
  });

  for (const path of ADMIN_ONLY_ROUTES) {
    test(`is redirected away from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(LANDING);
    });
  }

  test('households: opens the list of their own households, without the create button', async ({ page }) => {
    await page.goto('/groups');
    // The list is not gated on app.groups.read: it shows the caller's OWN households.
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole('row').filter({ hasText: 'Household' }).first()).toBeVisible();
    // Creating a household takes app.groups.create, which only an Admin holds.
    await expect(page.getByTestId('group-create')).toHaveCount(0);
  });
});

// Contrast: an Admin holds the corresponding permissions and can reach the same areas, proving the gating
// is selective, not globally broken.
test.describe('Admin can reach admin-only areas (contrast)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    await stubTokenRefresh(page);
  });

  test('can open Manage Users', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/users/);
  });

  test('can open System Settings', async ({ page }) => {
    await page.goto('/system-settings');
    // The landing guard redirects to the first tab the admin can read.
    await expect(page).toHaveURL(/\/system-settings\//);
  });
});

// The UI hides what a User may not do, but the server is the real enforcer: it must 403 a direct call even
// if the UI is bypassed.
test.describe('What only an Admin may do is denied to a User (API 403)', () => {
  test('POST /api/group 403s for a User', async () => {
    await withApiAs('user', async (api) => {
      const res = await api.post('/api/group', {
        data: { name: uniqueName('user-made-household'), status: 'ACTIVE', groupMembers: [] },
      });
      // A User lacks app.groups.create.
      expect(res.status()).toBe(403);
    });
  });

  test('GET /api/role 403s for a User', async () => {
    await withApiAs('user', async (api) => {
      // A User lacks app.roles.read.
      expect((await api.get('/api/role')).status()).toBe(403);
    });
  });

  test('no route creates a role, even for an Admin', async () => {
    await withApiAs('admin', async (api) => {
      const res = await api.post('/api/role', {
        data: { name: uniqueName('made-up-role'), scope: 'APP', permissions: ['app.users.read'] },
      });
      // The roles are fixed: the route is gone, so the answer is neither a success nor a role.
      expect(res.ok()).toBe(false);
    });
  });
});
