import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch, open, PALETTES, serve } from "./helpers.mjs";

let server, browser;
before(async () => {
  server = await serve();
  browser = await launch();
});
after(async () => {
  await browser.close();
  server.close();
});

const colour = (page, selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).color);
// What the browser makes of a CSS colour, so oklch() tokens and hex compare as the same rgb string.
const resolved = (page, css) =>
  page.evaluate((c) => {
    const probe = document.createElement("span");
    probe.style.color = c;
    document.body.append(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  }, css);

for (const mode of ["light", "dark"]) {
  test(`Zinc shows "Vibe" in the brand emerald, not blue (${mode})`, async () => {
    const { page, context } = await open(browser, server.origin, "/", { palette: "zinc", mode });
    const emerald = await resolved(page, "#16c976");
    assert.equal(await colour(page, '[data-testid="site-header"] [data-testid="wordmark-vibe"]'), emerald);
    assert.equal(await colour(page, "footer [data-testid=wordmark-vibe]"), emerald);
    await context.close();
  });

  for (const palette of PALETTES.filter((p) => p !== "zinc")) {
    test(`${palette} shows "Vibe" in its own accent (${mode})`, async () => {
      const { page, context } = await open(browser, server.origin, "/", { palette, mode });
      const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
      const accent = await resolved(page, primary);
      assert.equal(await colour(page, '[data-testid="site-header"] [data-testid="wordmark-vibe"]'), accent);
      assert.equal(await colour(page, "footer [data-testid=wordmark-vibe]"), accent);
      const blue = await resolved(page, mode === "dark" ? "#60a5fa" : "#2563eb");
      if (palette !== "blue") assert.notEqual(accent, blue);
      await context.close();
    });
  }
}

test('"Cart" keeps the logo text colour in every palette', async () => {
  const seen = new Set();
  for (const palette of PALETTES) {
    const { page, context } = await open(browser, server.origin, "/", { palette });
    seen.add(await colour(page, '[data-testid="site-header"] [data-testid="wordmark"]'));
    await context.close();
  }
  assert.equal(seen.size, 1);
});
