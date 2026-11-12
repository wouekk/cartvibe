import { Component, DestroyRef, OnInit, ChangeDetectionStrategy, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterOutlet } from "@angular/router";
import { interval, take, tap } from "rxjs";
import { LayoutStore } from "src/store/layout.store";
import { TokenRefreshService } from "../services";
import { ProblemReporter } from "../services/problem-reporter.service";
import { PullToRefreshService } from "../services/pull-to-refresh.service";
import { QuickScanCameraWatch } from "../services/quick-scan-camera-watch.service";
import { SignInTransitionService } from "../services/sign-in-transition.service";
import { CartVibeSplashComponent } from "../shared-ui/cartvibe-splash/cartvibe-splash.component";
import { ThemeService } from "../theme/theme.service";
import { ToastHostComponent } from "../toast/toast-host.component";
import { AuthStore } from "../store/auth.store";

@Component({
    selector: "app-root", host: { class: "block size-full" },
    templateUrl: "./app.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CartVibeSplashComponent, RouterOutlet, ToastHostComponent],
})
export class AppComponent implements OnInit {
  private readonly authStore = inject(AuthStore);

  private readonly layoutStore = inject(LayoutStore);

  protected readonly signInTransition = inject(SignInTransitionService);

  private readonly cameraWatch = inject(QuickScanCameraWatch);

  private readonly problemReporter = inject(ProblemReporter);
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private tokenRefreshService: TokenRefreshService,
    // Created here so the stored theme is applied, and follows the system, from the first screen on.
    private themeService: ThemeService,
    // Created here so the installed app can be pulled down to refresh from any page.
    private pullToRefresh: PullToRefreshService
  ) {}

  public ngOnInit(): void {
    this.layoutStore.hideProgress();
    this.refreshTokens();
    // A Quick Scan photo that never arrived because the phone closed the page: said now, and reported. Then
    // whatever reports an earlier visit could not send.
    this.cameraWatch.checkAtStart();
    this.problemReporter.flush();
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
      if (document.visibilityState === "visible" && this.authStore.isAccessTokenExpired()) {
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
    if (!this.authStore.isLoggedIn()) {
      return;
    }
    // A failure is the refresh service's to judge: it signs out when the server refuses and otherwise leaves the
    // session for the next try.
    this.tokenRefreshService.refreshToken().pipe(take(1)).subscribe({ error: () => undefined });
  }
}
