// Search and sharing (docs/site.md): the home page's title, description, social tags and JSON-LD, robots.txt and the sitemap.
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
const meta = (page, attr, name) => page.locator(`meta[${attr}="${name}"]`).getAttribute("content");
const REPO = "https://github.com/wouekk/cartvibe";

test("the home page has the agreed title, description, canonical and social tags", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  assert.equal(await page.title(), "CartVibe — Household Receipts, Shared Shopping Lists & Spending Insights");
  assert.equal(
    await meta(page, "name", "description"),
    "Self-hosted and open-source (AGPL-3.0) app for household receipts, AI receipt OCR, shared shopping lists, warranty tracking, and spending insights. CartVibe for iPhone coming soon.",
  );
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://cartvibe.app/");
  assert.match(await meta(page, "name", "robots"), /^index, follow/);
  assert.equal(await meta(page, "property", "og:site_name"), "CartVibe");
  assert.equal(await meta(page, "name", "twitter:card"), "summary_large_image");
  const image = await meta(page, "property", "og:image");
  assert.equal(await meta(page, "name", "twitter:image"), image);
  const url = new URL(image);
  assert.equal(url.origin, "https://cartvibe.app");
  const res = await fetch(`${server.origin}${url.pathname}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  await context.close();
});

test("the JSON-LD links the site and the repository, and its FAQ matches the questions on the page", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  assert.equal(blocks.length, 1);
  const graph = JSON.parse(blocks[0])["@graph"];
  const byType = Object.fromEntries(graph.map((n) => [n["@type"], n]));
  assert.deepEqual(Object.keys(byType).sort(), ["FAQPage", "Organization", "SoftwareApplication", "SoftwareSourceCode", "WebSite"]);

  assert.deepEqual(byType.Organization.sameAs, [REPO]);
  assert.equal(byType.Organization.url, "https://cartvibe.app/");
  const app = byType.SoftwareApplication;
  const source = byType.SoftwareSourceCode;
  assert.equal(app.applicationCategory, "FinanceApplication");
  assert.equal(app.license, "https://www.gnu.org/licenses/agpl-3.0.html");
  assert.equal(app.offers.price, "0");
  assert.equal(app.isBasedOn["@id"], source["@id"]);
  assert.equal(source.targetProduct["@id"], app["@id"]);
  assert.equal(source.codeRepository, REPO);

  const visible = (await page.locator("#faq summary").allInnerTexts()).map((q) => q.trim());
  assert.deepEqual(
    byType.FAQPage.mainEntity.map((q) => q.name),
    visible,
  );
  await context.close();
});

test("robots.txt allows everything and names the sitemap, which lists the indexable pages", async () => {
  const robots = await (await fetch(`${server.origin}/robots.txt`)).text();
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /Disallow/);
  assert.match(robots, /^Sitemap: https:\/\/cartvibe\.app\/sitemap\.xml$/m);

  const sitemap = await (await fetch(`${server.origin}/sitemap.xml`)).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ["https://cartvibe.app/", "https://cartvibe.app/privacy/", "https://cartvibe.app/support/"]);
  for (const loc of locs) {
    const res = await fetch(`${server.origin}${new URL(loc).pathname}`);
    assert.equal(res.status, 200, loc);
    assert.doesNotMatch(await res.text(), /noindex/, loc);
  }
});

test("the palette menu lists Zinc first", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  const keys = await page.locator("[data-palette-option]").evaluateAll((els) => els.map((e) => e.dataset.paletteOption));
  assert.deepEqual(keys, ["zinc", "blue", "indigo", "emerald", "violet"]);
  await context.close();
});
