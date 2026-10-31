import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Served from https://wouekk.github.io/cartvibe/ (GitHub Pages project page).
export default defineConfig({
  site: "https://wouekk.github.io",
  base: "/cartvibe",
  trailingSlash: "always",
  vite: { plugins: [tailwindcss()] },
});
