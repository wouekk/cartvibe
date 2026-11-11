import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NgxsModule, Store } from '@ngxs/store';
import { firstValueFrom, of } from 'rxjs';
import { ApiModule } from '../../open-api';
import { FeatureConfigStore } from "../../store/feature-config.store";

import { FeatureDirective } from '../../directives/feature.directive';
import { InputModule } from '../../input';
import { AppInitService } from '../../services/app-init.service';
import { SnackbarService } from '../../services/snackbar.service';
import { SignInTransitionService } from '../../services/sign-in-transition.service';
import { AuthForm } from './auth-form.component';
import { CartVibeLogoComponent } from '../../shared-ui/cartvibe-logo/cartvibe-logo.component';
import { AppIconComponent } from '../../shared-ui/icon/icon.component';
import { HlmButton } from '@spartan-ng/helm/button';
import { AuthState } from '../../store/auth.state';
import { AuthFormUtil } from './auth-form.util';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('AuthForm', () => {
  let component: AuthForm;
  let fixture: ComponentFixture<AuthForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [HlmButton,
        AppIconComponent,
        CartVibeLogoComponent,
        InputModule,
        NgxsModule.forRoot([AuthState]),
        ReactiveFormsModule,
        ApiModule,
        RouterTestingModule, AuthForm, FeatureDirective],
    providers: [
        SnackbarService,
        AppInitService,
        AuthFormUtil,
        {
            provide: ActivatedRoute,
            useValue: {
                data: of(undefined),
                snapshot: { queryParams: {} },
            },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
}).compileComponents();

    fixture = TestBed.createComponent(AuthForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // The page reloads the feature config on open (Logo.dev attribution, sign-up): answer it as an older server would.
    TestBed.inject(HttpTestingController).expectOne('/api/featureConfig').flush({ enableLocalSignUp: true, aiPoweredReceipts: false });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it("credits Logo.dev only while logos are on", async () => {
    const attribution = () => fixture.nativeElement.querySelector('[data-testid="logo-dev-attribution"]');
    expect(attribution()).toBeNull();

    TestBed.inject(FeatureConfigStore).setFeatureConfig({ enableLocalSignUp: true, aiPoweredReceipts: false, shopLogosEnabled: true });
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    expect(attribution().textContent.trim()).toBe('Logos provided by Logo.dev');
    expect(attribution().querySelector('a').getAttribute('href')).toBe('https://logo.dev');
  });

  describe('signing in with an identity provider', () => {
    const providers = () => fixture.nativeElement.querySelector('[data-testid="oidc-providers"]');

    async function switchOn(...names: string[]) {
      TestBed.inject(FeatureConfigStore).setFeatureConfig({
        enableLocalSignUp: true,
        aiPoweredReceipts: false,
        oidcProviders: names.map((name) => ({ name, displayName: name.toUpperCase() })),
      });
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    }

    it('shows nothing on an install without a provider', () => {
      expect(providers()).toBeNull();
    });

    it('offers one button per provider, which opens the server\'s sign-in address as a page', async () => {
      await switchOn('authentik', 'key cloak');
      const navigate = vi.spyOn(component as any, 'navigateToUrl').mockImplementation(() => undefined);

      const buttons: HTMLButtonElement[] = Array.from(providers().querySelectorAll('button'));
      expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Sign in with AUTHENTIK', 'Sign in with KEY CLOAK']);

      fixture.nativeElement.querySelector('[data-testid="oidc-login-key cloak"]').click();

      expect(navigate).toHaveBeenCalledWith('/api/oidc/key%20cloak/login');
    });

    it('keeps the buttons off the sign-up page', async () => {
      await switchOn('authentik');
      component.isSignUp.next(true);
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      expect(providers()).toBeNull();
    });

    it('says why a provider sign-in failed, once, and takes the code out of the address', () => {
      const errorSpy = vi.spyOn(TestBed.inject(SnackbarService), 'error').mockImplementation(() => {});
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      TestBed.inject(ActivatedRoute).snapshot.queryParams = { oidcError: 'no_account' };

      const returned = TestBed.createComponent(AuthForm);
      returned.detectChanges();
      TestBed.inject(HttpTestingController).expectOne('/api/featureConfig').flush({ enableLocalSignUp: true, aiPoweredReceipts: false });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain('No CartVibe account is connected to that identity');
      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { oidcError: null }, replaceUrl: true }));
    });

    it('answers a code it does not know, or one that is a property of every object, with the general text', () => {
      const errorSpy = vi.spyOn(TestBed.inject(SnackbarService), 'error').mockImplementation(() => {});
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      TestBed.inject(ActivatedRoute).snapshot.queryParams = { oidcError: 'constructor' };

      const returned = TestBed.createComponent(AuthForm);
      returned.detectChanges();
      TestBed.inject(HttpTestingController).expectOne('/api/featureConfig').flush({ enableLocalSignUp: true, aiPoweredReceipts: false });

      expect(errorSpy).toHaveBeenCalledWith('Signing in with the provider failed. Please try again.');
    });
  });

  // Regression guard: isLoading used to be a plain field reset inside finalize().
  // Under zoneless change detection nothing repaints on the failure path (the
  // success path only repainted because router.navigate() triggers CD), so the
  // loading GIF stayed up forever and the user never got their form back.
  it('keeps the splash over the app until the first page is in place, and ignores a second submit', async () => {
    const httpTesting = TestBed.inject(HttpTestingController);
    const transition = TestBed.inject(SignInTransitionService);
    let arrive!: (done: boolean) => void;
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockReturnValue(new Promise<boolean>((resolve) => (arrive = resolve)));
    component.form.setValue({ username: 'wrangler', password: 'secret' });

    component.submit();
    component.submit();
    httpTesting.expectOne('/api/login/').flush({ claims: {}, groups: [{ id: 1, groupMembers: [] }], users: [], featureConfig: {}, userPreferences: {} });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(transition.active()).toBe(true);

    arrive(true);
    await fixture.whenStable();

    expect(transition.active()).toBe(false);
  });

  it('sits on the sign-in backdrop, not on a grey gradient box', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.classList.contains('cv-auth-bg')).toBe(true);
    expect(host.classList.contains('bg-background')).toBe(true);
    expect(Array.from(host.classList).some((name) => name.startsWith('bg-gradient') || name.startsWith('from-'))).toBe(false);
  });

  it('clears the splash and restores the populated form when login fails', async () => {
    const httpTesting = TestBed.inject(HttpTestingController);
    component.form.setValue({
      username: 'wrangler',
      password: 'wrong-password',
    });

    component.submit();
    await fixture.whenStable();

    // The spinner is up while the request is in flight.
    expect(component.isLoading()).toBe(true);
    expect(TestBed.inject(SignInTransitionService).active()).toBe(true);

    httpTesting
      .expectOne('/api/login/')
      .flush(
        { errorMsg: 'Invalid credentials.' },
        { status: 500, statusText: 'Internal Server Error' }
      );

    await fixture.whenStable();

    expect(component.isLoading()).toBe(false);
    expect(TestBed.inject(SignInTransitionService).active()).toBe(false);

    // The form is back in the DOM, still rendering what the user typed.
    const inputs: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-input input')
    );
    expect(inputs.map((input) => input.value)).toEqual([
      'wrangler',
      'wrong-password',
    ]);

    httpTesting.verify();
  });

  // The sign-up catchError previously did `err.error["username"] ?? err["errMsg"]`,
  // which is undefined for an errorMsg body (the wire key lives under .error), so a
  // 500 opened a blank snackbar over the interceptor's correct one. These two pin
  // each branch. Note the functional httpInterceptor is NOT registered in this
  // TestBed, so "no local toast" here means the interceptor is the only reporter.
  // Sign-up mode attaches the uniqueUsername async validator, which fires a
  // getUsernameCount request and leaves the form PENDING (so submit() would
  // no-op). Settle it here so each test drives the real submit path.
  async function enterSignUpMode(httpTesting: HttpTestingController) {
    component.isSignUp.next(true);
    component.form.setValue({
      username: 'wrangler',
      password: 'hunter2',
      displayname: 'Wrangler',
    });
    await fixture.whenStable();

    httpTesting.expectOne('/api/user/wrangler').flush(0);
    await fixture.whenStable();
    expect(component.form.valid).toBe(true);
  }

  it('surfaces a sign-up field validation error, which the interceptor ignores', async () => {
    const httpTesting = TestBed.inject(HttpTestingController);
    const errorSpy = vi
      .spyOn(TestBed.inject(SnackbarService), 'error')
      .mockImplementation(() => {});
    await enterSignUpMode(httpTesting);

    component.submit();
    await fixture.whenStable();

    httpTesting
      .expectOne('/api/signUp')
      .flush(
        { username: 'Username must be unique' },
        { status: 400, statusText: 'Bad Request' }
      );
    await fixture.whenStable();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Username must be unique');
    httpTesting.verify();
  });

  it('leaves an errorMsg sign-up failure to the interceptor', async () => {
    const httpTesting = TestBed.inject(HttpTestingController);
    const errorSpy = vi
      .spyOn(TestBed.inject(SnackbarService), 'error')
      .mockImplementation(() => {});
    await enterSignUpMode(httpTesting);

    component.submit();
    await fixture.whenStable();

    httpTesting
      .expectOne('/api/signUp')
      .flush(
        { errorMsg: 'Something broke' },
        { status: 500, statusText: 'Internal Server Error' }
      );
    await fixture.whenStable();

    // No second toast: the interceptor already reported it.
    expect(errorSpy).not.toHaveBeenCalled();
    httpTesting.verify();
  });

});
