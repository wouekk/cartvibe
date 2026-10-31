import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch, open, serve } from "./helpers.mjs";

let server, browser;
before(async () => {
  server = await serve();
  browser = await launch();
});
after(async () => {
  await browser.close();
  server.close();
});

const noGithub = (context) => context.route(/^https:\/\/api\.github\.com/, (route) => route.abort());

test("the hero says what it should and the old overline is gone", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  const hero = page.getByTestId("hero");
  assert.equal((await hero.locator("h1").innerText()).replace(/\s+/g, " "), "Your household's spending tracking, on your own server.");
  assert.equal(
    (await hero.locator("h1 + p").innerText()).replace(/\s+/g, " "),
    "Scan receipts, share live shopping lists and see where the money goes. Made for a phone.",
  );
  assert.equal(await page.getByText("Self-hosted · Open source · AGPL-3.0").count(), 0);
  await context.close();
});

test("the hero visual and the four steps are screenshots of the demo, not mock-ups", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, width: 1440 });
  assert.equal(await page.locator("[data-slot], .wireframe").count(), 0);
  const hero = page.getByTestId("hero-visual").locator("img.shot-light");
  assert.equal(await hero.count(), 2);
  for (const img of await hero.all()) {
    await img.evaluate((el) => (el.loading = "eager"));
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 400, await img.elementHandle());
  }
  // Each step has a desktop and a phone shot, by name, from the demo (src/assets/shots).
  const stage = await page.locator('[data-testid="sticky-stage"] [data-state] img.shot-light').evaluateAll((els) => els.map((e) => e.getAttribute("src")));
  assert.equal(stage.length, 8);
  for (const name of ["shopping", "receipts", "lines", "charts"]) {
    assert.equal(stage.filter((s) => s.includes(`${name}-`)).length, 2, name);
  }
  await context.close();
});

test('the "And more" block has only its heading and still has its four screenshots', async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  const heading = page.getByRole("heading", { level: 2, name: "And more", exact: true });
  assert.equal(await heading.count(), 1);
  assert.equal(await page.getByText("The rest of the app").count(), 0);
  assert.equal(await page.getByText("Screens of the running app, with demo data.").count(), 0);
  const block = page.locator("section", { has: heading });
  assert.equal(await block.locator("article").count(), 4);
  assert.ok((await block.locator("img.shot-light").count()) >= 4);
  await context.close();
});

test("no horizontal overflow at 360 px in every palette, day and night", async () => {
  for (const palette of ["zinc", "blue", "indigo", "emerald", "violet"]) {
    for (const mode of ["light", "dark"]) {
      const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, width: 360, height: 740, palette, mode });
      const { doc, win } = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
      assert.ok(doc <= win, `${palette} ${mode}: ${doc} > ${win}`);
      await context.close();
    }
  }
});
