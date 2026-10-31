import { HttpBackend, HttpClient, HttpErrorResponse, HttpResponse, HttpXhrBackend, provideHttpClient, withXhr } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { firstValueFrom, of } from "rxjs";
import { DemoHttpBackend } from "./demo-http-backend";

describe("DemoHttpBackend", () => {
  let http: HttpClient;
  let xhr: { handle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    xhr = { handle: vi.fn(() => of(new HttpResponse({ status: 200, body: { ok: true } }))) };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        { provide: HttpXhrBackend, useValue: xhr },
        DemoHttpBackend,
        { provide: HttpBackend, useExisting: DemoHttpBackend },
      ],
    });
    http = new HttpClient(TestBed.inject(HttpBackend));
  });

  it("lets a same-origin file (a translation dictionary) through to the static server", async () => {
    await expect(firstValueFrom(http.get("assets/i18n/pl.json"))).resolves.toEqual({ ok: true });
    expect(xhr.handle).toHaveBeenCalledTimes(1);
  });

  it("stops a request to another origin before it leaves, so Open Food Facts is offline in the demo", async () => {
    const error = await firstValueFrom(http.get("https://world.openfoodfacts.org/api/v2/product/5449000000996.json")).catch(
      (e: HttpErrorResponse) => e,
    );

    expect((error as HttpErrorResponse).status).toBe(0);
    expect(xhr.handle).not.toHaveBeenCalled();
  });
});
