import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { TokenRefreshService } from '../services';
import { AuthStore, GroupStore } from '../store';
import { seedStore } from '../testing/seed-store';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let refreshToken: ReturnType<typeof vi.fn>;

  /** Puts a session in the browser (or none), with a token that is still good or has run out. */
  function session(hasSession: boolean, tokenExpired = false): void {
    const expires = Math.floor(Date.now() / 1000) + (tokenExpired ? -1 : 60);
    seedStore(TestBed.inject(AuthStore), { expirationDate: hasSession ? expires.toString() : "" });
  }

  const page = { url: { toString: () => 'receipts' } } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  async function activate(): Promise<boolean | UrlTree> {
    const result = guard.canActivate(page, state);
    return isObservable(result) ? firstValueFrom(result) : result;
  }

  beforeEach(() => {
    refreshToken = vi.fn();

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: TokenRefreshService, useValue: { refreshToken } }],
    });
    TestBed.inject(GroupStore).setSelectedGroupId('7');
    session(true);
    guard = TestBed.inject(AuthGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('sends a visitor without a session to the login page', async () => {
    session(false);

    const result = await activate();

    expect(result instanceof UrlTree && result.toString()).toBe('/auth/login');
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('lets a session with a live token in without a refresh', async () => {
    expect(await activate()).toBe(true);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('renews an expired token on the way in', async () => {
    session(true, true);
    refreshToken.mockReturnValue(of({}));

    expect(await activate()).toBe(true);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  // No signal in the shop: the refresh never reached the server, the session stands, the page opens.
  it('opens the page when the refresh could not reach the server', async () => {
    session(true, true);
    refreshToken.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    expect(await activate()).toBe(true);
  });

  it('goes to the login page when the server refused the refresh and the session ended', async () => {
    session(true, true);
    refreshToken.mockImplementation(() => {
      // What TokenRefreshService does on a 401: the session is gone by the time the error arrives.
      session(false);
      return throwError(() => new HttpErrorResponse({ status: 401 }));
    });

    const result = await activate();

    expect(result instanceof UrlTree && result.toString()).toBe('/auth/login');
  });
});
