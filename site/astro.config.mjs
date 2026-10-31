import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Served from https://wouekk.github.io/cartvibe/ (GitHub Pages project page).
export default defineConfig({
  site: "https://wouekk.github.io",
  base: "/cartvibe",
  trailingSlash: "always",
  // The app's palettes are imported from ../desktop/src/themes, so the dev server may read one level up.
  vite: { plugins: [tailwindcss()], server: { fs: { allow: [".."] } } },
});
