import { HttpErrorResponse } from "@angular/common/http";
import { Component, OnInit, signal } from "@angular/core";
import { FormBuilder, FormControl, FormGroup, Validators, } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { BehaviorSubject, catchError, EMPTY, finalize, switchMap, tap, } from "rxjs";
import { AppData, AuthService } from "src/open-api";
import { SnackbarService } from "src/services";
import { setAppData } from "src/utils";
import { fadeIn, fadeInOut } from "../../animations";
import { GroupState } from "../../store";
import { UserValidators } from "../../validators";
import { marker } from "../../i18n/marker";

@Component({
    selector: "app-auth-form",
    templateUrl: "./auth-form.component.html",
    host: { class: "relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-muted via-accent to-muted p-6 max-sm:p-3" },
    providers: [UserValidators],
    animations: [fadeInOut, fadeIn],
    standalone: false
})
export class AuthForm implements OnInit {
  public form: FormGroup = new FormGroup({});
  public isSignUp: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
    false
  );
  public headerText: string = "";
  public primaryButtonText: string = "";
  public secondaryButtonText: string = "";
  public secondaryButtonRouterLink: string[] = [];
  public readonly isLoading = signal<boolean>(false);

  constructor(
    private authSerivce: AuthService,
    private snackbarService: SnackbarService,
    protected formBuilder: FormBuilder,
    protected route: ActivatedRoute,
    protected router: Router,
    protected store: Store,
    protected userValidators: UserValidators
  ) {
  }

  public ngOnInit(): void {
    this.initForm();
    this.listenForRouteChanges();
    this.listenForIsSignUpChanges();
  }

  private listenForRouteChanges(): void {
    this.route.data
      .pipe(
        tap((data) => {
          this.isSignUp.next(!!data?.["isSignUp"]);
        })
      )
      .subscribe();
  }

  private listenForIsSignUpChanges(): void {
    this.isSignUp
      .pipe(
        tap((isSignUp) => {
          if (isSignUp) {
            this.headerText = marker("Sign Up");
            this.primaryButtonText = marker("Sign Up");
            this.secondaryButtonRouterLink = ["/auth/login"];
            this.secondaryButtonText = marker("Back to Login");
            this.form
              .get("username")
              ?.addAsyncValidators(this.userValidators.uniqueUsername(0, ""));
            this.form.addControl(
              "displayname",
              new FormControl("", Validators.required)
            );
          } else {
            this.headerText = marker("Login");
            this.primaryButtonText = marker("Login");
            this.secondaryButtonRouterLink = ["/auth/sign-up"];
            this.secondaryButtonText = marker("Sign Up");
            this.form
              .get("username")
              ?.removeAsyncValidators(
                this.userValidators.uniqueUsername(0, "")
              );
            this.form.removeControl("displayname");
          }
        })
      )
      .subscribe();
  }

  private initForm(): void {
    this.form = this.formBuilder.group({
      username: ["", [Validators.required]],
      password: ["", Validators.required],
    });
  }

  public submit(): void {
    const isSignUp = this.isSignUp.getValue();
    const isValid = this.form.valid;

    if (isValid && isSignUp) {
      this.signUp();
    } else if (isValid && !isSignUp) {
      this.login();
    }
  }

  private signUp(): void {
    this.authSerivce
      .signUp(this.form.value)
      .pipe(
        tap(() => {
          this.login();
        }),
        catchError((err: HttpErrorResponse) => {
          // A sign-up validation failure is a flat field map with no errorMsg
          // (api/internal/structs/utils.go), so the interceptor stays silent and
          // this is the only report. Anything carrying errorMsg has already been
          // toasted by the interceptor — toasting again would dismiss it.
          const usernameError = err.error?.["username"];

          if (usernameError) {
            this.snackbarService.error(usernameError);
          }

          return EMPTY;
        })
      )
      .subscribe();
  }

  private login(): void {
    this.isLoading.set(true);
    this.authSerivce
      .login(this.form.value)
      .pipe(
        switchMap((appData: AppData) => setAppData(this.store, appData)),
        tap(() =>
          this.router.navigate([
            this.store.selectSnapshot(GroupState.overviewLink),
          ]),
        ),
        catchError(() => EMPTY), // the HTTP interceptor surfaces the failure toast
        finalize(() => this.isLoading.set(false))
      )
      .subscribe();
  }
}
