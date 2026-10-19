import { BrowserContext, expect, Page, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';
import {
  apiDeleteGroupById,
  apiDeleteRoleByName,
  createGroupWithMember,
  createRole,
  uniqueName,
  withAdminApi,
} from './helpers/provisioning';

// Shopping lists, end to end against the real API: the add / cross off / re-add / clear flow, the
// live SSE sync between two browsers, and the read-only view.
//
// One provisioned group serves every test: the admin creates it (so is its Owner, holding every
// group.shopping-lists.* permission) and adds e2e-user with the "Viewer" group preset, which grants
// group.shopping-lists.read only (role-presets.ts VIEWER_KEYS). Each test makes its own uniquely
// named list, so the tests do not collide.

const ADMIN_STATE = 'e2e/.auth/admin.json';

const openShoppingLists = async (page: Page, groupId: string) => {
  await stubTokenRefresh(page);
  await page.goto(`/shopping-lists/group/${groupId}`);
  await expect(page.getByRole('heading', { name: 'Shopping Lists' })).toBeVisible();
};

const addList = async (page: Page, name: string) => {
  await page.getByTestId('shopping-list-add').click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add List' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByTestId('dialog-submit-button').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tab', { name: new RegExp(name) })).toHaveAttribute('aria-selected', 'true');
};

const addItem = async (page: Page, name: string) => {
  await page.getByLabel('Add an item').fill(name);
  await page.getByLabel('Add an item').press('Enter');
  await expect(page.getByLabel('Add an item')).toHaveValue('');
};

const activeItem = (page: Page, name: string) =>
  page.getByTestId('shopping-list-active-items').getByRole('checkbox', { name: new RegExp(name) });

test.describe('Shopping lists', () => {
  test.describe.configure({ mode: 'serial' });

  let adminContext: BrowserContext;
  let roleName: string;
  let groupId: string;

  test.beforeAll(async ({ browser }) => {
    roleName = uniqueName('shopping-viewer');

    adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await stubTokenRefresh(adminPage);

    await createRole(adminPage, { name: roleName, type: 'Group role', preset: 'Viewer' });
    groupId = await createGroupWithMember(adminPage, {
      groupName: uniqueName('shopping-grp'),
      memberDisplayName: 'E2E User',
      roleName,
    });
  });

  test.afterAll(async () => {
    try {
      await withAdminApi(async (api) => {
        // The group first (it takes its lists with it and frees the member's role), then the role.
        await apiDeleteGroupById(api, groupId);
        await apiDeleteRoleByName(api, roleName, 'GROUP');
      });
    } catch {
      // Best-effort cleanup — don't mask a test failure with a cleanup error.
    }
    await adminContext?.close();
  });

  test.describe('as the group owner', () => {
    test.use({ storageState: ADMIN_STATE });

    test('adds, crosses off, revives and clears items', async ({ page }) => {
      await openShoppingLists(page, groupId);
      await addList(page, uniqueName('market'));

      await addItem(page, 'Milk');
      await addItem(page, 'Bread');
      await expect(activeItem(page, 'Milk')).toBeVisible();

      // Crossing off moves the item into the collapsed "Crossed off" section.
      await activeItem(page, 'Milk').click();
      await expect(activeItem(page, 'Milk')).toHaveCount(0);
      const crossedOff = page.getByTestId('shopping-list-crossed-off-toggle');
      await expect(crossedOff).toHaveText(/Crossed off \(1\)/);

      // Typing a crossed-off item's name again puts that item back instead of duplicating it.
      await addItem(page, 'milk');
      await expect(activeItem(page, 'Milk')).toHaveCount(1);
      await expect(crossedOff).toBeHidden();

      // Clear all removes only the crossed-off items, and survives a reload.
      await activeItem(page, 'Bread').click();
      await crossedOff.click();
      await page.getByTestId('shopping-list-clear-crossed-off').click();
      await page.getByRole('dialog').getByTestId('dialog-submit-button').click();
      await expect(crossedOff).toBeHidden();

      await page.reload();
      await expect(activeItem(page, 'Milk')).toBeVisible();
      await expect(page.getByText('Bread')).toHaveCount(0);
    });

    test('syncs a change to another open browser without a reload', async ({ page, browser }) => {
      const listName = uniqueName('sync');
      await openShoppingLists(page, groupId);
      await addList(page, listName);

      const otherContext = await browser.newContext({ storageState: ADMIN_STATE });
      try {
        const other = await otherContext.newPage();
        await openShoppingLists(other, groupId);
        await other.getByRole('tab', { name: new RegExp(listName) }).click();

        // Added here, appears there — carried by the SSE stream, not a refetch.
        await addItem(page, 'Eggs');
        await expect(activeItem(other, 'Eggs')).toBeVisible();

        // Crossed off there, crossed off here.
        await activeItem(other, 'Eggs').click();
        await expect(activeItem(page, 'Eggs')).toHaveCount(0);
        await expect(page.getByTestId('shopping-list-crossed-off-toggle')).toHaveText(/Crossed off \(1\)/);
      } finally {
        await otherContext.close();
      }
    });
  });

  // Runs as the default project user (e2e-user), a Viewer: read only.
  test('a viewer sees the lists but cannot change them', async ({ page }) => {
    const listName = uniqueName('viewer');
    await withAdminApi(async (api) => {
      const res = await api.post(`/api/shopping-list/group/${groupId}`, { data: { name: listName } });
      expect(res.ok()).toBe(true);
      const list = (await res.json()) as { id: number };
      expect((await api.post(`/api/shopping-list/${list.id}/item`, { data: { name: 'Apples' } })).ok()).toBe(true);
    });

    await openShoppingLists(page, groupId);
    // Lists are ordered by name, so the earlier tests' lists come first.
    await page.getByRole('tab', { name: new RegExp(listName) }).click();
    await expect(activeItem(page, 'Apples')).toBeVisible();

    await expect(page.getByLabel('Add an item')).toHaveCount(0);
    await expect(page.getByTestId('shopping-list-add')).toHaveCount(0);
    await expect(page.getByTestId('shopping-list-menu')).toHaveCount(0);
    await expect(page.getByTestId('shopping-list-active-items').getByRole('checkbox').first()).toBeDisabled();
  });
});
