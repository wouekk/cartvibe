import { Component, DestroyRef, OnInit, ChangeDetectionStrategy, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterOutlet } from "@angular/router";
import { Store } from "@ngxs/store";
import { interval, take, tap } from "rxjs";
import { HideProgressBar } from "src/store/layout.state.actions";
import { TokenRefreshService } from "../services";
import { PullToRefreshService } from "../services/pull-to-refresh.service";
import { SignInTransitionService } from "../services/sign-in-transition.service";
import { CartVibeSplashComponent } from "../shared-ui/cartvibe-splash/cartvibe-splash.component";
import { AuthState } from "../store";
import { ThemeService } from "../theme/theme.service";
import { ToastHostComponent } from "../toast/toast-host.component";

@Component({
    selector: "app-root", host: { class: "block size-full" },
    templateUrl: "./app.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CartVibeSplashComponent, RouterOutlet, ToastHostComponent],
})
export class AppComponent implements OnInit {
  protected readonly signInTransition = inject(SignInTransitionService);
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private tokenRefreshService: TokenRefreshService,
    private store: Store,
    // Created here so the stored theme is applied, and follows the system, from the first screen on.
    private themeService: ThemeService,
    // Created here so the installed app can be pulled down to refresh from any page.
    private pullToRefresh: PullToRefreshService
  ) {}

  public ngOnInit(): void {
    this.store.dispatch(new HideProgressBar());
    this.refreshTokens();
  }

  private refreshTokens(): void {
    const fifteenMinutes = 1000 * 60 * 15;
    interval(fifteenMinutes)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap(() => this.refreshSession())
      ).subscribe();

    // A phone that was asleep or without signal skipped its renewals: catch up when the connection or the app
    // comes back, instead of waiting for the next quarter of an hour.
    const catchUp = () => {
      if (document.visibilityState === "visible" && this.store.selectSnapshot(AuthState.isTokenExpired)) {
        this.refreshSession();
      }
    };
    window.addEventListener("online", catchUp);
    document.addEventListener("visibilitychange", catchUp);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener("online", catchUp);
      document.removeEventListener("visibilitychange", catchUp);
    });
  }

  private refreshSession(): void {
    if (!this.store.selectSnapshot(AuthState.isLoggedIn)) {
      return;
    }
    // A failure is the refresh service's to judge: it signs out when the server refuses and otherwise leaves the
    // session for the next try.
    this.tokenRefreshService.refreshToken().pipe(take(1)).subscribe({ error: () => undefined });
  }
}
