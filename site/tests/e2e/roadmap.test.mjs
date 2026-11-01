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

const REPO = "https://github.com/wouekk/cartvibe";
const issue = (n, over = {}) => ({
  number: n,
  title: `Idea ${n}`,
  body: `## Why\nSome **bold** words for idea ${n} with a [link](https://example.com).`,
  state: "open",
  labels: [{ name: "roadmap" }, { name: "bills" }],
  reactions: { "+1": n },
  html_url: `${REPO}/issues/${n}`,
  created_at: `2026-10-0${n}T00:00:00Z`,
  closed_at: null,
  ...over,
});
const ISSUES = [
  issue(1),
  issue(2),
  issue(3, { labels: [{ name: "roadmap" }, { name: "status:in-progress" }, { name: "lists" }] }),
  issue(4, { state: "closed", closed_at: "2026-10-05T00:00:00Z" }),
  issue(5, { state: "closed", closed_at: "2026-10-06T00:00:00Z", labels: [{ name: "status:shipped" }] }),
  issue(6, { pull_request: { url: "x" }, title: "A pull request" }),
  issue(7, { title: '<img src=x onerror="window.__xss=1"> Unsafe', body: "<script>window.__xss=2</script>text" }),
];

/** Answers the GitHub call with `answer` and counts it; any other third-party host is refused and recorded. */
function github(answer) {
  const state = { calls: 0, foreign: [] };
  const setup = async (context) => {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
      const url = route.request().url();
      if (!url.startsWith("https://api.github.com/repos/wouekk/cartvibe/issues?")) {
        state.foreign.push(url);
        return route.abort();
      }
      state.calls++;
      assert.equal(new URL(url).searchParams.get("labels"), "roadmap");
      assert.equal(new URL(url).searchParams.get("state"), "all");
      assert.equal(new URL(url).searchParams.get("per_page"), "30");
      await answer(route);
    });
  };
  return { state, setup };
}
const json = (body, status = 200) => (route) =>
  route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
const settled = (page) => page.locator('[data-roadmap][data-source]:not([data-source="pending"])').first().waitFor({ state: "attached" });
const titles = (page, slug) => page.getByTestId(`roadmap-column-${slug}`).getByRole("heading", { level: 4 }).allInnerTexts();

test("live issues fill the three columns by label; pull requests are skipped", async () => {
  const g = github(json(ISSUES));
  const { page, context, messages } = await open(browser, server.origin, "/", { setup: g.setup });
  await settled(page);
  assert.equal(await page.locator("[data-roadmap]").getAttribute("data-source"), "live");
  assert.deepEqual(await titles(page, "planned"), ['<img src=x onerror="window.__xss=1"> Unsafe', "Idea 2", "Idea 1"]);
  assert.deepEqual(await titles(page, "in-progress"), ["Idea 3"]);
  assert.deepEqual(await titles(page, "shipped"), ["Idea 5", "Idea 4"]);
  assert.equal(await page.getByText("A pull request").count(), 0);
  for (const [slug, n] of [["planned", "3"], ["in-progress", "1"], ["shipped", "2"]]) {
    assert.equal(await page.getByTestId(`roadmap-column-${slug}`).locator("[data-count]").innerText(), n);
  }
  assert.deepEqual(messages, []);
  assert.deepEqual(g.state.foreign, []);
  await context.close();
});

test("a card has a title, a plain two-line summary, chips without roadmap labels and an upvote pill that links out", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup });
  await settled(page);
  const card = page.getByTestId("roadmap-column-in-progress").getByTestId("roadmap-card").first();
  assert.equal(await card.getByRole("heading", { level: 4 }).innerText(), "Idea 3");
  const summary = card.locator("p");
  assert.equal(await summary.innerText(), "Why Some bold words for idea 3 with a link.");
  assert.equal(await summary.evaluate((el) => getComputedStyle(el).webkitLineClamp), "2");
  assert.deepEqual(await card.locator("ul li").allInnerTexts(), ["lists"]);
  const pill = card.getByTestId("roadmap-upvote");
  assert.equal(await pill.getAttribute("href"), `${REPO}/issues/3`);
  assert.equal(await pill.getAttribute("rel"), "noopener noreferrer");
  assert.equal(await pill.getAttribute("target"), "_blank");
  assert.equal((await pill.innerText()).trim(), "3");
  assert.match(await pill.locator("span").getAttribute("class"), /tabular-nums/);
  assert.equal(await pill.evaluate((el) => getComputedStyle(el).height), "32px");
  await context.close();
});

