import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';
// E2E_NO_WEBSERVER: the app is already running at baseURL (CI runs the built image on localhost:8091).
const isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?/i.test(baseURL) && !process.env.E2E_NO_WEBSERVER;

const PHONE_SPECS = '**/*.phone.spec.ts';

const GLOBAL_SETTINGS_SPECS = ['**/app-time-zone.spec.ts', '**/session-lifetime.spec.ts', '**/temp-file-retention.spec.ts'];

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
    // The specs below change GLOBAL system settings (time zone, session lifetime, temp-file retention) and a save
    // sends the whole settings payload, so two of them at once overwrite each other, and every other spec would
    // render with a time zone that moves under it. They run after the main project, one project after another.
    ...GLOBAL_SETTINGS_SPECS.map((spec, index) => ({
      name: `global-settings-${index + 1}`,
      testMatch: spec,
      dependencies: [index === 0 ? 'chromium' : `global-settings-${index}`],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    })),
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
      testIgnore: [...GLOBAL_SETTINGS_SPECS, PHONE_SPECS],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    // The app is used mostly on a phone in the shop, so the specs written for one (*.phone.spec.ts) run on two:
    // Chromium as a Pixel 7, and WebKit as an iPhone, the closest thing to Safari that runs in CI. Both tap.
    {
      name: 'phone',
      dependencies: ['setup'],
      testMatch: PHONE_SPECS,
      use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/user.json' },
    },
    {
      name: 'phone-webkit',
      dependencies: ['setup'],
      testMatch: PHONE_SPECS,
      use: { ...devices['iPhone 15'], storageState: 'e2e/.auth/user.json' },
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
