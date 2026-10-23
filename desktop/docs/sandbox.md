# Running the desktop in the Claude Code cloud sandbox

Purpose: boot the app, drive it with Playwright and run the e2e suite inside the ephemeral web/cloud sandbox. Repeat
each session. The backend side is in `api/CLAUDE.md`; the Windows local stack is in `../../docs/dev-setup.md`.

## Boot

1. Start the Go API first. `npm start` only proxies `/api` to `localhost:8081` (`proxy.conf.json`); it never starts
   the API.
2. `npm install` (or `npm ci`). If the sandbox's npm rewrites `package-lock.json` (it has stripped the `"libc"` hints
   of optional platform packages before), that is metadata drift only: `git restore desktop/package-lock.json`.
3. `npm start` serves `0.0.0.0:4200`. The first compile takes 30-60 s; it is ready when the log prints
   `Local: http://localhost:4200/`. Check the proxy with `curl localhost:4200/api/featureConfig` (200).
4. Log in as `admin` / `admin` (the API's auto-created admin). Login lands on `/overview/group/<id>`.

## Playwright against the pre-installed browser

`@playwright/test` is pinned (see `package.json`) and expects a specific Chromium build, while the sandbox image ships
a different build under `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`). `npm run e2e:install` is blocked there; do not
run it.

Ad-hoc scripts launch the installed binary by path:

```js
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.goto('http://localhost:4200/auth/login');
await page.getByLabel('Username').fill('admin');
await page.getByLabel('Password').fill('admin');
await page.getByRole('button', { name: 'Login' }).click();
await page.waitForURL(/\/overview\/group\/\d+/);
```

A script kept outside `desktop/` needs `NODE_PATH=<repo>/desktop/node_modules` so `require('@playwright/test')`
resolves.

## The whole suite: bridge the build numbers

`playwright.config.ts` has no `launchOptions` hook, so `npx playwright test` resolves the paths of the build it
expects. Symlink those to the installed build (outside the repo). Read both numbers first: the installed one from
`ls -d /opt/pw-browsers/chromium*`, the wanted one from the error Playwright prints.

```bash
SRC=<installed build>; WANT=<build Playwright asks for>
ln -sfn /opt/pw-browsers/chromium-$SRC /opt/pw-browsers/chromium-$WANT
mkdir -p /opt/pw-browsers/chromium_headless_shell-$WANT
ln -sfn /opt/pw-browsers/chromium_headless_shell-$SRC/chrome-linux \
        /opt/pw-browsers/chromium_headless_shell-$WANT/chrome-headless-shell-linux64
ln -sfn headless_shell /opt/pw-browsers/chromium_headless_shell-$SRC/chrome-linux/chrome-headless-shell
touch /opt/pw-browsers/chromium_headless_shell-$WANT/{INSTALLATION_COMPLETE,DEPENDENCIES_VALIDATED}
```

`devices['Desktop Chrome']` runs headless, so the headless-shell path is the one that fails first; linking only
`chromium-$WANT` is not enough. Then export the `E2E_*` credentials (see `e2e.md`) and run `npx playwright test`. Leaving
`E2E_BASE_URL` at `http://localhost:4200` keeps the config's `webServer` block, which reuses a running `ng serve`.
