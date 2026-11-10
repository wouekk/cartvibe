import { HttpClient, HttpContext, HttpErrorResponse, provideHttpClient, withInterceptors, withInterceptorsFromDi } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { httpInterceptor, QUIET_ERRORS } from "../interceptors/http-interceptor";
import { ApiModule, AuthService, Claims } from "../open-api";
import { AuthState, Logout, SetAuthState } from "../store";
import { SnackbarService } from "./snackbar.service";
import { TokenRefreshService } from "./token-refresh.service";

const claims = (secondsFromNow: number): Claims => ({
  userId: 1,
  displayName: "Test User",
  defaultAvatarColor: "#CD5C5C",
  username: "testuser",
  iss: "https://cartvibe.app",
  exp: Math.floor(Date.now() / 1000) + secondsFromNow,
});

describe("the session behind background work", () => {
  let service: TokenRefreshService;
  let store: Store;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ApiModule, NgxsModule.forRoot([AuthState]), RouterTestingModule],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    });
    service = TestBed.inject(TokenRefreshService);
    store = TestBed.inject(Store);
    authService = TestBed.inject(AuthService);
    vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  describe("AuthState.isAccessTokenExpired", () => {
    it("is true without a session", () => {
      expect(AuthState.isAccessTokenExpired(store)).toBe(true);
    });

    // The regression this replaces: a selector that read the clock was remembered until the auth state changed,
    // so it kept saying "not expired" for as long as the app stayed open.
    it("notices the token running out although nothing in the store changed", () => {
      vi.useFakeTimers();
      store.dispatch(new SetAuthState(claims(1200)));
      expect(AuthState.isAccessTokenExpired(store)).toBe(false);

      vi.advanceTimersByTime(19 * 60_000);
      expect(AuthState.isAccessTokenExpired(store)).toBe(false);

      vi.advanceTimersByTime(2 * 60_000);
      expect(AuthState.isAccessTokenExpired(store)).toBe(true);
    });
  });

  describe("TokenRefreshService.ensureFreshToken", () => {
    it("is false, and asks nothing, when nobody is signed in", async () => {
      const refresh = vi.spyOn(authService, "getNewRefreshToken");

      expect(await service.ensureFreshToken()).toBe(false);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("is true without a renewal while the token is good", async () => {
      store.dispatch(new SetAuthState(claims(600)));
      const refresh = vi.spyOn(authService, "getNewRefreshToken");

      expect(await service.ensureFreshToken()).toBe(true);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("renews a token that ran out", async () => {
      store.dispatch(new SetAuthState(claims(-60)));
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(of(claims(1200)) as never);

      expect(await service.ensureFreshToken()).toBe(true);
      expect(AuthState.isAccessTokenExpired(store)).toBe(false);
    });

    it("is false and keeps the session when the renewal cannot reach the server", async () => {
      store.dispatch(new SetAuthState(claims(-60)));
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

      expect(await service.ensureFreshToken()).toBe(false);
      expect(store.selectSnapshot(AuthState.isLoggedIn)).toBe(true);
    });

    it("is false when the server ends the session", async () => {
      store.dispatch(new SetAuthState(claims(-60)));
      const dispatch = vi.spyOn(store, "dispatch");
      vi.spyOn(authService, "getNewRefreshToken").mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

      expect(await service.ensureFreshToken()).toBe(false);
      expect(dispatch).toHaveBeenCalledWith(new Logout());
    });
  });
});

describe("httpInterceptor with QUIET_ERRORS", () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ApiModule],
      providers: [
        provideHttpClient(withInterceptors([httpInterceptor])),
        provideHttpClientTesting(),
        { provide: Store, useValue: { selectSnapshot: () => true } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    error = vi.spyOn(TestBed.inject(SnackbarService), "error").mockImplementation(() => undefined);
  });

  afterEach(() => controller.verify());

  it.each([
    [403, undefined],
    [400, { errorMsg: "Name is required" }],
    [502, undefined],
  ])("hands a %s to the caller without a toast", (status, body) => {
    let seen: number | undefined;
    http
      .post("/api/shopping-list/1/item", {}, { context: new HttpContext().set(QUIET_ERRORS, true) })
      .subscribe({ error: (e: HttpErrorResponse) => (seen = e.status) });

    controller.expectOne("/api/shopping-list/1/item").flush(body ?? null, { status, statusText: "x" });

    expect(seen).toBe(status);
    expect(error).not.toHaveBeenCalled();
  });

  it("still toasts the same failure of a request that is not marked quiet", () => {
    http.post("/api/shopping-list/1/item", {}).subscribe({ error: () => undefined });

    controller.expectOne("/api/shopping-list/1/item").flush({ errorMsg: "Name is required" }, { status: 400, statusText: "x" });

    expect(error).toHaveBeenCalledWith("Name is required");
  });
});
