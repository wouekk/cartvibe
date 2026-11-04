// Tells the IndexNow search engines (Bing, Yandex, Seznam, Naver and others; they share submissions) that the pages
// of https://cartvibe.app changed. Run by the `indexnow` job of .github/workflows/pages.yml after each deploy from main
// (docs/site.md, "Search and sharing"); it reads the live sitemap, so it sends what was just published.
//
//   node tools/indexnow.mjs            sends the ping
//   node tools/indexnow.mjs --dry-run  prints what it would send
//
// The key is public by design: IndexNow checks that https://cartvibe.app/<key>.txt holds it, which proves the
// sender controls the site. It is not a secret.
import { pathToFileURL } from "node:url";

export const SITE = "https://cartvibe.app";
export const KEY = "4973d748f304383d49f42e8aee4027cd";
export const KEY_LOCATION = `${SITE}/${KEY}.txt`;
export const ENDPOINT = "https://api.indexnow.org/indexnow";

/** The page URLs in a sitemap, only those on this site. */
export function sitemapUrls(xml) {
  const host = new URL(SITE).host;
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => new URL(u).host === host);
}

/** The JSON body of an IndexNow submission. */
export function payload(urls) {
  return { host: new URL(SITE).host, key: KEY, keyLocation: KEY_LOCATION, urlList: urls };
}

async function text(url) {
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  // Pages can take a moment to serve a fresh deploy; IndexNow rejects a key it cannot read, so wait for it.
  let key = "";
  for (let attempt = 1; attempt <= 10; attempt++) {
    key = await text(KEY_LOCATION).catch(() => "");
    if (key.trim() === KEY) break;
    await new Promise((r) => setTimeout(r, 6000));
  }
  if (key.trim() !== KEY) throw new Error(`${KEY_LOCATION} does not hold the key yet`);

  const urls = sitemapUrls(await text(`${SITE}/sitemap.xml`));
  if (urls.length === 0) throw new Error("the sitemap lists no pages");
  const body = payload(urls);
  if (dryRun) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  // 200 OK and 202 Accepted (key still being checked) are both success.
  if (res.status !== 200 && res.status !== 202) throw new Error(`IndexNow answered ${res.status}: ${await res.text()}`);
  console.log(`IndexNow accepted ${urls.length} URLs (${res.status}): ${urls.join(", ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
