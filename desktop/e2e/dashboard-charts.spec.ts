import { expect, type Locator, type Page, test } from '@playwright/test';
import { stubTokenRefresh } from './helpers/auth';

// The Dashboard's category donut and month bars (Chart.js on a canvas).
//
// The overview response is mocked, so the specs need no seeded data and no
// AI; what they prove is the drawn chart: token colours, the legend <-> ring
// emphasis, our own tooltip card, a theme switch without a reload, reduced
// motion and the 360px phone. A canvas has no DOM to dump, so state is read
// from `data-active-index` on the chart host and from the canvas pixels.

const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const TOTALS = [610, 720, 935, 680, 760, 890, 1005, 830, 1330, 960, 1190, 1233.4];

const OVERVIEW = {
  month: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  previousFrom: '2026-09-01',
  previousTo: '2026-09-30',
  total: '1233.40',
  previousTotal: '1190.00',
  receiptCount: 18,
  previousReceiptCount: 20,
  openReceiptCount: 1,
  warrantyCount: 0,
  unhealthyTotal: '120.00',
  previousUnhealthyTotal: '90.00',
  unplannedTotal: '210.00',
  previousUnplannedTotal: '150.00',
  categories: [
    { categoryId: 1, name: 'Fruit & vegetables', total: '412.30' },
    { categoryId: 2, name: 'Dairy & eggs', total: '268.10' },
    { categoryId: 3, name: 'Meat, fish & poultry', total: '231.55' },
    { categoryId: 4, name: 'Bakery', total: '142.80' },
    { categoryId: 5, name: 'Household', total: '97.40' },
    { categoryId: 6, name: 'Drinks', total: '61.25' },
    { categoryId: 7, name: 'Snacks', total: '20.00' },
  ],
  tags: [],
  months: [],
  trend: MONTHS.map((month, index) => ({ month, total: String(TOTALS[index]) })),
  trendUnit: 'MONTH',
};

// Where the first slices sit on the ring, as shares of the circle from the top (clockwise).
const SHARES = [0, 0.334, 0.551];

async function openDashboard(page: Page) {
  await stubTokenRefresh(page);
  await page.route(/\/api\/overview\/group\/\d+(\?.*)?$/, (route) => route.fulfill({ json: OVERVIEW }));
  // Record what is drawn on canvases, to assert the centre text and the axes.
  await page.addInitScript(() => {
    const texts: string[] = [];
    (window as unknown as { __texts: string[] }).__texts = texts;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text: string, ...rest: [number, number, number?]) {
      texts.push(String(text));
      return original.call(this, text, ...rest);
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('overview-donut').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('overview-bars').locator('canvas')).toBeVisible();
  await page.mouse.move(1, 1);
}

const drawnTexts = (page: Page) => page.evaluate(() => (window as unknown as { __texts: string[] }).__texts);

/** The RGBA of one canvas pixel at page coordinates. */
const pixel = (canvas: Locator, x: number, y: number) =>
  canvas.evaluate(
    (element, [px, py]) => {
      const canvasElement = element as HTMLCanvasElement;
      const rect = canvasElement.getBoundingClientRect();
      const scale = canvasElement.width / rect.width;
      const data = canvasElement.getContext('2d')!.getImageData(Math.round((px - rect.left) * scale), Math.round((py - rect.top) * scale), 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    },
    [x, y],
  );

/** A theme token as the rgb a canvas draws it in. */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  }, token);

const sameColor = (a: number[], b: number[], tolerance = 6) => a.slice(0, 3).every((value, index) => Math.abs(value - b[index]) <= tolerance);

/** The centre of a slice, from the host's box. */
async function slicePoint(donut: Locator, from: number, to: number, radius = 83) {
  await donut.scrollIntoViewIfNeeded();
  const box = (await donut.boundingBox())!;
  const angle = (((from + to) / 2) * 360 * Math.PI) / 180;
  return { x: box.x + box.width / 2 + radius * Math.sin(angle), y: box.y + box.height / 2 - radius * Math.cos(angle) };
}

