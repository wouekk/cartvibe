# Visual overhaul ("minimalistic but flashy"), criteria and decisions

Visual only: every panel, column, chart, button and feature stays where it is and works as it does. No new widgets, no
changes to business logic, state, routing or API calls. The desktop app is Angular, so the shadcn/ui **variable
architecture** is used (not React), and Tailwind stays the CDN with `tw-` prefix and Preflight off (`index.html`).

## Criteria (second version of the brief, replaces the first)
1. Tokens: `--background --foreground --card --primary --secondary --muted --accent --destructive --border --input --ring --radius`
   for light and dark; themes Light / Dark / System; accents **Blue, Emerald, Brown, Violet**, persisted in `localStorage`,
   updating `--primary` and `--ring`.
2. Look: cards `rounded-xl` with a soft border and shadow; headings semibold with tight tracking; buttons, inputs,
   badges, tables and tabs in shadcn proportions (`px-4 py-2 rounded-lg text-sm font-medium`, focus ring).
3. Existing components restyled in place: sidebar with active pills, period tabs as a segmented control (muted track,
   raised active pill), five KPI cards, both charts (theme colors, red over goal), tables (light row borders, hover tint,
   status pills, ghost icon buttons).
4. **iOS first on phones:** grids stack (`grid-cols-1 sm:grid-cols-2`, five KPI cards on `lg`), tabs and wide tables
   scroll sideways inside their own box, never the page; no horizontal page overflow.

## Where this differs from what exists, and the decision
| Brief | Exists | Decision |
|---|---|---|
| Accents Blue, Emerald, Brown, Violet (4) | five: Classic Blue, Alpine Emerald, Twilight Violet, Walnut Brown, **Graphite Gray** | Keep Graphite (the user asked for a gray earlier); ask if it should go. |
| Font Inter first | system font stack chosen by the user (Inter is only bundled for the wordmark) | Keep the system stack, which already leads with `-apple-system` on iOS. |
| `.dark` with its own variable values | dark mode is a filter (`invert + contrast`), every color authored for the light page | Keep the filter: a variable-only dark needs every component's hard-coded whites changed. Expose the tokens for light, derive dark from them. |
| Hit targets 36-40 px (`h-9`/`h-10`) | mixed | 40 px on desktop, **44 px on phones** (Apple's minimum). |
| Tailwind classes on components | CDN with `tw-` prefix | Skin through plain CSS reading the tokens; use `tw-` classes only in new markup. |
| Names | | No brand names of other companies in classes, themes or branches. |

## Phone checklist (iOS Safari)
`viewport-fit=cover` + `env(safe-area-inset-*)` padding; inputs at 16 px so Safari does not zoom on focus; `100dvh` not `100vh`;
no hover-only affordances; `-webkit-` prefixes where Safari needs them; check with Playwright **WebKit** as well as Chromium.
