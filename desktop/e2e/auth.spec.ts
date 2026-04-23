import { expect, test } from '@playwright/test';
import { loginViaUi } from './helpers/auth';

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
