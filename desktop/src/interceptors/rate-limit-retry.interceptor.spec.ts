import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { SnackbarService } from "../services";
import { httpInterceptor, QUIET_ERRORS } from "./http-interceptor";
import { RATE_LIMIT_RETRY_DELAYS, rateLimitRetryInterceptor } from "./rate-limit-retry.interceptor";

import type { MockInstance } from "vitest";

describe("rateLimitRetryInterceptor", () => {
  let httpTestingController: HttpTestingController;
  let httpClient: HttpClient;
  let errorSpy: MockInstance;

  /** What the server answers over its request limit: plain text, not the API's JSON. */
  const refuse = (url: string): void =>
    httpTestingController.expectOne(url).flush("<html>429 Too Many Requests</html>", { status: 429, statusText: "Too Many Requests" });

  beforeEach(() => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [
        // The order of the app: the toast is the outer one.
        provideHttpClient(withInterceptors([httpInterceptor, rateLimitRetryInterceptor])),
        provideHttpClientTesting(),
                { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      ],
    });

    httpTestingController = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    errorSpy = vi.spyOn(TestBed.inject(SnackbarService), "error").mockImplementation(() => {});
  });

  afterEach(() => {
    httpTestingController.verify();
    vi.useRealTimers();
  });

  it("sends a refused request again after a second, without a word", () => {
    let body: unknown;
    httpClient.get("/api/overview/group/1").subscribe((answer) => (body = answer));

    refuse("/api/overview/group/1");
    httpTestingController.expectNone("/api/overview/group/1");

    vi.advanceTimersByTime(RATE_LIMIT_RETRY_DELAYS[0]);
    httpTestingController.expectOne("/api/overview/group/1").flush({ total: "12.00" });

    expect(body).toEqual({ total: "12.00" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("sends a refused write again too: it never reached the API", () => {
    let body: unknown;
    httpClient.post("/api/receipt/group/1", { page: 1 }).subscribe((answer) => (body = answer));

    refuse("/api/receipt/group/1");
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_DELAYS[0]);
    const second = httpTestingController.expectOne("/api/receipt/group/1");

    expect(second.request.body).toEqual({ page: 1 });
    second.flush({ data: [], totalCount: 0 });
    expect(body).toEqual({ data: [], totalCount: 0 });
  });

  it("gives up after the third refusal and says so once", () => {
    let status: number | undefined;
    httpClient.get("/api/tag").subscribe({ error: (error) => (status = error.status) });

    refuse("/api/tag");
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_DELAYS[0]);
    refuse("/api/tag");
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_DELAYS[1]);
    refuse("/api/tag");
    vi.advanceTimersByTime(10_000);

    expect(status).toBe(429);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("Too many requests at once. Try again in a moment.");
  });

  it("leaves a 429 the API wrote itself alone: that is an answer", () => {
    let status: number | undefined;
    httpClient.post("/api/login", {}).subscribe({ error: (error) => (status = error.status) });

    httpTestingController
      .expectOne("/api/login")
      .flush({ errorMsg: "Too many attempts. Try again in a minute." }, { status: 429, statusText: "Too Many Requests" });
    vi.advanceTimersByTime(10_000);

    expect(status).toBe(429);
    expect(errorSpy).toHaveBeenCalledWith("Too many attempts. Try again in a minute.");
  });

  it("does not retry any other failure", () => {
    let status: number | undefined;
    httpClient.get("/api/tag").subscribe({ error: (error) => (status = error.status) });

    httpTestingController.expectOne("/api/tag").flush({}, { status: 500, statusText: "Server Error" });
    vi.advanceTimersByTime(10_000);

    expect(status).toBe(500);
  });

  it("leaves background work alone: it has its own retry", () => {
    let status: number | undefined;
    httpClient
      .post("/api/shoppingList/1/item", {}, { context: new HttpContext().set(QUIET_ERRORS, true) })
      .subscribe({ error: (error) => (status = error.status) });

    refuse("/api/shoppingList/1/item");
    vi.advanceTimersByTime(10_000);

    expect(status).toBe(429);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
