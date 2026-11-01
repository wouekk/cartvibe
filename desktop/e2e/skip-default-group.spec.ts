import { BrowserContext, expect, Page, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import {
  apiDeleteRoleByName,
  apiDeleteUserByName,
  apiGroupNames,
  createRole,
  createUserWithRole,
  uniqueName,
  withAdminApi,
  withApiAsCreds,
} from './helpers/provisioning';

// An app role can opt its new users out of the automatic personal "My Receipts"
// group, for accounts that only ever belong to a few specific shared groups. The
// virtual "All" group is always created, so the account keeps a working
// dashboard. See api/CLAUDE.md → "Skipping the personal group per app role".
//
// Covered: the end-to-end effect on a real provisioned account, and the server-side scope guard that rejects the
// flag on a group role. The role editor card these once covered is gone.

// Role management is admin-only, so override the default regular-user state.
test.use({ storageState: 'e2e/.auth/admin.json' });

const PERSONAL_GROUP = 'My Receipts';
const ALL_GROUP = 'All';
const PASSWORD = 'a really secure password';

test.describe('a flagged role skips the new user\'s personal group', () => {
  // One admin context provisions both roles and both users, then the assertions
  // run against them in order.
  test.describe.configure({ mode: 'serial' });

  let adminContext: BrowserContext;
  let adminPage: Page;
  let skipRole: string;
  let normalRole: string;
  let skipUser: string;
  let normalUser: string;

  test.beforeAll(async ({ browser }) => {
    skipRole = uniqueName('skip-role');
    normalRole = uniqueName('normal-role');
    skipUser = uniqueName('skip-user');
    normalUser = uniqueName('normal-user');

    adminContext = await browser.newContext({
      storageState: 'e2e/.auth/admin.json',
    });
    adminPage = await adminContext.newPage();
    await stubTokenRefresh(adminPage);

    // "Read Only" grants every *.read permission, which includes
    // app.account.read — what GET /api/group/ is gated on, so each provisioned
    // user can list their own groups below.
    await createRole(adminPage, {
      name: skipRole,
      type: 'Application role',
      preset: 'Read Only',
      skipDefaultGroup: true,
    });
    await createRole(adminPage, {
      name: normalRole,
      type: 'Application role',
      preset: 'Read Only',
    });
    await createUserWithRole(adminPage, {
      username: skipUser,
      password: PASSWORD,
      role: skipRole,
    });
    await createUserWithRole(adminPage, {
      username: normalUser,
      password: PASSWORD,
      role: normalRole,
    });
  });

  test.afterAll(async () => {
    try {
      await withAdminApi(async (api) => {
        // Users first — a role cannot be deleted while it is still assigned.
        await apiDeleteUserByName(api, skipUser);
        await apiDeleteUserByName(api, normalUser);
        await apiDeleteRoleByName(api, skipRole, 'APP');
        await apiDeleteRoleByName(api, normalRole, 'APP');
      });
    } catch {
      // Best-effort cleanup — don't mask a test failure with a cleanup error.
    }
    await adminContext?.close();
  });

  test('the flagged user gets the All group but no personal group', async () => {
    const groups = await withApiAsCreds(skipUser, PASSWORD, apiGroupNames);

    expect(groups).not.toContain(PERSONAL_GROUP);
    // The virtual "All" group is always created, so the account still has a
    // dashboard to land on.
    expect(groups).toContain(ALL_GROUP);
  });

  test('a user on an unflagged role still gets the personal group', async () => {
    const groups = await withApiAsCreds(normalUser, PASSWORD, apiGroupNames);

    // Contrast case: proves the skip is driven by the role's flag, not by
    // something else about how these accounts are provisioned.
    expect(groups).toContain(PERSONAL_GROUP);
    expect(groups).toContain(ALL_GROUP);
  });

  // Fully self-contained: it MUTATES its role mid-test, so it provisions and
  // tears down its own role/user rather than reading the cohort's fixtures, and
  // it drives the UI through the per-test `page` fixture — a fresh
  // BrowserContext carrying the file-level admin storageState — instead of the
  // beforeAll context (CLAUDE.md → "Isolation — each test gets a fresh
  // BrowserContext"). Nothing about this case is shared with a sibling test.
  test('turning the flag on later leaves an existing user\'s groups alone', async ({
    page,
  }) => {
    await stubTokenRefresh(page);
    const roleName = uniqueName('later-role');
    const userName = uniqueName('later-user');

    try {
      await createRole(page, {
        name: roleName,
        type: 'Application role',
        preset: 'Read Only',
      });
      await createUserWithRole(page, {
        username: userName,
        password: PASSWORD,
        role: roleName,
      });

      // Created while the role was unflagged, so it has the personal group.
      let groups = await withApiAsCreds(userName, PASSWORD, apiGroupNames);
      expect(groups).toContain(PERSONAL_GROUP);

      // Flip the flag on after the fact, and confirm it actually persisted —
      // otherwise the "nothing changed" assertion below would pass just as
      // happily on a no-op toggle, proving nothing.
      await openRoleEditor(page, roleName);
      await skipCheckbox(page).check();
      await saveRole(page);
      await expect(page).toHaveURL(/\/roles$/);
      await openRoleEditor(page, roleName);
      await expect(skipCheckbox(page)).toBeChecked();

      // The flag is evaluated once, at user-creation time — it is not a live
      // property of the account, so the existing user keeps its personal group.
      groups = await withApiAsCreds(userName, PASSWORD, apiGroupNames);
      expect(groups).toContain(PERSONAL_GROUP);
      expect(groups).toContain(ALL_GROUP);
    } finally {
      try {
        await withAdminApi(async (api) => {
          // User first — a role cannot be deleted while it is still assigned.
          await apiDeleteUserByName(api, userName);
          await apiDeleteRoleByName(api, roleName, 'APP');
        });
      } catch {
        // Best-effort cleanup — don't mask a test failure with a cleanup error.
      }
    }
  });
});

test.describe('the flag is app-scope only on the server', () => {
  test('POST /api/role rejects it on a group role', async () => {
    await withAdminApi(async (api) => {
      const res = await api.post('/api/role', {
        data: {
          name: uniqueName('bad-group-role'),
          description: '',
          scope: 'GROUP',
          permissions: ['group.receipts.read'],
          skipDefaultGroupCreation: true,
        },
      });

      // The UI never sends it on a group role, but the server is the enforcer:
      // a crafted request must be rejected rather than silently ignored.
      expect(res.status()).toBe(400);
      expect(await res.text()).toContain('skipDefaultGroupCreation');
    });
  });
});
