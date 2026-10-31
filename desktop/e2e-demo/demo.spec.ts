import { expect, Page, test } from '@playwright/test';

// The built demo (see docs/demo.md): no API, no login. Every test starts on the dashboard of the signed-in sample user.
const START = '/cartvibe/demo/';

// A 1x1 PNG: the scripted scan never reads the picture, it only needs a file to send.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function openDemo(page: Page): Promise<void> {
  await page.goto(START);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('overview-quick-scan')).toBeVisible();
}

async function goTo(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => (window.location.hash = target), hash);
}

test('opens signed in on the dashboard, with the banner and no login', async ({ page }) => {
  await openDemo(page);

  await expect(page).toHaveURL(/\/cartvibe\/demo\/#\/overview\/group\/1$/);
  await expect(page.getByText('Demo, nothing is saved')).toBeVisible();
  await expect(page.getByText('Alex Demo').first()).toBeVisible();
  await expect(page.getByTestId('overview-donut')).toBeVisible();
});

test('sends nothing outside its own origin, and registers no service worker or manifest', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://localhost') && !url.startsWith('blob:') && !url.startsWith('data:')) {
      outside.push(url);
    }
  });

  await openDemo(page);
  for (const hash of ['/receipts/group/1', '/shopping-lists/group/1', '/reports', '/warranties/group/1', '/receipts/1/view']) {
    await goTo(page, hash);
    await page.waitForLoadState('networkidle');
  }

  expect(outside).toEqual([]);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
});

test('keeps its own storage keys under the demo prefix', async ({ page }) => {
  await openDemo(page);
  await page.getByTestId('theme-toggle').click();

  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.every((key) => key.startsWith('cartvibe-demo:'))).toBe(true);
  expect(keys).toContain('cartvibe-demo:rw_theme_mode');
});

test('an unhealthy tile opens the lines behind it', async ({ page }) => {
  await openDemo(page);

  await page.getByText('Unhealthy', { exact: true }).first().click();

  await expect(page.getByTestId('overview-detail-products')).toBeVisible();
  await expect(page.getByTestId('overview-detail-products')).toContainText('Cola 2 l');
});

test('shows a receipt with its product lines and a drawn picture', async ({ page }) => {
  await openDemo(page);
  await goTo(page, '/receipts/1/view');

  await expect(page.getByRole('heading', { name: 'Weekly shop' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Shop' })).toHaveValue('Greenfield Market');
  await expect(page.getByRole('row', { name: /Chicken breast/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Receipt image' })).toBeVisible();
});

test('a Quick Scan on a sample picture saves the scripted receipt', async ({ page }) => {
  await openDemo(page);

  await page.getByTestId('overview-quick-scan').click();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PIXEL });
  await page.getByRole('button', { name: 'Submit Scans' }).click();

  await goTo(page, '/receipts/group/1');
  await expect(page.getByText('Corner Bakery')).toBeVisible();
});

test('a change lives in memory and Reset takes it back', async ({ page }) => {
  await openDemo(page);
  await goTo(page, '/shopping-lists/group/1');

  const name = 'Sparkling cider';
  await page.locator('#shopping-list-add-name-input').fill(name);
  await page.getByTestId('shopping-list-add-submit').click();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByTestId('demo-reset').click();
  await expect(page.getByTestId('overview-quick-scan')).toBeVisible();
  await goTo(page, '/shopping-lists/group/1');
  await expect(page.getByText('Party on Saturday').first()).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
});

test('a report previews and downloads from the sample receipts', async ({ page }) => {
  await openDemo(page);
  await goTo(page, '/reports');
  await expect(page.getByText('Spending by shop').first()).toBeVisible();

  // The builder previews the template in a sandboxed frame, from the sample receipts.
  await goTo(page, '/reports/2/edit');
  const preview = page.frameLocator('iframe');
  await expect(preview.getByText('Greenfield Market')).toBeVisible();
  await expect(preview.getByRole('cell', { name: 'Total' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate Report' }).click();
  expect((await download).suggestedFilename()).toBe('Spending_by_shop.pdf');
});

for (const width of [360, 1280]) {
  test(`has no sideways page scroll at ${width}px, in day and night`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openDemo(page);

    for (const hash of ['/overview/group/1', '/receipts/group/1', '/shopping-lists/group/1']) {
      await goTo(page, hash);
      await page.waitForLoadState('networkidle');
      for (const dark of [false, true]) {
        await page.evaluate((night) => document.documentElement.classList.toggle('dark', night), dark);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${hash} dark=${dark}`).toBeLessThanOrEqual(0);
      }
    }
  });
}
