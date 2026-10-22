import { Injectable, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Actions, ofActionDispatched } from "@ngxs/store";
import { catchError, map, Observable, of, take, tap } from "rxjs";
import { DashboardLayoutService } from "../../open-api";
import { Logout } from "../../store/auth.state.actions";
import { DashboardLayout, parseLayout, serializeLayout } from "./dashboard-layout";

/**
 * The signed-in person's saved Dashboard layout, loaded once per session. A failed load leaves the default layout (the
 * Dashboard never blanks over it) and customising stays offered; `canCustomise` is the API's entitlement answer.
 */
@Injectable({ providedIn: "root" })
export class DashboardLayoutStore {
  /** The saved layout; undefined for the default (never saved, unreadable, or not loaded yet). */
  public readonly layout = signal<DashboardLayout | undefined>(undefined);

  public readonly canCustomise = signal(true);

  public readonly loaded = signal(false);

  private loading = false;

  constructor(
    private dashboardLayoutService: DashboardLayoutService,
    actions: Actions
  ) {
    // The next person to sign in on this tab must not see the previous one's layout.
    actions.pipe(ofActionDispatched(Logout), takeUntilDestroyed()).subscribe(() => this.clear());
  }

  public load(): void {
    if (this.loaded() || this.loading) {
      return;
    }

    this.loading = true;
    this.dashboardLayoutService
      .getDashboardLayout()
      .pipe(
        take(1),
        catchError(() => of(undefined))
      )
      .subscribe((saved) => {
        this.loading = false;
        this.loaded.set(true);
        if (saved) {
          this.layout.set(parseLayout(saved.layout));
          this.canCustomise.set(saved.canCustomise);
        }
      });
  }

  /** Saves the layout; resolves to whether it was saved (the error toast comes from the HTTP interceptor). */
  public save(layout: DashboardLayout): Observable<boolean> {
    return this.dashboardLayoutService.updateDashboardLayout({ layout: serializeLayout(layout) }).pipe(
      take(1),
      tap((saved) => this.layout.set(parseLayout(saved.layout))),
      map(() => true),
      catchError(() => of(false))
    );
  }

  /** Forgets the cached layout. */
  public clear(): void {
    this.layout.set(undefined);
    this.canCustomise.set(true);
    this.loaded.set(false);
  }
}
