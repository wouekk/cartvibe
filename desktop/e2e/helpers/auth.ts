import { expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';

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

/**
 * The backend's refresh token middleware single-uses refresh tokens, and the
 * Angular APP_INITIALIZER fires /api/token on every page load. Left
 * unmocked, that rotates the token out from under storageState-based tests:
 * test N refreshes and marks the old token used, test N+1 loads the same
 * storageState file with the now-invalid refresh token and gets bounced to
 * /auth/login. Intercept the refresh call and synthesize a response from
 * the existing (still-valid) access token so the app keeps the original
 * cookies for the whole test.
 */
export async function stubTokenRefresh(page: Page) {
  await page.route('**/api/token/**', async (route) => {
    const cookies = await page.context().cookies();
    const jwt = cookies.find((c) => c.name === 'jwt');
    if (!jwt) {
      await route.continue();
      return;
    }
    const payload = JSON.parse(
      Buffer.from(jwt.value.split('.')[1], 'base64url').toString(),
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
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
