import { expect, test } from '@playwright/test';
import { loginViaUi } from './helpers/auth';

// These tests exercise the login UI itself, so they must start unauthenticated
// even though the chromium project defaults to a logged-in storage state.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('authentication', () => {
  test('admin can log in and reach the dashboard', async ({ page }) => {
    await loginViaUi(page, 'admin');
    await expect(page).toHaveURL(/\/dashboard\/group\/\d+/);
  });

  test('regular user can log in and reach the dashboard', async ({ page }) => {
    await loginViaUi(page, 'user');
    await expect(page).toHaveURL(/\/dashboard\/group\/\d+/);
  });
});