test("text from GitHub is drawn as text, never as markup", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup });
  await settled(page);
  assert.equal(await page.locator('[data-testid="roadmap-card"] img, [data-testid="roadmap-card"] script').count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.getByText("Unsafe").count(), 1);
  await context.close();
});

test("the answer is cached in sessionStorage for 15 minutes", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup });
  await settled(page);
  assert.equal(g.state.calls, 1);
  await page.reload();
  await settled(page);
  assert.equal(await page.locator("[data-roadmap]").getAttribute("data-source"), "cache");
  assert.equal(g.state.calls, 1);
  await page.evaluate(() => {
    const key = "cartvibe-roadmap-v1";
    const entry = JSON.parse(sessionStorage.getItem(key));
    entry.at -= 16 * 60 * 1000;
    sessionStorage.setItem(key, JSON.stringify(entry));
  });
  await page.reload();
  await settled(page);
  assert.equal(await page.locator("[data-roadmap]").getAttribute("data-source"), "live");
  assert.equal(g.state.calls, 2);
  await context.close();
});

const FAILURES = {
  "a rate limit": json({ message: "API rate limit exceeded" }, 403),
  "a server error": json({}, 500),
  "no network": (route) => route.abort(),
  "an unreadable answer": (route) => route.fulfill({ status: 200, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: "<html>" }),
  "an empty board": json([]),
};
for (const [name, answer] of Object.entries(FAILURES)) {
  test(`${name} shows the curated roadmap and nothing alarming`, async () => {
    const g = github(answer);
    const { page, context } = await open(browser, server.origin, "/", { setup: g.setup });
    await settled(page);
    assert.equal(await page.locator("[data-roadmap]").getAttribute("data-source"), "fallback");
    const planned = await titles(page, "planned");
    for (const t of ["Recurring bill reminders", "Price history across stores", "Barcode quick-add on shopping lists", "Receipt export bundles"]) {
      assert.ok(planned.includes(t), t);
    }
    assert.ok((await titles(page, "in-progress")).length > 0);
    assert.ok((await titles(page, "shipped")).length > 0);
    const text = (await page.locator("[data-roadmap]").innerText()).toLowerCase();
    for (const word of ["error", "failed", "rate limit", "offline", "unavailable", "oops"]) assert.ok(!text.includes(word), word);
    await context.close();
  });
}

test("a blocked sessionStorage does not stop the page", async () => {
  const g = github(json(ISSUES));
  const setup = async (context) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("denied", "SecurityError"); } });
    });
    await g.setup(context);
  };
  const { page, context } = await open(browser, server.origin, "/", { setup });
  await settled(page);
  assert.equal(await page.locator("[data-roadmap]").getAttribute("data-source"), "live");
  assert.equal((await titles(page, "planned")).length, 3);
  await context.close();
});

