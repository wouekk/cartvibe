import { expect, test } from '@playwright/test';
import {
  apiCreateGroup,
  apiDeleteGroupById,
  apiDeleteUserByName,
  createUserWithRole,
  uniqueName,
  withAdminApi,
  withApiAsCreds,
} from './helpers/provisioning';

// `app.groups.delete` lets an Admin remove a household they are not a member of; the group-scoped
// `group.delete` can never apply to them. The Management list offers no all-households view, so a household a
// person is not in cannot be reached in the browser and this spec proves the rule on the server, which is the
// real gate: a second Admin deletes a household owned by the first (200), and a User is refused (403) and the
// household survives. The row action's own gate (`*hasGroupPermission` with `orApp`) is covered by the Vitest
// spec of the group table.

// Generated at runtime (no static secret in the repo). The -Aa1! suffix
// guarantees upper/lower/digit/symbol in case a password policy is ever added.
const PASSWORD = `${uniqueName('pw')}-Aa1!`;

test.describe('Delete any group (app.groups.delete)', () => {
  test.describe.configure({ mode: 'serial' });

  let adminUser: string;
  let plainUser: string;
  // Two groups so the destructive test can't strand the denied one.
  let deletableGroup: { id: number; name: string };
  let untouchedGroup: { id: number; name: string };

  test.beforeAll(async () => {
    adminUser = uniqueName('group-deleter');
    plainUser = uniqueName('group-reader');

    await createUserWithRole(null, { username: adminUser, password: PASSWORD, role: 'Legacy Admin' });
    await createUserWithRole(null, { username: plainUser, password: PASSWORD, role: 'User' });

    // Groups owned by the e2e admin — neither provisioned account is a member, so the
    // group-scoped group.delete can never apply to them.
    await withAdminApi(async (api) => {
      deletableGroup = await apiCreateGroup(api, uniqueName('abandoned-group'));
      untouchedGroup = await apiCreateGroup(api, uniqueName('leftover-group'));
    });
  });

  test.afterAll(async () => {
    // Best-effort and isolated per step: one failure must not strand the rest.
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
        for (const username of [adminUser, plainUser]) {
          await cleanUp(`delete user ${username}`, () => apiDeleteUserByName(api, username));
        }
      });
    } catch (err) {
      console.warn('teardown: admin API unavailable —', err);
    }
  });

  test('a User, who lacks app.groups.delete, is denied by the server', async () => {
    await withApiAsCreds(plainUser, PASSWORD, async (api) => {
      const res = await api.delete(`/api/group/${untouchedGroup.id}`);
      expect(res.status()).toBe(403);
    });

    // The group is still there.
    await withAdminApi(async (api) => {
      expect((await api.get(`/api/group/${untouchedGroup.id}`)).status()).toBe(200);
    });
  });

  test('an Admin deletes a group it is not a member of', async () => {
    await withApiAsCreds(adminUser, PASSWORD, async (api) => {
      const res = await api.delete(`/api/group/${deletableGroup.id}`);
      expect(res.status()).toBe(200);
    });

    await withAdminApi(async (api) => {
      expect((await api.get(`/api/group/${deletableGroup.id}`)).ok()).toBe(false);
      expect((await api.get(`/api/group/${untouchedGroup.id}`)).status()).toBe(200);
    });
  });
});
