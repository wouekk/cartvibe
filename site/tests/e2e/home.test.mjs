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
  assert.equal((await hero.locator("h1").innerText()).replace(/\s+/g, " "), "Your household's spending and shopping, finally in one place.");
  assert.equal(
    (await hero.locator("h1 + p").innerText()).replace(/\s+/g, " "),
    "Scan receipts at the shop, share live shopping lists, and see where the money goes. Made for your phone: run it free on your own server, or get CartVibe for iPhone, coming soon to the App Store.",
  );
  assert.equal(await page.getByText("Self-hosted · Open source · AGPL-3.0").count(), 0);
  await context.close();
});

test("the page no longer offers a hosted Cloud plan", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  assert.equal(await page.locator("#cloud").count(), 0);
  assert.doesNotMatch(await page.locator("body").innerText(), /Cloud plan|CartVibe Cloud|hosted version/i);
  await context.close();
});

test("the iPhone app is the one solid button in the header; the demo and Self-host it are quiet outlines side by side, and the hero has no buttons", async () => {
  for (const mode of ["light", "dark"]) {
    const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, width: 1280, mode });
    for (const [scope, ids] of [
      ["site-header", ["header-iphone", "header-demo", "header-selfhost"]],
    ]) {
      const bg = (id) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).backgroundColor);
      const [iphone, demo, selfHost] = await Promise.all(ids.map(bg));
      assert.notEqual(iphone, demo, `${scope} ${mode}: the iPhone app button is solid, the demo is not`);
      assert.equal(demo, selfHost, `${scope} ${mode}: demo and Self-host it look the same`);
      const [d, s] = await Promise.all(ids.slice(1).map((id) => page.getByTestId(id).boundingBox()));
      assert.ok(Math.abs(d.y - s.y) < 2 && s.x > d.x && s.x - (d.x + d.width) < 24, `${scope}: demo and Self-host it sit next to each other`);
    }
    assert.equal(await page.getByTestId("hero-cta").count(), 0);
    await context.close();
  }
});

test("the header wraps cleanly from 360 to 1280 px", async () => {
  for (const width of [360, 600, 768, 1024, 1280]) {
    const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, width, height: 800 });
    const { doc, win } = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
    assert.ok(doc <= win, `${width}: page scrolls sideways (${doc} > ${win})`);
    const header = await page.getByTestId("site-header").evaluate((el) => el.scrollWidth <= el.clientWidth);
    assert.ok(header, `${width}: the header overflows`);
    await context.close();
  }
});

test("screenshots come as srcsets, so a phone is not sent the desktop picture; the hero's visible one has high priority", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, width: 390, height: 844 });
  const hero = page.getByTestId("hero-visual").locator("img.shot-light");
  for (const img of await hero.all()) {
    assert.match((await img.getAttribute("srcset")) ?? "", /\d+w, .*\d+w/);
    assert.ok(await img.getAttribute("sizes"));
  }
  const desktop = hero.first();
  assert.equal(await desktop.getAttribute("fetchpriority"), "high");
  const shown = await page.evaluate(() => [...document.querySelectorAll('[data-testid="hero-visual"] img.shot-light')].filter((i) => i.offsetParent).map((i) => i.currentSrc));
  assert.ok(shown.length >= 1);
  await context.close();
});

test("the hero visual and the four steps are screenshots of the demo, not mock-ups", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, width: 1440 });
  assert.equal(await page.locator("[data-slot], .wireframe").count(), 0);
  const hero = page.getByTestId("hero-visual").locator("img.shot-light");
  assert.equal(await hero.count(), 2);
  for (const img of await hero.all()) {
    await img.evaluate((el) => (el.loading = "eager"));
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 200, await img.elementHandle());
  }
  // Each step has a desktop and a phone shot, by name, from the demo (src/assets/shots).
  const stage = await page.locator('[data-testid="sticky-stage"] [data-state] img.shot-light').evaluateAll((els) => els.map((e) => e.getAttribute("src")));
  assert.equal(stage.length, 8);
  for (const name of ["shopping", "receipts", "lines", "charts"]) {
    assert.equal(stage.filter((s) => s.includes(`${name}-`)).length, 2, name);
  }
  await context.close();
});

