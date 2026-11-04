// The sitemap named in public/robots.txt: the site's indexable pages. A new page goes in this list (docs/site.md,
// "Search and sharing"). Left out on purpose: /roadmap/ (a noindex redirect to the home page) and /demo/ (the app itself).
import type { APIRoute } from "astro";

const PAGES = ["/", "/privacy/", "/support/"];

export const GET: APIRoute = ({ site }) => {
  const urls = PAGES.map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
