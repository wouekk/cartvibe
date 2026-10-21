# Themes

CartVibe's look is made of **design tokens** (CSS variables with the shadcn/ui names: `--background`, `--card`,
`--primary`, `--muted-foreground`, `--border`, ...). Every component, the spartan/ui helm components in `desktop/src/ui`
and the Tailwind utilities (`bg-card`, `text-muted-foreground`, ...) read those tokens, so **a theme is just a block of
token values**. There is no per-component theme code.

Two themes ship: **Light** and **Dark** (spartan's zinc palette). The user picks one, or "System", in User Settings → Theme.

## Add a theme in three steps

1. **Write the tokens.** Copy `desktop/src/themes/dark.css` (or `light.css`) to `desktop/src/themes/<key>.css` and change
   the values. The selector is `[data-theme="<key>"]`. Set `color-scheme: light|dark`. Besides the shadcn tokens, set the
   `--brand-*` tokens, which colour the CartVibe logo, icon and loaders (badge, cart, bars, arrow, wordmark).
2. **Import it.** Add `@import "./<key>.css";` to `desktop/src/themes/themes.css`.
3. **Register it.** Add an entry to `THEMES` in `desktop/src/theme/themes.ts`:
   `{ key: "<key>", label: "Forest", scheme: "dark", icon: "park" }`. `scheme` decides whether the `dark` class is put on
   `<html>` (that is what Tailwind's `dark:` variants and the spartan components key off), so mark a dark-looking theme
   `"dark"`.

That is all: the theme appears in the Theme tab, is remembered per browser, is applied before the first paint
(`index.html` reads the stored key and scheme, it does not need the list), and every component follows it.

## Rules that keep themes cheap

- **Never write a colour in a component.** Use a token (`bg-card`, `var(--border)`), or add a new token to *every* theme.
  Hard-coded hex values are what made dark mode hard before; a lint-style grep for `#` in `*.scss` finds stragglers.
- Charts use `--chart-1..5` and the semantic `--destructive`; the Dashboard's category colours are fixed OKLCH hues in
  `overview-chart.utils.ts` (readable on every theme).
- The favicon (`desktop/src/favicon.svg`) is a standalone file and cannot read page variables; it switches on the
  operating system's `prefers-color-scheme`. Update its two palettes if the identity changes.
- Test a new theme by opening each main page with `data-theme="<key>"` set (Playwright screenshots in light and dark are
  how the existing ones were checked, see `HANDOFF.md`).