test.describe('dashboard charts', () => {
  test('the donut is drawn in the theme colours, with the period total in the middle', async ({ page }) => {
    await openDashboard(page);
    const donut = page.getByTestId('overview-donut');
    const slice0 = await slicePoint(donut, SHARES[0], SHARES[1]);

    const chart1 = await tokenColor(page, '--chart-1');
    await expect.poll(async () => sameColor(await pixel(donut.locator('canvas'), slice0.x, slice0.y), chart1)).toBe(true);
    await expect(donut).not.toHaveAttribute('data-active-index', /.*/);
    expect(await drawnTexts(page)).toEqual(expect.arrayContaining([expect.stringContaining('1.233,40'), 'October 2026']));
  });

  test('hovering a legend row emphasises its slice, fades the others and names it in the middle', async ({ page }) => {
    await openDashboard(page);
    const donut = page.getByTestId('overview-donut');
    const slice0 = await slicePoint(donut, SHARES[0], SHARES[1]);

    await page.getByTestId('overview-donut-row-Dairy & eggs').hover();
    await expect(donut).toHaveAttribute('data-active-index', '1');
    await expect.poll(async () => (await pixel(donut.locator('canvas'), slice0.x, slice0.y))[3]).toBeLessThan(255);
    await expect.poll(async () => (await drawnTexts(page)).slice(-4)).toContain('Dairy & eggs');

    await page.mouse.move(1, 1);
    await expect(donut).not.toHaveAttribute('data-active-index', /.*/);
  });

  test('hovering a slice shows our tooltip card, and a click focuses it for good', async ({ page }) => {
    await openDashboard(page);
    const donut = page.getByTestId('overview-donut');
    const slice0 = await slicePoint(donut, SHARES[0], SHARES[1]);
    const slice1 = await slicePoint(donut, SHARES[1], SHARES[2]);

    await page.mouse.move(slice0.x, slice0.y);
    await expect(donut).toHaveAttribute('data-active-index', '0');
    await expect(page.getByTestId('overview-donut-row-Bakery')).toHaveAttribute('data-dimmed', 'true');
    const tooltip = page.locator('.cv-chart-tooltip[data-visible=true]');
    await expect(tooltip).toContainText('Fruit & vegetables');
    await expect(tooltip).toContainText('33.4%');

    await page.mouse.click(slice1.x, slice1.y);
    await expect(page.getByTestId('overview-donut-focus-Dairy & eggs')).toHaveAttribute('aria-pressed', 'true');
    // The focused slice stays emphasised after the pointer left the ring.
    await page.mouse.move(1, 1);
    await expect(donut).toHaveAttribute('data-active-index', '1');

    await page.getByTestId('overview-donut-focus-Dairy & eggs').click();
    await page.mouse.move(1, 1);
    await expect(donut).not.toHaveAttribute('data-active-index', /.*/);
  });

  test('the bars label every month and show the month card on hover', async ({ page }) => {
    await openDashboard(page);
    const bars = page.getByTestId('overview-bars');
    await bars.scrollIntoViewIfNeeded();
    const box = (await bars.boundingBox())!;

    await page.mouse.move(box.x + 70 + ((box.width - 70) * 8.5) / 12, box.y + box.height * 0.8);
    await expect(page.locator('.cv-chart-tooltip[data-visible=true]')).toContainText('July 2026');
    expect(await drawnTexts(page)).toEqual(expect.arrayContaining(['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']));
  });

  test('a theme and palette switch recolours the chart in place, without a reload', async ({ page }) => {
    await openDashboard(page);
    const donut = page.getByTestId('overview-donut');
    const slice0 = await slicePoint(donut, SHARES[0], SHARES[1]);
    await donut.locator('canvas').evaluate((element) => ((window as unknown as { __canvas: Element }).__canvas = element));
    const light = await tokenColor(page, '--chart-1');

    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-palette', 'indigo');
    });
    const dark = await tokenColor(page, '--chart-1');
    expect(sameColor(light, dark, 3)).toBe(false);

    await expect.poll(async () => sameColor(await pixel(donut.locator('canvas'), slice0.x, slice0.y), dark)).toBe(true);
    expect(
      await donut.locator('canvas').evaluate((element) => (window as unknown as { __canvas: Element }).__canvas === element),
    ).toBe(true);
  });

  test('with reduced motion the donut is drawn at once and a hover lands in one step', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    await openDashboard(page);
    const canvas = page.getByTestId('overview-donut').locator('canvas');

    const frames = await canvas.evaluate(async (element) => {
      const lengths: number[] = [];
      // Wait for the first drawn frame (a blank canvas encodes to a couple of kB).
      while ((element as HTMLCanvasElement).toDataURL().length < 5000) await new Promise((resolve) => setTimeout(resolve, 10));
      for (let i = 0; i < 6; i++) {
        lengths.push((element as HTMLCanvasElement).toDataURL().length);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return lengths;
    });
    expect(new Set(frames).size).toBe(1);

    await page.getByTestId('overview-donut-row-Bakery').hover();
    const hover = await canvas.evaluate(async (element) => {
      const lengths: number[] = [];
      for (let i = 0; i < 8; i++) {
        lengths.push((element as HTMLCanvasElement).toDataURL().length);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return lengths;
    });
    expect(new Set(hover).size).toBeLessThanOrEqual(2);
    await context.close();
  });
});

test.describe('dashboard charts on a 360px phone', () => {
  test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

  test('fits the screen and a tap on a slice shows the card inside it', async ({ page }) => {
    await openDashboard(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    const donut = page.getByTestId('overview-donut');
    await donut.scrollIntoViewIfNeeded();
    const slice0 = await slicePoint(donut, SHARES[0], SHARES[1]);
    // Chromium's emulated mouse can send a stray mouse-out right after a tap, so record what was seen.
    await page.evaluate(() => {
      const seen = { active: false, tip: null as { x: number; width: number; text: string } | null };
      (window as unknown as { __seen: typeof seen }).__seen = seen;
      new MutationObserver(() => {
        if (document.querySelector('[data-testid=overview-donut]')!.getAttribute('data-active-index') === '0') seen.active = true;
        const tip = document.querySelector<HTMLElement>('.cv-chart-tooltip');
        if (tip?.dataset['visible'] === 'true') {
          const rect = tip.getBoundingClientRect();
          seen.tip = { x: rect.x, width: rect.width, text: tip.innerText };
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-visible', 'data-active-index'] });
    });
    await page.touchscreen.tap(slice0.x, slice0.y);

    await expect.poll(() => page.evaluate(() => (window as unknown as { __seen: { active: boolean } }).__seen.active)).toBe(true);
    const tip = await page.evaluate(() => (window as unknown as { __seen: { tip: { x: number; width: number; text: string } } }).__seen.tip);
    expect(tip.text).toContain('Fruit & vegetables');
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(360);
  });
});
