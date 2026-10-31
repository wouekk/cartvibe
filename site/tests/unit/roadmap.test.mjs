import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CACHE_KEY,
  CACHE_MS,
  FALLBACK_ROADMAP,
  ISSUES_API,
  loadRoadmap,
  mapIssues,
  normalise,
  readCache,
  stripMarkdown,
  writeCache,
} from "../../src/lib/roadmap.mjs";

const issue = (over) => ({
  title: "T",
  body: "B",
  state: "open",
  labels: [{ name: "roadmap" }],
  reactions: { "+1": 0 },
  html_url: "https://github.com/wouekk/cartvibe/issues/1",
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), data };
};

test("pull requests are skipped, other items kept", () => {
  const out = normalise([issue({ title: "keep" }), issue({ title: "pr", pull_request: { url: "x" } }), null, { nope: 1 }]);
  assert.deepEqual(out.map((i) => i.title), ["keep"]);
});

test("closed roadmap or shipped goes to shipped, open in-progress to in progress, other open roadmap to planned", () => {
  const c = mapIssues(
    normalise([
      issue({ title: "a", state: "closed", closed_at: "2026-10-02T00:00:00Z" }),
      issue({ title: "b", state: "closed", labels: [{ name: "status:shipped" }], closed_at: "2026-10-03T00:00:00Z" }),
      issue({ title: "c", labels: [{ name: "roadmap" }, { name: "status:in-progress" }] }),
      issue({ title: "d" }),
      issue({ title: "e", labels: [{ name: "enhancement" }] }),
    ]),
  );
  assert.deepEqual(c.shipped.map((x) => x.title), ["b", "a"]);
  assert.deepEqual(c.inProgress.map((x) => x.title), ["c"]);
  assert.deepEqual(c.planned.map((x) => x.title), ["d"]);
});

test("closed as not planned is not shipped", () => {
  const c = mapIssues(normalise([issue({ state: "closed", state_reason: "not_planned" })]));
  assert.equal(c.shipped.length, 0);
});

test("planned goes by thumbs-up; chips drop roadmap and status labels; votes come from +1", () => {
  const c = mapIssues(
    normalise([
      issue({ title: "few", reactions: { "+1": 1 }, labels: [{ name: "roadmap" }, { name: "bills" }] }),
      issue({ title: "many", reactions: { "+1": 9, "-1": 40 }, labels: [{ name: "roadmap" }, { name: "status:x" }, { name: "lists" }] }),
    ]),
  );
  assert.deepEqual(c.planned.map((x) => [x.title, x.votes, x.chips]), [["many", 9, ["lists"]], ["few", 1, ["bills"]]]);
});

test("a link that is not into the project repository is replaced", () => {
  const [i] = normalise([issue({ html_url: "https://evil.example/x" })]);
  assert.ok(i.url.startsWith("https://github.com/wouekk/cartvibe/"));
});

test("stripMarkdown gives plain text", () => {
  const md = "## Heading\n\nSome **bold** and `code` with a [link](https://x.y) and ![img](a.png).\n\n- [x] item one\n- item two\n\n```js\nalert(1)\n```\n<!-- hidden -->\n<b>tag</b> > quote";
  assert.equal(stripMarkdown(md), "Heading Some bold and code with a link and img. item one item two tag > quote");
  assert.equal(stripMarkdown(null), "");
});

test("a fresh cache is used, an old one is not", () => {
  const s = memory();
  writeCache(s, 1000, [{ title: "x" }]);
  assert.deepEqual(readCache(s, 1000 + CACHE_MS - 1), [{ title: "x" }]);
  assert.equal(readCache(s, 1000 + CACHE_MS), null);
  assert.equal(readCache(s, 999), null);
});

test("an unreadable or unwritable store never throws", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
  assert.equal(readCache(broken, 1), null);
  assert.doesNotThrow(() => writeCache(broken, 1, []));
  const garbage = memory();
  garbage.setItem(CACHE_KEY, "{not json");
  assert.equal(readCache(garbage, 1), null);
});

const reply = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

test("loadRoadmap: live answer is mapped and cached, then the cache answers without a request", async () => {
  const s = memory();
  let calls = 0;
  const fetch = async (url, init) => {
    calls++;
    assert.equal(url, ISSUES_API);
    assert.equal(init.credentials, "omit");
    return reply([issue({ title: "live" })])();
  };
  const first = await loadRoadmap({ fetch, storage: s, now: () => 5 });
  assert.equal(first.source, "live");
  assert.equal(first.columns.planned[0].title, "live");
  const second = await loadRoadmap({ fetch, storage: s, now: () => 6 });
  assert.equal(second.source, "cache");
  assert.equal(calls, 1);
  const third = await loadRoadmap({ fetch, storage: s, now: () => 5 + CACHE_MS });
  assert.equal(third.source, "live");
  assert.equal(calls, 2);
});

test("loadRoadmap: rate limit, server error, network error, bad body and an empty board give the curated list", async () => {
  const cases = [
    reply({ message: "rate limit" }, false, 403),
    reply([], false, 500),
    async () => { throw new TypeError("offline"); },
    reply({ not: "a list" }),
    reply([]),
    reply([issue({ pull_request: {} })]),
  ];
  for (const fetch of cases) {
    const r = await loadRoadmap({ fetch, storage: memory(), now: () => 1 });
    assert.equal(r.source, "fallback");
    assert.equal(r.columns, FALLBACK_ROADMAP);
  }
  assert.equal((await loadRoadmap({ fetch: reply([]), storage: undefined })).source, "fallback");
});

test("the curated list has realistic content in every column and no GitHub numbers", () => {
  for (const key of ["planned", "inProgress", "shipped"]) assert.ok(FALLBACK_ROADMAP[key].length > 0);
  const titles = FALLBACK_ROADMAP.planned.map((c) => c.title).join("|");
  for (const t of ["Recurring bill reminders", "Price history across stores", "Barcode quick-add", "Receipt export bundles"]) assert.match(titles, new RegExp(t));
  assert.ok(Object.values(FALLBACK_ROADMAP).flat().every((c) => c.votes === null));
});
