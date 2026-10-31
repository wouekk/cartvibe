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

// Every page of the site; the demo carries the same two lines from the app (desktop/e2e-demo).
const PAGES = ["/"];

for (const path of PAGES) {
  test(`${path} ends with the one shared footer, two lines and nothing more`, async () => {
    const { page, context } = await open(browser, server.origin, path);
    assert.equal(await page.locator("footer").count(), 1);
    const footer = page.getByTestId("site-footer");
    assert.equal(
      (await footer.innerText()).replace(/\s+/g, " ").trim(),
      "Free software under the GNU AGPL-3.0 · Upstream credits in NOTICE This site sets no cookies and runs no analytics or third-party scripts.",
    );
    assert.equal(await page.getByTestId("footer-notice").getAttribute("href"), "https://github.com/wouekk/cartvibe/blob/main/NOTICE.md");
    assert.equal(await footer.locator("a").count(), 2);
    assert.equal(await footer.locator("p").count(), 2);
    // It is the last thing on the page: only scripts may follow it.
    assert.equal(await page.evaluate(() => [...document.querySelector("footer").parentElement.children].filter((e) => e.tagName !== "SCRIPT").slice(-1)[0].tagName), "FOOTER");
    await context.close();
  });
}

test("the footer fits a 360 px phone without sideways scroll", async () => {
  const { page, context } = await open(browser, server.origin, "/", { width: 360, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await context.close();
});
