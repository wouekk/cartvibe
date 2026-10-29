import { HttpErrorResponse } from "@angular/common/http";
import { Component, OnInit, signal, ChangeDetectionStrategy, inject } from "@angular/core";
import { FormBuilder, FormControl, FormGroup, Validators, } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { BehaviorSubject, catchError, EMPTY, finalize, switchMap, take, tap, } from "rxjs";
import { AppData, AuthService, FeatureConfigService } from "src/open-api";
import { SnackbarService } from "src/services";
import { setAppData } from "src/utils";
import { GroupState, SetFeatureConfig } from "../../store";
import { FeatureConfigState } from "../../store/feature-config.state";
import { UserValidators } from "../../validators";
import { marker } from "../../i18n/marker";
import { SignInTransitionService } from "../../services/sign-in-transition.service";

@Component({
    selector: "app-auth-form",
    templateUrl: "./auth-form.component.html",
    host: { class: "relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-muted via-accent to-muted p-6 max-sm:p-3" },
    providers: [UserValidators],
    changeDetection: ChangeDetectionStrategy.Eager,
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

  /** On while the household has a Logo.dev key: the page then credits Logo.dev. */
  protected readonly shopLogosEnabled = inject(Store).selectSignal(FeatureConfigState.shopLogosEnabled);

  private readonly signInTransition = inject(SignInTransitionService);

  private readonly featureConfigService = inject(FeatureConfigService);

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
    this.refreshFeatureConfig();
  }

  /**
   * The app loads the feature config at start only for a browser that never signed in; one coming back from a
   * session (signed out, or its session expired) would show stale or default settings here, and miss the Logo.dev
   * credit. A failure keeps what the store has.
   */
  private refreshFeatureConfig(): void {
    this.featureConfigService
      .getFeatureConfig()
      .pipe(
        take(1),
        switchMap((config) => this.store.dispatch(new SetFeatureConfig(config))),
        catchError(() => EMPTY)
      )
      .subscribe();
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
    // The form stays under the splash while signing in; Enter in a field must not send a second login.
    if (this.isLoading()) {
      return;
    }

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

  /**
   * The splash covers the whole app from the press until the first page is in place (the sidebar and header appear as
   * soon as the session is stored, before the Dashboard has loaded), then fades away to reveal it. A refused login
   * fades it back to the form.
   */
  private login(): void {
    this.isLoading.set(true);
    this.signInTransition.start();
    this.authSerivce
      .login(this.form.value)
      .pipe(
        switchMap((appData: AppData) => setAppData(this.store, appData)),
        switchMap(() => this.router.navigate([this.store.selectSnapshot(GroupState.overviewLink)])),
        catchError(() => EMPTY), // the HTTP interceptor surfaces the failure toast
        finalize(() => {
          this.isLoading.set(false);
          this.signInTransition.finish();
        })
      )
      .subscribe();
  }
}
