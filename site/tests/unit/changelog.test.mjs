import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatDate, headline, parseChangelog } from "../../src/lib/changelog.mjs";

const SAMPLE = `# Changelog

## [Unreleased]

- Not released yet.

## [0.3.0] - 2026-10-30

Intro line.

### Removed
- **API keys are gone.** Nothing used them.

### Added
- **Licence texts in About.** The font (Geist), the icons
  (Lucide) are credited, see [the page](https://example.com/a).
- feat(site): a roadmap page
- A plain sentence without bold. And a second one.
- **Fourth one.** Cut.

### Fixed
- **Wrong hash.** Details.

## [0.2.0] - 2026-10-24

## [0.1.0] - 2026-10-01

### Fixed
- one

[0.3.0]: https://example.com/compare
`;

test("takes the latest releases, skips Unreleased, keeps version and date", () => {
  const r = parseChangelog(SAMPLE, { releases: 2 });
  assert.deepEqual(r.map((x) => [x.version, x.date]), [["0.3.0", "2026-10-30"], ["0.2.0", "2026-10-24"]]);
});

test("at most three one-line highlights, Added before Fixed before Removed, links and markup stripped", () => {
  const [r] = parseChangelog(SAMPLE);
  assert.deepEqual(r.highlights, ["Licence texts in About", "a roadmap page", "A plain sentence without bold"]);
  assert.ok(r.highlights.every((h) => !h.includes("http") && !h.includes("*") && !h.includes("\n")));
});

test("a release without usable lines has no highlights", () => {
  const r = parseChangelog(SAMPLE);
  assert.deepEqual(r.find((x) => x.version === "0.2.0").highlights, []);
});

test("Removed lines are used when nothing else is there", () => {
  const r = parseChangelog("## [1.0.0] - 2026-01-02\n\n### Removed\n- **Old thing gone.** Why.\n");
  assert.deepEqual(r[0].highlights, ["Old thing gone"]);
});

test("the sentence under the heading is the summary; none without one; quotes and bullets do not count", () => {
  const [a, b] = parseChangelog(SAMPLE);
  assert.equal(a.summary, "Intro line");
  assert.equal(b.summary, "");
  const [c] = parseChangelog("## [1.0.0] - 2026-01-02\n\nCharts on a free licence, **no** API keys and\na [smaller](https://x.y) image.\n\n> Upgrade note\n\n### Added\n- one\n");
  assert.equal(c.summary, "Charts on a free licence, no API keys and a smaller image");
  const [d] = parseChangelog("## [1.0.0] - 2026-01-02\n\n> Upgrade note\n\n### Added\n- one\n");
  assert.equal(d.summary, "");
  assert.ok(parseChangelog(`## [1.0.0] - 2026-01-02\n\n${"word ".repeat(60)}\n`)[0].summary.length <= 140);
});

test("headline: conventional subject, bold lead-in, first sentence, length cap", () => {
  assert.equal(headline("fix(api)!: stop losing lists"), "stop losing lists");
  assert.equal(headline("**Bold lead:** more text"), "Bold lead");
  assert.equal(headline("First sentence. Second."), "First sentence");
  assert.ok(headline("x".repeat(200)).length <= 64);
  assert.equal(headline("Categories and tags belong to a receipt's product lines: each line has one category"), "Categories and tags belong to a receipt's product lines");
  assert.equal(headline('Validation messages ("... is required") are translated and follow the language live.'), "Validation messages");
  assert.equal(headline('Tags can have their own Dashboard tile ("Show on the Dashboard", on by default)'), "Tags can have their own Dashboard tile");
  assert.equal(headline("A very long sentence without any clause break that just keeps on going and going for a long while"), "A very long sentence without any clause break that just keeps…");
});

test("dates read as day, month name, year", () => {
  assert.equal(formatDate("2026-10-30"), "30 Oct 2026");
  assert.equal(formatDate("soon"), "soon");
});

test("the real CHANGELOG.md gives five releases with highlights", () => {
  const r = parseChangelog(readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8"));
  assert.equal(r.length, 5);
  assert.ok(r.every((x) => /^\d+\.\d+\.\d+$/.test(x.version) && /^\d{4}-\d{2}-\d{2}$/.test(x.date)));
  assert.ok(r[0].highlights.length > 0 && r[0].highlights.length <= 3);
  assert.ok(r.every((x) => x.highlights.every((h) => h.length <= 64)));
  assert.ok(r.every((x) => x.summary.length > 0), "each of the latest five releases has a milestone sentence");
});
