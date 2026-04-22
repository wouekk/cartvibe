import { expect, test } from '@playwright/test';

function creds(role: 'admin' | 'user') {
  const username = process.env[`E2E_${role.toUpperCase()}_USERNAME`];
  const password = process.env[`E2E_${role.toUpperCase()}_PASSWORD`];
  if (!username || !password) {
    throw new Error(
      `Missing E2E_${role.toUpperCase()}_USERNAME / E2E_${role.toUpperCase()}_PASSWORD. ` +
        `Source api/dev/switch-to-sqlite.sh or set the vars in your environment.`,
    );
  }
  return { username, password };
}

async function login(page: import('@playwright/test').Page, role: 'admin' | 'user') {
  const { username, password } = creds(role);
  await page.goto('/auth/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

test.describe('authentication', () => {
  test('admin can log in and reach the dashboard', async ({ page }) => {
    await login(page, 'admin');
    await expect(page).toHaveURL(/\/dashboard\/group\/\d+/);
  });

  test('regular user can log in and reach the dashboard', async ({ page }) => {
    await login(page, 'user');
    await expect(page).toHaveURL(/\/dashboard\/group\/\d+/);
  });
});
