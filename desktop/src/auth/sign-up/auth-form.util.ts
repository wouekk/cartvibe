import { inject, Injectable } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { catchError, map, Observable, of, tap } from "rxjs";
import { AppData, AuthService } from "../../open-api";
import { SnackbarService } from "../../services";
import { AppDataService } from "../../services/app-data.service";

@Injectable()
export class AuthFormUtil {
  private readonly appData = inject(AppDataService);

  constructor(
    private authService: AuthService,
    private snackbarService: SnackbarService
  ) {}

  public getSubmitObservable(
    form: FormGroup,
    isSignUp: boolean
  ): Observable<void> {
    const isValid = form.valid;

    if (isValid && isSignUp) {
      return this.authService.signUp(form.value).pipe(
        tap(() => {
          this.snackbarService.success("User successfully signed up");
        }),
        catchError((err) =>
          of(this.snackbarService.error(err.error["username"] ?? err["errMsg"]))
        )
      );
    } else if (isValid && !isSignUp) {
      return this.authService.login(form.value).pipe(
        tap(() => {
          this.snackbarService.success("Successfully logged in");
        }),
        tap((appData: AppData) => this.appData.set(appData)),
        map(() => undefined)
      );
    } else {
      return of(undefined);
    }
  }
}
