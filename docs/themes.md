# Themes

CartVibe's look is made of **design tokens** (CSS variables with the shadcn/ui names: `--background`, `--card`,
`--primary`, `--muted-foreground`, `--border`, ...). Every component, the spartan/ui helm components in `desktop/src/ui`
and the Tailwind utilities (`bg-card`, `text-muted-foreground`, ...) read those tokens, so **a palette is just a block of
token values**. There is no per-component theme code.

The look is two independent choices, remembered per browser (localStorage, no API):

- **Palette** (`rw_theme_palette`, default `zinc`): **Blue**, **Zinc**, **Indigo**, **Emerald**, **Violet**. It is
  `data-palette="<key>"` on `<html>`.
- **Mode** (`rw_theme_mode`): **System**, **Day** (`light`) or **Night** (`dark`). Night puts the `dark` class on `<html>`
  (what Tailwind's `dark:` variants, the spartan components and the night token blocks key off); System follows the
  operating system, also when it switches.

Zinc is spartan's zinc palette and the base of everything; its black is Tailwind's neutral-950 (a pure grey). Zinc is monochrome; Blue, Indigo,
Emerald and Violet are **accent only**: the neutral surfaces stay zinc and only the primary, the focus ring and the
sidebar's primary take the hue. Charts (`--chart-1..5`), status colours, Nutri-Score and the brand tokens are the same in
every palette. The header's palette menu (`palette-menu`, left of the day/night `theme-toggle`), Settings → Theme and the
first-sign-in welcome pick a palette and a mode; the look itself is described in `DESIGN.md`.

## Files and selectors (`desktop/src/themes/`)

- `zinc.css` is the base: every token (surfaces, primary, status, Nutri-Score, charts, sidebar, `--brand-*`). The other
  palette files override only what differs from it. `themes.css` imports them all, zinc first.
- Day: `:root` (zinc only, so the page is right before a palette is applied) and `[data-palette="<key>"]`.
- Night: `.dark` (zinc only) and `.dark[data-palette="<key>"], .dark [data-palette="<key>"]`. The descendant form lets a
  swatch inside the page show its own palette.
- **A palette's day and night blocks must define the same tokens.** On `<html>` the night block (0,2,0) beats the day
  block (0,1,0); a token missing from the night block would show its day value at night. `src/theme/themes.spec.ts`
  checks this, that each palette file is imported and registered, and that palettes override only tokens zinc defines.
- Blue, Indigo, Emerald and Violet override only `--primary`, `--primary-foreground`, `--ring`,
  `--sidebar-primary`, `--sidebar-primary-foreground` and `--sidebar-ring`.

## Add a palette

1. **Write the tokens.** Create `desktop/src/themes/<key>.css` with a day block and a night block in the selector shapes
   above. A neutral palette overrides the whole ramp (background, foreground, card, popover, primary, secondary, muted,
   accent, border, input, ring, sidebar*; the removed Stone palette in git history is an example); an accent palette
   copies `blue.css` and swaps the six tokens. Take OKLCH values from `node_modules/tailwindcss/theme.css`. Never write `--brand-*` (the logo keeps its colours)
   or hex values.
2. **Import it.** Add `@import "./<key>.css";` to `desktop/src/themes/themes.css`.
3. **Register it.** Add `{ key: "<key>", label: marker("<Name>") }` to `PALETTES` in `desktop/src/theme/themes.ts`, then
   `npm run i18n:extract` and fill the label in pl, de, fr and es.

That is all: the palette appears in the header menu (with its `app-palette-swatch`, a dot of the palette's `--primary` and
`--muted`), on the Theme page and in the welcome, is remembered, and every component follows it. `index.html` applies the
stored key before the first paint and needs no copy of the list (an unknown key just shows zinc).

## Rules that keep palettes cheap

- **Never write a colour in a component.** Use a token (`bg-card`, `var(--border)`), or add a new token to *every*
  palette (in `zinc.css` at least). A grep for `#` in `*.scss` finds stragglers.
- **Contrast, in day and night:** the primary against `--primary-foreground`, and `text-primary` on background, card and
  accent (links, the "blue" badge, Dashboard buttons) must reach 4.5:1; muted text and the ring are judged as zinc is.
  That is why Emerald's day primary is emerald-700 (600 is only 3.8:1 with white) and Blue's is blue-700 and the night primaries are the 400s with
  the 950 as text.
- Charts read the tokens: categories use `--chart-1..5` plus `--muted-foreground` for "Other" (`overview-chart.utils.ts`),
  bars use `--primary`, faded muted and `--destructive` (over goal), via `readChartColors()`. `app-apex-chart` redraws when
  `class` or `data-palette` changes on `<html>`.
- The inline script in `index.html` sets `data-palette` and `dark` before the first paint. The CSP in `docker/default.conf`
  allows it by hash: after changing the script, hash the text between `<script>` and `</script>` (base64 SHA-256) and update
  the `script-src` value.
- The favicon (`desktop/src/favicon.svg`) is a standalone file and cannot read page variables; it switches on the
  operating system's `prefers-color-scheme`, like the `theme-color` meta, which stays static. Update the favicon's two
  palettes if the identity changes.
- Test a palette by opening each main page with `data-palette="<key>"` set, in day and in night (Playwright screenshots
  are how the existing ones were checked, see `HANDOFF.md`).

## Compatibility with spartan's theming guide

The token names, the OKLCH values and the `@theme inline` mapping follow https://spartan.ng/documentation/theming, so a theme
copied from spartan or shadcn/ui works as it is:

- Paste its `:root { ... }` block into a palette's day block and its `.dark { ... }` block into the night block. Keep the
  `--brand-*` tokens (in `zinc.css`), which spartan does not know about.
- A **custom colour** is the documented three-step: define `--warning` / `--warning-foreground` in `zinc.css` (day and
  night), map them in the `@theme inline` block of `src/tailwind.css` (`--color-warning: var(--warning)`), then use
  `bg-warning text-warning-foreground`. `warning` ships as the worked example.
- `--radius` lives in `src/skin.css`; the radius scale in `@theme inline` derives from it.
