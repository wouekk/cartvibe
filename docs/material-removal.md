# Dropping Angular Material

**Status: done (2026-10-21).** All waves below shipped on `feature/redesign`; `@angular/material` and `material-icons` are out of `package.json`.

Decision (2026-10-21): the desktop leaves Angular Material for Tailwind + spartan/ui (brain + helm) with Lucide icons.
Material is replaced in waves; every wave ends with a green `ng build` and Jest run, and is pushed to `feature/redesign`.
Counts are files that import `@angular/material/*` when the plan was written (201 in all).

| Wave | What | Replacement | Notes |
|---|---|---|---|
| 1 | snack-bar (27), tooltip (11), badge, progress, icon (29 + 117 `<mat-icon>`), list (7), card (6), chips (7), expansion (6) | sonner toasts, `hlmTooltip`, `hlmBadge`, helm progress/spinner, `ng-icon` Lucide (an `app-icon` that maps the stored Material icon names), Tailwind markup, `hlmCollapsible` | The `SnackbarService` and `app-button` wrappers keep their API, so most call sites do not change |
| 2 | form-field (5), input (6), select (1), autocomplete (7), checkbox (3), slide-toggle, radio, datepicker | the `app-*` wrappers re-implemented on helm input, select, autocomplete, checkbox, switch, radio and a spartan date picker | Consumers use `app-input`, `app-select`, ... so they stay as they are |
| 3 | table (18), sort (32), paginator (9) | `hlmTable` with our own sort and pagination state inside `app-table` | `BaseTableComponent` and the table services keep their API |
| 4 | dialog (99) | `HlmDialogService` behind a thin `AppDialog` with MatDialog's `open / afterClosed / close` shape, then the codemod swaps the imports | `MAT_DIALOG_DATA` becomes an injection token of ours |
| 5 | menu (11), tabs (3), sidenav, core, button (15) | remaining dropdown menus, `hlm-tabs`, helm button | |
| 6 | remove `@angular/material`, `@angular/cdk` stays (spartan needs it), the Material theme in `styles.scss`, `legacy-bridge.css`, the dark-mode bridge | | `npm ci` must pass on Node 20.19.6 |

Rules while migrating: no new Material import; a component that is touched is converted fully; screenshots in light and
dark after each wave (`C:\Users\Marcin\tools\devstack`).
