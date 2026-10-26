import { HttpClient, provideHttpClient, withInterceptors } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { SERVICE_WORKER_BYPASS_HEADER, serviceWorkerBypassInterceptor } from "./service-worker-bypass.interceptor";

describe("serviceWorkerBypassInterceptor", () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([serviceWorkerBypassInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it("sends API calls, uploads included, past the service worker", () => {
    http.post("/api/receipt/quickScan", new FormData()).subscribe();
    http.get("/api/feature-config").subscribe();

    expect(controller.expectOne("/api/receipt/quickScan").request.headers.get(SERVICE_WORKER_BYPASS_HEADER)).toBe("true");
    expect(controller.expectOne("/api/feature-config").request.headers.has(SERVICE_WORKER_BYPASS_HEADER)).toBe(true);
  });

  it("leaves the app's own files to the service worker cache", () => {
    http.get("/assets/brand/logo.svg").subscribe();
    http.get("/assets/i18n/apis.json").subscribe();

    expect(controller.expectOne("/assets/brand/logo.svg").request.headers.has(SERVICE_WORKER_BYPASS_HEADER)).toBe(false);
    expect(controller.expectOne("/assets/i18n/apis.json").request.headers.has(SERVICE_WORKER_BYPASS_HEADER)).toBe(false);
  });
});