test("header: overline, title, the thumbs-up line, a primary request button and an outline board link, both 36 px", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup });
  await settled(page);
  const section = page.getByTestId("roadmap-section");
  assert.equal(await section.locator(".cv-overline").first().innerText(), "ROADMAP & FEEDBACK");
  assert.equal(await page.locator("h1").count(), 1);
  assert.match(await section.innerText(), /prioritised by thumbs-up reactions on GitHub/);
  assert.match(await section.innerText(), /loads public issues from GitHub when you open this page/);
  const request = page.getByTestId("roadmap-request");
  assert.equal(await request.innerText(), "Request a Feature");
  assert.equal(await request.getAttribute("href"), `${REPO}/issues/new?labels=enhancement,roadmap`);
  assert.equal(await request.evaluate((el) => getComputedStyle(el).height), "36px");
  const board = page.getByTestId("roadmap-board");
  assert.match(await board.innerText(), /View full board on GitHub/);
  assert.equal(await board.evaluate((el) => getComputedStyle(el).height), "36px");
  assert.notEqual(await request.evaluate((el) => getComputedStyle(el).backgroundColor), await board.evaluate((el) => getComputedStyle(el).backgroundColor));
  await context.close();
});

test("columns are labelled regions with a heading, a count and a coloured dot; three across at lg", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup, width: 1280 });
  await settled(page);
  for (const name of ["Planned", "In Progress", "Recently Shipped"]) {
    assert.equal(await page.getByRole("region", { name }).count(), 1, name);
  }
  const boxes = await Promise.all(["planned", "in-progress", "shipped"].map((s) => page.getByTestId(`roadmap-column-${s}`).boundingBox()));
  assert.ok(boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x);
  assert.ok(Math.abs(boxes[0].y - boxes[2].y) < 2);
  const dots = await page.locator('[data-testid^="roadmap-column-"] > div > span:first-child').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  assert.equal(new Set(dots).size, 3);
  await context.close();
});

test("on narrow screens the columns stack", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup, width: 800 });
  await settled(page);
  const [a, b] = await Promise.all(["planned", "in-progress"].map((s) => page.getByTestId(`roadmap-column-${s}`).boundingBox()));
  assert.ok(b.y > a.y + a.height - 1);
  await context.close();
});

test("no horizontal overflow at 360 px, day and night, Zinc plus emerald and violet, live and curated", async () => {
  for (const path of ["/"]) {
    for (const mode of ["light", "dark"]) {
      for (const palette of ["zinc", "emerald", "violet"]) {
        for (const answer of [json(ISSUES.concat([issue(8, { title: "A".repeat(80) + "Longwordwithoutspaces".repeat(6) })])), json([], 500)]) {
          const g = github(answer);
          const { page, context } = await open(browser, server.origin, path, { setup: g.setup, width: 360, height: 740, mode, palette });
          await settled(page);
          const over = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
          assert.ok(over.doc <= over.win, `${path} ${mode} ${palette}: ${over.doc} > ${over.win}`);
          await context.close();
        }
      }
    }
  }
});

test("the only request outside the site is the GitHub issues call", async () => {
  const g = github(json(ISSUES));
  const hosts = new Set();
  const setup = async (context) => {
    context.on("request", (r) => hosts.add(new URL(r.url()).host));
    await g.setup(context);
  };
  const { page, context } = await open(browser, server.origin, "/", { setup });
  await settled(page);
  assert.deepEqual([...hosts].filter((h) => !h.startsWith("127.0.0.1")), ["api.github.com"]);
  assert.deepEqual(g.state.foreign, []);
  await context.close();
});

test("the home page shows four cards per column but counts the whole column", async () => {
  const many = Array.from({ length: 9 }, (_, i) => issue(i + 1, { reactions: { "+1": i } }));
  const g = github(json(many));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup });
  await settled(page);
  assert.equal((await titles(page, "planned")).length, 4);
  assert.equal(await page.getByTestId("roadmap-column-planned").locator("[data-count]").innerText(), "9");
  assert.equal(await page.getByTestId("roadmap-section").count(), 1);
  await context.close();
});

