import { Component, OnInit } from "@angular/core";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { Store } from "@ngxs/store";
import { interval, take, tap } from "rxjs";
import { HideProgressBar } from "src/store/layout.state.actions";
import { TokenRefreshService } from "../services";
import { AuthState } from "../store";

@UntilDestroy()
@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
    standalone: false
})
export class AppComponent implements OnInit {

  constructor(
    private tokenRefreshService: TokenRefreshService,
    private store: Store
  ) {}

  public ngOnInit(): void {
    this.store.dispatch(new HideProgressBar());
    this.refreshTokens();
  }

  private refreshTokens(): void {
    const fifteenMinutes = 1000 * 60 * 15;
    interval(fifteenMinutes)
      .pipe(
        untilDestroyed(this),
        tap(() => {
          if (this.store.selectSnapshot(AuthState.isLoggedIn)) {
            this.tokenRefreshService.refreshToken().pipe(take(1)).subscribe();
          }
        })
      ).subscribe();
  }
}
