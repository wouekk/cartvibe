import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Store } from '@ngxs/store';
import { firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { TokenRefreshService } from '../services';
import { AuthState } from '../store';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let hasSession: boolean;
  let tokenExpired: boolean;
  let refreshToken: ReturnType<typeof vi.fn>;

  const page = { url: { toString: () => 'receipts' } } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  async function activate(): Promise<boolean | UrlTree> {
    const result = guard.canActivate(page, state);
    return isObservable(result) ? firstValueFrom(result) : result;
  }

  beforeEach(() => {
    hasSession = true;
    tokenExpired = false;
    refreshToken = vi.fn();

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: Store,
          useValue: {
            selectSnapshot: (selector: unknown) => {
              if (selector === AuthState.isLoggedIn) {
                return hasSession;
              }
              if (selector === AuthState.isTokenExpired) {
                return tokenExpired;
              }
              return '/overview';
            },
          },
        },
        { provide: TokenRefreshService, useValue: { refreshToken } },
      ],
    });
    guard = TestBed.inject(AuthGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('sends a visitor without a session to the login page', async () => {
    hasSession = false;

    const result = await activate();

    expect(result instanceof UrlTree && result.toString()).toBe('/auth/login');
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('lets a session with a live token in without a refresh', async () => {
    expect(await activate()).toBe(true);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('renews an expired token on the way in', async () => {
    tokenExpired = true;
    refreshToken.mockReturnValue(of({}));

    expect(await activate()).toBe(true);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  // No signal in the shop: the refresh never reached the server, the session stands, the page opens.
  it('opens the page when the refresh could not reach the server', async () => {
    tokenExpired = true;
    refreshToken.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    expect(await activate()).toBe(true);
  });

  it('goes to the login page when the server refused the refresh and the session ended', async () => {
    tokenExpired = true;
    refreshToken.mockImplementation(() => {
      // What TokenRefreshService does on a 401: the session is gone by the time the error arrives.
      hasSession = false;
      return throwError(() => new HttpErrorResponse({ status: 401 }));
    });

    const result = await activate();

    expect(result instanceof UrlTree && result.toString()).toBe('/auth/login');
  });
});
