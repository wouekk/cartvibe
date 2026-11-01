import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PALETTES, launch, open, serve } from "./helpers.mjs";

let server, browser;
before(async () => {
  server = await serve();
  browser = await launch();
});
after(async () => {
  await browser.close();
  server.close();
});

// The App Store asks for a privacy policy URL and a support URL with a way to reach us; both are pages of this site.
test("the privacy page covers the site, the demo, self-hosting and the iPhone app, with a contact address", async () => {
  const { page, context, messages } = await open(browser, server.origin, "/privacy/");
  assert.equal(await page.locator("h1").innerText(), "Privacy policy");
  assert.match(await page.getByTestId("doc-updated").innerText(), /^Effective \d{1,2} \w+ 20\d\d$/);
  const headings = await page.locator(".doc h2").allInnerTexts();
  for (const h of ["This website", "The demo", "CartVibe you host yourself", "CartVibe for iPhone", "Your rights", "Contact"]) {
    assert.ok(headings.includes(h), `missing section ${h}`);
  }
  assert.ok((await page.locator('a[href="mailto:support@cartvibe.app"]').count()) >= 1);
  assert.equal(await page.title(), "Privacy · CartVibe");
  assert.deepEqual(messages, []);
  await context.close();
});

test("the support page gives an email for the iPhone app and GitHub issues for self-hosting", async () => {
  const { page, context, messages } = await open(browser, server.origin, "/support/");
  assert.equal(await page.locator("h1").innerText(), "Getting help");
  assert.equal(await page.getByTestId("support-email").getAttribute("href"), "mailto:support@cartvibe.app");
  assert.ok((await page.locator('a[href="https://github.com/wouekk/cartvibe/issues"]').count()) === 1);
  assert.match(await page.locator('a[href="/privacy/"]').first().innerText(), /privacy page/);
  assert.deepEqual(messages, []);
  await context.close();
});

test("the text pages fit a 360 px phone in every palette, day and night", async () => {
  for (const path of ["/privacy/", "/support/"]) {
    for (const palette of PALETTES) {
      for (const mode of ["light", "dark"]) {
        const { page, context } = await open(browser, server.origin, path, { width: 360, height: 740, palette, mode });
        const { doc, win } = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
        assert.ok(doc <= win, `${path} ${palette} ${mode}: ${doc} > ${win}`);
        await context.close();
      }
    }
  }
});
