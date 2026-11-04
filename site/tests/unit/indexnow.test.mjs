import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KEY, KEY_LOCATION, payload, sitemapUrls } from "../../tools/indexnow.mjs";

test("the key file published with the site holds the key", () => {
  const file = new URL(`../../public/${KEY}.txt`, import.meta.url);
  assert.equal(readFileSync(file, "utf8").trim(), KEY);
  assert.match(KEY, /^[a-f0-9]{32}$/);
  assert.equal(KEY_LOCATION, `https://cartvibe.app/${KEY}.txt`);
});

test("the URLs come from the sitemap, only on this site", () => {
  const xml = `<?xml version="1.0"?><urlset>
  <url><loc>https://cartvibe.app/</loc></url>
  <url><loc> https://cartvibe.app/privacy/ </loc></url>
  <url><loc>https://example.com/elsewhere/</loc></url>
</urlset>`;
  assert.deepEqual(sitemapUrls(xml), ["https://cartvibe.app/", "https://cartvibe.app/privacy/"]);
});

test("the submission names the host, the key and where to find it", () => {
  assert.deepEqual(payload(["https://cartvibe.app/"]), {
    host: "cartvibe.app",
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: ["https://cartvibe.app/"],
  });
});