test('the "Built for everything beyond the weekly shop" block has only its heading and still has its four screenshots', async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  const heading = page.getByRole("heading", { level: 2, name: "Built for everything beyond the weekly shop", exact: true });
  assert.equal(await heading.count(), 1);
  assert.equal(await page.getByText("The rest of the app").count(), 0);
  assert.equal(await page.getByText("Screens of the running app, with demo data.").count(), 0);
  const block = page.locator("section", { has: heading });
  assert.equal(await block.locator("article").count(), 4);
  assert.ok((await block.locator("img.shot-light").count()) >= 4);
  await context.close();
});

test('the self-hosted card says "Free forever"; the iPhone card says it is coming and is a separate app', async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  const section = page.locator("#iphone");
  assert.match(await section.innerText(), /Free forever/);
  const card = page.getByTestId("iphone-card");
  assert.match(await card.innerText(), /Coming soon/);
  assert.match(await card.innerText(), /does not connect to your server/);
  assert.equal(await card.getByRole("link").getAttribute("href"), "https://github.com/wouekk/cartvibe/issues/1");
  assert.equal(await page.getByTestId("header-iphone").getAttribute("href"), "/#iphone");
  await context.close();
});

test("the background canvas is token-driven: the vignette is a static overlay (no mask anywhere), the glow has no blur, nothing is clickable", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub });
  const css = await page.evaluate(() => {
    const s = (sel) => getComputedStyle(document.querySelector(sel));
    const canvas = s(".bg-canvas");
    return {
      hidden: document.querySelector(".bg-canvas").getAttribute("aria-hidden"),
      position: canvas.position,
      z: canvas.zIndex,
      events: canvas.pointerEvents,
      parentMask: canvas.maskImage || canvas.webkitMaskImage || "none",
      gridMask: s(".bg-canvas__grid").maskImage || "none",
      overlay: getComputedStyle(document.querySelector(".bg-canvas"), "::after").backgroundImage,
      glowFilter: s(".bg-canvas__glow").filter,
      gridImage: s(".bg-canvas__grid").backgroundImage,
    };
  });
  assert.equal(css.hidden, "true");
  assert.equal(css.position, "fixed");
  assert.equal(css.z, "-1");
  assert.equal(css.events, "none");
  assert.equal(css.parentMask, "none", "a masked fixed layer is re-blended on every scroll frame in Safari");
  assert.equal(css.gridMask, "none");
  assert.match(css.overlay, /radial-gradient/);
  assert.equal(css.glowFilter, "none");
  assert.match(css.gridImage, /linear-gradient/);
  await context.close();
});

test("scrolling glides the grid (wrapping inside 48 px) and drifts the glow; reduced motion keeps both still", async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, width: 1280, height: 800 });
  const t = () => page.evaluate(() => ({ grid: document.querySelector(".bg-canvas__grid").style.transform, glow: document.querySelector(".bg-canvas__glow").style.transform }));
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForFunction(() => document.querySelector(".bg-canvas__grid").style.transform.includes("translate3d"));
  const moved = await t();
  const gy = Number(/translate3d\(0px, (-?[\d.]+)px/.exec(moved.grid)[1]);
  assert.ok(gy <= 0 && gy > -48, `grid offset ${gy} stays within one cell`);
  assert.match(moved.glow, /translate3d/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo(0, 1300));
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".bg-canvas__grid")).transform === "none");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".bg-canvas__glow")).transform), "none");
  await context.close();
});

test("the page keeps one background shade: no section paints its own or draws a divider, day and night", async () => {
  for (const mode of ["light", "dark"]) {
    const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, mode });
    const backgrounds = await page.locator("main > section").evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).backgroundColor))]);
    assert.deepEqual(backgrounds, ["rgba(0, 0, 0, 0)"], mode);
    const dividers = await page.locator("main > section").evaluateAll((els) =>
      els.filter((e) => parseFloat(getComputedStyle(e).borderTopWidth) > 0 || parseFloat(getComputedStyle(e).borderBottomWidth) > 0).length,
    );
    assert.equal(dividers, 0, `${mode}: a section draws a divider line`);
    await context.close();
  }
});

test('the header says "Demo", and the GitHub link carries the GitHub icon', async () => {
  const { page, context } = await open(browser, server.origin, "/", { setup: noGithub, width: 1440 });
  assert.equal((await page.getByTestId("header-demo").innerText()).trim(), "Demo");
  const github = page.getByTestId("nav-github");
  assert.equal((await github.innerText()).trim(), "GitHub");
  assert.equal(await github.locator("svg").count(), 1);
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
