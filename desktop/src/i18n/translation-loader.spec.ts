import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { TranslationLoader } from "./translation-loader";
import { TranslationService } from "./translation.service";

describe("TranslationLoader", () => {
  let loader: TranslationLoader;
  let service: TranslationService;
  let http: HttpTestingController;

  const flush = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    loader = TestBed.inject(TranslationLoader);
    service = TestBed.inject(TranslationService);
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("loads the registry, keeps English first and ignores malformed lines", async () => {
    const done = loader.loadRegistry();
    http.expectOne("assets/i18n/languages.json").flush([{ code: "pl", label: "Polski", locale: "pl" }, { code: "../x" }, { code: "en", label: "English", locale: "en-US" }]);
    await done;

    expect(service.languages().map((language) => language.code)).toEqual(["en", "pl"]);
  });

  it("loads a dictionary once and registers it", async () => {
    service.setLanguages([...service.languages(), { code: "pl", label: "Polski", locale: "pl" }]);

    const first = loader.ensure("pl");
    const second = loader.ensure("pl");
    http.expectOne("assets/i18n/pl.json").flush({ messages: { Dashboard: "Pulpit" } });

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(await loader.ensure("pl")).toBe(true);
    http.verify();

    service.choose("pl");
    expect(service.t("Dashboard")).toBe("Pulpit");
  });

  it("stays in English, without throwing, when a dictionary fails to load", async () => {
    service.setLanguages([...service.languages(), { code: "pl", label: "Polski", locale: "pl" }]);

    const result = loader.ensure("pl");
    http.expectOne("assets/i18n/pl.json").flush("nope", { status: 404, statusText: "Not Found" });

    expect(await result).toBe(false);
    expect(service.isRegistered("pl")).toBe(false);
    expect(service.t("Dashboard")).toBe("Dashboard");
  });

  it("rejects a file that is not a dictionary", async () => {
    const result = loader.ensure("pl");
    http.expectOne("assets/i18n/pl.json").flush({ hello: "world" });

    expect(await result).toBe(false);
  });

  it("initializes by loading the registry and the cached language", async () => {
    localStorage.setItem("cartvibe.language", "pl");
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fresh = TestBed.inject(TranslationLoader);
    const freshHttp = TestBed.inject(HttpTestingController);

    const done = fresh.initialize();
    freshHttp.expectOne("assets/i18n/languages.json").flush([{ code: "pl", label: "Polski", locale: "pl" }]);
    await flush();
    freshHttp.expectOne("assets/i18n/pl.json").flush({ messages: {} });
    await done;

    expect(TestBed.inject(TranslationService).isRegistered("pl")).toBe(true);
  });
});
