import { defineConfig, devices } from '@playwright/test';

// The built demo (`npm run build:demo`) served as static files under /demo/, like GitHub Pages. It needs no API,
// no login and no accounts, so it has its own config and folder (`e2e-demo/`): `npm run e2e:demo`.
// E2E_CHROMIUM_PATH points at a browser that is already installed (the cloud sandbox ships one; see docs/sandbox.md).
const port = Number(process.env.DEMO_PORT ?? 4300);

export default defineConfig({
  testDir: './e2e-demo',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-demo' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tools/serve-demo.cjs',
    url: `http://localhost:${port}/demo/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { DEMO_PORT: String(port) },
  },
});
