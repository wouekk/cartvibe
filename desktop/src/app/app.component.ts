import { Component, DestroyRef, OnInit, ChangeDetectionStrategy, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterOutlet } from "@angular/router";
import { Store } from "@ngxs/store";
import { interval, take, tap } from "rxjs";
import { HideProgressBar } from "src/store/layout.state.actions";
import { TokenRefreshService } from "../services";
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
    private themeService: ThemeService
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
        tap(() => {
          if (this.store.selectSnapshot(AuthState.isLoggedIn)) {
            this.tokenRefreshService.refreshToken().pipe(take(1)).subscribe();
          }
        })
      ).subscribe();
  }
}
