import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';
const isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?/i.test(baseURL);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    // Logs in once per role and writes the session to e2e/.auth/*.json.
    {
      name: 'setup',
      testMatch: '**/*.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // All *.spec.ts tests start pre-authenticated as the regular user.
    // Individual tests can override with test.use({ storageState: ... }).
    // Inherits the default testMatch ('**/*.@(spec|test).*'), which does not
    // match *.setup.ts, so setup files aren't double-run here.
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
  webServer: isLocal
    ? {
        command: 'npm start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
