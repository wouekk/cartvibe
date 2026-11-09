import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of, Subject, throwError } from "rxjs";
import { ApiModule, AuthService, Claims } from "../open-api";
import { AuthState, Logout, SetAuthState } from "../store";
import { TokenRefreshService } from "./token-refresh.service";
import { HttpErrorResponse, provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("TokenRefreshService", () => {
  let service: TokenRefreshService;
  let store: Store;
  let authService: AuthService;
  let router: Router;

  const mockClaims: Claims = {
    userId: 1,
    displayName: "Test User",
    defaultAvatarColor: "#CD5C5C",
    username: "testuser",
    iss: "https://cartvibe.app",
    exp: Math.floor(Date.now() / 1000) + 1200,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        ApiModule,
        NgxsModule.forRoot([AuthState]),
        RouterTestingModule,
      ],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(TokenRefreshService);
    store = TestBed.inject(Store);
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("refreshToken", () => {
    it("should call authService.getNewRefreshToken and return claims", () => new Promise<void>((done) => {
      const spy = vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        of(mockClaims as any)
      );

      service.refreshToken().subscribe((claims) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(claims).toEqual(mockClaims);
        done();
      });
    }));

    it("should dispatch SetAuthState on successful refresh", () => new Promise<void>((done) => {
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        of(mockClaims as any)
      );
      const dispatchSpy = vi.spyOn(store, "dispatch");

      service.refreshToken().subscribe(() => {
        expect(dispatchSpy).toHaveBeenCalledWith(
          new SetAuthState(mockClaims)
        );
        done();
      });
    }));

    it("signs out, clears the account's storage and opens the login page when the server refuses the token", () => new Promise<void>((done) => {
      const error = new HttpErrorResponse({ status: 401 });
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        throwError(() => error)
      );
      const dispatchSpy = vi.spyOn(store, "dispatch").mockReturnValue(of(undefined));
      const clearSpy = vi.spyOn(Storage.prototype, "clear");
      const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

      service.refreshToken().subscribe({
        error: (err) => {
          expect(dispatchSpy).toHaveBeenCalledWith(new Logout());
          expect(clearSpy).toHaveBeenCalled();
          expect(navigateSpy).toHaveBeenCalledWith(["/auth/login"]);
          expect(err).toBe(error);
          clearSpy.mockRestore();
          done();
        },
      });
    }));

    it("keeps the look and the language of the device when it signs out", () => {
      localStorage.setItem("cartvibe.themeMode", "dark");
      localStorage.setItem("cartvibe.themePalette", "emerald");
      localStorage.setItem("cartvibe.language", "pl");
      localStorage.setItem("auth", "{}");
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401 }))
      );
      vi.spyOn(store, "dispatch").mockReturnValue(of(undefined));
      vi.spyOn(router, "navigate").mockResolvedValue(true);

      service.refreshToken().subscribe({ error: () => {} });

      expect(localStorage.getItem("cartvibe.themeMode")).toBe("dark");
      expect(localStorage.getItem("cartvibe.themePalette")).toBe("emerald");
      expect(localStorage.getItem("cartvibe.language")).toBe("pl");
      expect(localStorage.getItem("auth")).toBeNull();
      localStorage.clear();
    });

    // A phone with no signal in the shop (status 0), a server restarting during a deploy (502, 503) and a server
    // error (500) say nothing about the session: it stays, and the refresh is tried again later.
    it.each([0, 500, 502, 503])("stays signed in when the refresh fails with status %i", (status) => {
      localStorage.setItem("cartvibe.themeMode", "dark");
      const error = new HttpErrorResponse({ status });
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        throwError(() => error)
      );
      const dispatchSpy = vi.spyOn(store, "dispatch").mockReturnValue(of(undefined));
      const clearSpy = vi.spyOn(Storage.prototype, "clear");
      const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

      const errors: unknown[] = [];
      service.refreshToken().subscribe({ error: (err) => errors.push(err) });

      expect(errors).toEqual([error]);
      expect(dispatchSpy.mock.calls.some(([action]) => action instanceof Logout)).toBe(false);
      expect(clearSpy).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem("cartvibe.themeMode")).toBe("dark");
      clearSpy.mockRestore();
      localStorage.clear();
    });

    it("should serialize concurrent calls — only one HTTP request fires", () => {
      const subject = new Subject<any>();
      const spy = vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        subject.asObservable()
      );

      // Subscribe twice before the first completes
      const results: Claims[] = [];
      service.refreshToken().subscribe((c) => results.push(c));
      service.refreshToken().subscribe((c) => results.push(c));

      // Only one HTTP call should have been made
      expect(spy).toHaveBeenCalledTimes(1);

      // Emit the response
      subject.next(mockClaims);
      subject.complete();

      // Both subscribers should have received the same result
      expect(results.length).toBe(2);
      expect(results[0]).toEqual(mockClaims);
      expect(results[1]).toEqual(mockClaims);
    });

    it("should serialize concurrent calls — SetAuthState dispatched once", () => {
      const subject = new Subject<any>();
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        subject.asObservable()
      );
      const dispatchSpy = vi.spyOn(store, "dispatch");

      service.refreshToken().subscribe();
      service.refreshToken().subscribe();

      subject.next(mockClaims);
      subject.complete();

      const setAuthCalls = dispatchSpy.mock.calls.filter(
        ([action]) => action instanceof SetAuthState
      );
      expect(setAuthCalls.length).toBe(1);
    });

    it("should reset in-flight state after successful completion allowing new requests", () => {
      const spy = vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        of(mockClaims as any)
      );

      // First call
      service.refreshToken().subscribe();
      expect(spy).toHaveBeenCalledTimes(1);

      // Second call after first completes — should make a new HTTP request
      service.refreshToken().subscribe();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("should reset in-flight state after error allowing new requests", () => {
      const spy = vi.spyOn(authService, "getNewRefreshToken");
      vi.spyOn(store, "dispatch").mockReturnValue(of(undefined));
      vi.spyOn(router, "navigate").mockResolvedValue(true);
      const clearSpy = vi.spyOn(Storage.prototype, "clear");

      // First call — fails
      spy.mockReturnValue(throwError(() => new Error("fail")));
      service.refreshToken().subscribe({ error: () => {} });
      expect(spy).toHaveBeenCalledTimes(1);

      // Second call after error — should make a new HTTP request
      spy.mockReturnValue(of(mockClaims as any));
      service.refreshToken().subscribe();
      expect(spy).toHaveBeenCalledTimes(2);

      clearSpy.mockRestore();
    });

    it("should propagate error to all concurrent subscribers on failure", () => {
      const subject = new Subject<any>();
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        subject.asObservable()
      );
      vi.spyOn(store, "dispatch").mockReturnValue(of(undefined));
      vi.spyOn(router, "navigate").mockResolvedValue(true);
      const clearSpy = vi.spyOn(Storage.prototype, "clear");

      const errors: any[] = [];
      service.refreshToken().subscribe({ error: (e) => errors.push(e) });
      service.refreshToken().subscribe({ error: (e) => errors.push(e) });

      const error = new Error("refresh failed");
      subject.error(error);

      expect(errors.length).toBe(2);
      expect(errors[0]).toBe(error);
      expect(errors[1]).toBe(error);

      clearSpy.mockRestore();
    });

    it("should dispatch Logout only once for concurrent failures", () => {
      const subject = new Subject<any>();
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        subject.asObservable()
      );
      const dispatchSpy = vi.spyOn(store, "dispatch").mockReturnValue(of(undefined));
      vi.spyOn(router, "navigate").mockResolvedValue(true);
      const clearSpy = vi.spyOn(Storage.prototype, "clear");

      service.refreshToken().subscribe({ error: () => {} });
      service.refreshToken().subscribe({ error: () => {} });

      subject.error(new HttpErrorResponse({ status: 401 }));

      const logoutCalls = dispatchSpy.mock.calls.filter(
        ([action]) => action instanceof Logout
      );
      expect(logoutCalls.length).toBe(1);

      clearSpy.mockRestore();
    });

    it("should not dispatch SetAuthState on failure", () => {
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        throwError(() => new Error("fail"))
      );
      const dispatchSpy = vi.spyOn(store, "dispatch").mockReturnValue(of(undefined));
      vi.spyOn(router, "navigate").mockResolvedValue(true);
      const clearSpy = vi.spyOn(Storage.prototype, "clear");

      service.refreshToken().subscribe({ error: () => {} });

      const setAuthCalls = dispatchSpy.mock.calls.filter(
        ([action]) => action instanceof SetAuthState
      );
      expect(setAuthCalls.length).toBe(0);

      clearSpy.mockRestore();
    });

    it("should update auth state expiration date on success", () => new Promise<void>((done) => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const claims = { ...mockClaims, exp: futureExp };

      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        of(claims as any)
      );

      service.refreshToken().subscribe(() => {
        const expirationDate = store.selectSnapshot(
          (state) => state.auth.expirationDate
        );
        expect(expirationDate).toBe(futureExp.toString());
        done();
      });
    }));

    it("should handle rapid sequential calls correctly", () => {
      const spy = vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        of(mockClaims as any)
      );

      const results: Claims[] = [];

      // 5 rapid sequential calls — each completes before the next starts
      for (let i = 0; i < 5; i++) {
        service.refreshToken().subscribe((c) => results.push(c));
      }

      // Each call completes synchronously (of()), so each should start a new request
      expect(spy).toHaveBeenCalledTimes(5);
      expect(results.length).toBe(5);
    });

    it("should handle late subscriber to in-flight refresh", () => {
      const subject = new Subject<any>();
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        subject.asObservable()
      );

      const results: Claims[] = [];

      // First subscriber
      service.refreshToken().subscribe((c) => results.push(c));

      // Complete the request
      subject.next(mockClaims);
      subject.complete();

      expect(results.length).toBe(1);

      // Late subscriber after completion — shareReplay(1) replays the last value
      // but finalize has reset refreshInFlight$, so this starts a new request
      const subject2 = new Subject<any>();
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(
        subject2.asObservable()
      );

      service.refreshToken().subscribe((c) => results.push(c));
      subject2.next(mockClaims);
      subject2.complete();

      expect(results.length).toBe(2);
    });
  });
});
