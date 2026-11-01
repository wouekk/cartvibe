import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Served from https://cartvibe.app/ (GitHub Pages with a custom domain; DNS in Cloudflare, docs/site.md).
export default defineConfig({
  site: "https://cartvibe.app",
  base: "/",
  trailingSlash: "always",
  // The app's palettes are imported from ../desktop/src/themes, so the dev server may read one level up.
  vite: { plugins: [tailwindcss()], server: { fs: { allow: [".."] } } },
});
