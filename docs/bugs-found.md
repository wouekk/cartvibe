# Bugs found while rewriting (running list)

Found by reading code during the redesign. Each entry says what, where, and whether it is fixed.

| # | Bug | Where | State |
|---|---|---|---|
| 1 | A user without `group.receipts.read` was bounced between the receipts route guard and its own fallback (redirect loop). The old fallback was the widget dashboards page, whose guard happened to hide it. | `guards/*-permission.guard.ts`, `GroupState.dashboardLink` | Fixed: `redirectToLanding` never redirects onto the denied URL (with a test). |
| 2 | `mb-6`, `w-50` and similar classes in templates were Bootstrap names that did nothing or meant something else; the spacing scale differs (`mb-3` is 1rem in Bootstrap, 0.75rem in Tailwind). | all templates | Fixed: converted with a mapping table. |
| 3 | The sidebar showed "System Settings" to members who could use the AI page, because it checked the receipt-processing permissions. | `sidebar.component.ts` | Fixed earlier. |
| 4 | Dark mode: the sidebar host counter-inverted the whole page, so only the login screen went dark. | `index.html` | Fixed earlier. |
| 5 | Buttons stayed blue: a hard-coded gradient overrode the accent. | `button.component.scss` | Fixed earlier. |
| 6 | The profile page still loads OIDC connections that nothing displays any more (a wasted request per visit). | `user-profile.component.ts` | Open: removed with the dead-code pass. |
| 7 | `npm audit` reports three transitive findings under `@angular/cli` (mcp sdk, hono, vite); `npm audit fix` crashes with an npm bug. | `package.json` | Open: needs `overrides`. |