test("the changelog is a list under the board: the latest four releases one line each, the rest behind a row", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup, width: 1280, height: 900 });
  await settled(page);
  const log = page.getByTestId("changelog-section");
  const recent = log.getByTestId("changelog-recent").getByTestId("changelog-release");
  assert.equal(await recent.count(), 4);
  for (const rel of await recent.all()) {
    assert.match(await rel.locator("h4").innerText(), /^\d+\.\d+\.\d+$/);
    assert.ok((await rel.locator("time").innerText()).length > 0);
    const line = rel.getByTestId("changelog-summary");
    assert.ok((await line.innerText()).length > 0, "every recent release has its milestone");
    // One line: the text is a single row high on a desktop screen.
    assert.ok((await line.evaluate((el) => el.getBoundingClientRect().height)) < 24);
  }
  // A list, not panels: one bordered block, rows divided by hairlines, no card per release.
  assert.equal(await log.locator("ol > li").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius), "0px");
  // It sits under the board, not beside it.
  const shipped = await page.getByTestId("roadmap-column-shipped").boundingBox();
  const box = await log.boundingBox();
  assert.ok(box.y > shipped.y + shipped.height - 1);
  // The older releases are folded away until asked for.
  const more = log.getByTestId("changelog-more");
  const older = more.getByTestId("changelog-release");
  const olderCount = await older.count();
  assert.ok(olderCount > 0);
  assert.equal(await older.first().isVisible(), false);
  await more.locator("summary").click();
  assert.equal(await older.first().isVisible(), true);
  assert.equal((await more.locator("summary").innerText()).replace(/\s+/g, " ").trim(), `Older versions (${olderCount})`);
  assert.equal(await log.getByTestId("changelog-full").getAttribute("href"), `${REPO}/blob/main/CHANGELOG.md`);
  await context.close();
});

test("on a phone a changelog row wraps instead of running off the screen", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup, width: 360, height: 740 });
  await settled(page);
  const over = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
  assert.ok(over.doc <= over.win);
  await context.close();
});

test("the roadmap is in the navigation and /roadmap/ still lands on it", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup });
  const nav = page.getByRole("navigation", { name: "Main" });
  assert.equal(await nav.getByRole("link", { name: "Roadmap" }).getAttribute("href"), "/#roadmap");
  assert.equal(await nav.getByRole("link", { name: "FAQ" }).getAttribute("href"), "/#faq");
  await page.goto(`${server.origin}/roadmap/`);
  await page.waitForURL(new RegExp(`^${server.origin}/#roadmap$`));
  assert.equal(await page.getByTestId("roadmap-section").count(), 1);
  await context.close();
});

test("scrolling marks the nav link of the section in view", async () => {
  const g = github(json(ISSUES));
  const { page, context } = await open(browser, server.origin, "/", { setup: g.setup, width: 1280, height: 900 });
  await settled(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  const current = () => nav.locator('a[aria-current="location"]').allInnerTexts();
  assert.deepEqual(await current(), [], "nothing is marked at the top");
  for (const [id, label] of [["why", "Why CartVibe"], ["roadmap", "Roadmap"], ["faq", "FAQ"], ["features", "Features"]]) {
    await page.evaluate((x) => document.getElementById(x).scrollIntoView({ block: "start" }), id);
    await page.waitForFunction(
      (l) => [...document.querySelectorAll('nav[aria-label="Main"] a[aria-current="location"]')].map((a) => a.textContent.trim()).join() === l,
      label,
    );
    assert.deepEqual(await current(), [label]);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => document.querySelectorAll('nav[aria-label="Main"] a[aria-current="location"]').length === 0);
  await context.close();
});

test("the wordmark follows the palette on the home page, and the footer is there", async () => {
  const g = github(json(ISSUES));
  for (const palette of PALETTES) {
    const { page, context } = await open(browser, server.origin, "/", { setup: g.setup, palette });
    assert.equal(await page.locator("footer").count(), 1);
    const [vibe, primary] = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--primary");
      document.body.append(probe);
      return [getComputedStyle(document.querySelector('[data-testid="wordmark-vibe"]')).color, getComputedStyle(probe).color];
    });
    if (palette === "zinc") assert.equal(vibe, "rgb(4, 120, 87)");
    else assert.equal(vibe, primary);
    await context.close();
  }
});
