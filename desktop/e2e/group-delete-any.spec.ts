import { expect, test } from '@playwright/test';
import {
  apiCreateGroup,
  apiDeleteGroupById,
  apiDeleteRoleByName,
  apiDeleteUserByName,
  createRole,
  createUserWithRole,
  uniqueName,
  withAdminApi,
  withApiAsCreds,
} from './helpers/provisioning';

// `app.groups.delete` lets an administrator remove a group they are not a member of; the group-scoped
// `group.delete` can never apply to them. The Management list no longer offers an all-groups view (the filter
// button is gone), so a group a person is not in cannot be reached in the browser and this spec proves the rule
// on the server, which is the real gate: a "deleter" holding the whole Groups resource deletes an admin-owned
// group (200), and a "reader" identical but without Delete Any Group is refused (403) and the group survives.
// The row action's own gate (`*hasGroupPermission` with `orApp`) is covered by the Vitest spec of the group table.

// Generated at runtime (no static secret in the repo). The -Aa1! suffix
// guarantees upper/lower/digit/symbol in case a password policy is ever added.
const PASSWORD = `${uniqueName('pw')}-Aa1!`;

test.describe('Delete any group (app.groups.delete)', () => {
  test.describe.configure({ mode: 'serial' });

  let deleterRole: string;
  let readerRole: string;
  let deleterUser: string;
  let readerUser: string;
  // Two groups so the destructive test can't strand the denied one.
  let deletableGroup: { id: number; name: string };
  let untouchedGroup: { id: number; name: string };

  test.beforeAll(async () => {
    deleterRole = uniqueName('group-deleter-role');
    readerRole = uniqueName('group-reader-role');
    deleterUser = uniqueName('group-deleter');
    readerUser = uniqueName('group-reader');

    // The whole Groups resource: app.groups.create/read/update-settings/delete.
    await createRole(null, {
      name: deleterRole,
      type: 'Application role',
      preset: 'Start from scratch',
      enableCategories: ['Account', 'Notifications', 'Groups'],
    });
    // Identical, minus the one permission under test.
    await createRole(null, {
      name: readerRole,
      type: 'Application role',
      preset: 'Start from scratch',
      enableCategories: ['Account', 'Notifications', 'Groups'],
      disablePermissions: [{ panelKey: 'app.groups', label: 'Delete Any Group' }],
    });
    await createUserWithRole(null, { username: deleterUser, password: PASSWORD, role: deleterRole });
    await createUserWithRole(null, { username: readerUser, password: PASSWORD, role: readerRole });

    // Groups owned by the admin — neither provisioned user is a member, so the
    // group-scoped group.delete can never apply to them.
    await withAdminApi(async (api) => {
      deletableGroup = await apiCreateGroup(api, uniqueName('abandoned-group'));
      untouchedGroup = await apiCreateGroup(api, uniqueName('leftover-group'));
    });
  });

  test.afterAll(async () => {
    // Best-effort and isolated per step: one failure must not strand the rest, and a leaked role blocks
    // the next run (an assigned role can't be deleted later by hand).
    const cleanUp = async (what: string, run: () => Promise<void>) => {
      try {
        await run();
      } catch (err) {
        console.warn(`teardown: ${what} failed —`, err);
      }
    };

    try {
      await withAdminApi(async (api) => {
        for (const group of [deletableGroup, untouchedGroup]) {
          if (group) {
            await cleanUp(`delete group ${group.name}`, () => apiDeleteGroupById(api, String(group.id)));
          }
        }
        for (const username of [deleterUser, readerUser]) {
          await cleanUp(`delete user ${username}`, () => apiDeleteUserByName(api, username));
        }
        for (const role of [deleterRole, readerRole]) {
          await cleanUp(`delete role ${role}`, () => apiDeleteRoleByName(api, role, 'APP'));
        }
      });
    } catch (err) {
      console.warn('teardown: admin API unavailable —', err);
    }
  });

  test('a reader without app.groups.delete is denied by the server', async () => {
    await withApiAsCreds(readerUser, PASSWORD, async (api) => {
      const res = await api.delete(`/api/group/${untouchedGroup.id}`);
      expect(res.status()).toBe(403);
    });

    // The group is still there.
    await withAdminApi(async (api) => {
      expect((await api.get(`/api/group/${untouchedGroup.id}`)).status()).toBe(200);
    });
  });

  test('an app.groups.delete holder deletes a group it is not a member of', async () => {
    await withApiAsCreds(deleterUser, PASSWORD, async (api) => {
      const res = await api.delete(`/api/group/${deletableGroup.id}`);
      expect(res.status()).toBe(200);
    });

    await withAdminApi(async (api) => {
      expect((await api.get(`/api/group/${deletableGroup.id}`)).ok()).toBe(false);
      expect((await api.get(`/api/group/${untouchedGroup.id}`)).status()).toBe(200);
    });
  });
});
