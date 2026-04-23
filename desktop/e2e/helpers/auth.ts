import { expect, type Page } from '@playwright/test';

export type Role = 'admin' | 'user';

export function creds(role: Role) {
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

export async function loginViaUi(page: Page, role: Role) {
  const { username, password } = creds(role);
  await page.goto('/auth/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  // Generous timeout: the CI → demo hop is slower than local, and login can
  // also be backed off by the API's rate-limiter.
  await expect(page).toHaveURL(/\/dashboard\/group\/\d+/, { timeout: 15_000 });
}
