import { expect, Page, test } from '@playwright/test';

// The built demo (see docs/demo.md): no API, no login. Every test starts on the dashboard of the signed-in sample user.
const START = '/demo/';

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

  await expect(page).toHaveURL(/:\d+\/demo\/#\/overview\/group\/1$/);
  await expect(page.getByText('Demo, nothing is saved')).toBeVisible();
  await expect(page.getByText('Alex Demo').first()).toBeVisible();
  await expect(page.getByTestId('overview-donut')).toBeVisible();
});

test('sends nothing outside its own origin, and registers no service worker or manifest', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return;
    }
    // Only the demo's own files: nothing from the site root, another site of the origin, or another host.
    const parsed = new URL(url);
    if (parsed.hostname !== 'localhost' || !parsed.pathname.startsWith('/demo/')) {
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
  expect(keys).toContain('cartvibe-demo:cartvibe.themeMode');
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
  // Reset reloads at the start address, so the page leaves the shopping list and the hash is gone.
  await expect(page.getByTestId('overview-quick-scan')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/overview/group/1');
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

test('every page ends with the two-line footer of the project site', async ({ page }) => {
  await openDemo(page);

  for (const hash of ['/overview/group/1', '/receipts/group/1', '/shopping-lists/group/1', '/reports', '/warranties/group/1']) {
    await goTo(page, hash);
    await page.waitForLoadState('networkidle');
    const footer = page.getByTestId('demo-footer');
    await expect(footer, hash).toBeVisible();
    await expect(footer.locator('p')).toHaveText([
      /^\s*Free software under the GNU AGPL-3\.0 · Upstream credits in\s+NOTICE\s*$/,
      'This site sets no cookies and runs no analytics or third-party scripts.',
    ]);
    await expect(page.getByTestId('demo-footer-notice')).toHaveAttribute('href', 'https://github.com/wouekk/cartvibe/blob/main/NOTICE.md');
  }
  await expect(page.getByTestId('demo-footer')).toHaveCount(1);
});

test('the footer fits a 360px phone and sits below the page content', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openDemo(page);
  await goTo(page, '/receipts/group/1');
  await page.waitForLoadState('networkidle');

  const footer = page.getByTestId('demo-footer');
  await footer.scrollIntoViewIfNeeded();
  const box = (await footer.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const outlet = (await page.locator('router-outlet + *').first().boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(outlet.y);
});

test('the About licence links stay inside the demo', async ({ page }) => {
  await openDemo(page);
  await page.getByTestId('sidebar-avatar-menu').click();
  await page.getByTestId('sidebar-about').click();

  const links = page.getByTestId('about-credits-licences').locator('a');
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((anchors) => anchors.map((a) => (a as HTMLAnchorElement).pathname));
  expect(hrefs).toEqual(['/demo/3rdpartylicenses.txt', '/demo/assets/licenses/NOTICES.txt']);
});

for (const viewport of [{ width: 390, height: 700 }, { width: 1280, height: 700 }]) {
  test(`the shopping list's add row pins below the header, not over it (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDemo(page);
    await goTo(page, '/shopping-lists/group/1');
    const addRow = page.locator('.add-bar').first();
    await expect(addRow).toBeVisible();

    // Add enough items for the page to scroll, then scroll down (the row pins only while its list is in view).
    for (let i = 0; i < 25; i++) {
      await page.locator('#shopping-list-add-name-input').fill(`Scroll filler ${i}`);
      await page.getByTestId('shopping-list-add-submit').click();
    }
    await page.evaluate(() => window.scrollTo(0, 400));

    const header = (await page.locator('#header-container').boundingBox())!;
    const row = (await addRow.boundingBox())!;
    expect(row.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    // The header stays the topmost thing at its own position.
    const topmost = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('#header-container'),
      [viewport.width / 2, header.y + header.height / 2],
    );
    expect(topmost).toBe(true);
  });
}
