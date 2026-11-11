import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { AuthStore } from "../store/auth.store";
import { LanguageSyncService } from "./language-sync.service";
import { TranslationService } from "./translation.service";
import { seedStore } from "../testing/seed-store";

describe("LanguageSyncService", () => {
  let service: LanguageSyncService;
  let translation: TranslationService;
  let http: HttpTestingController;

  const settle = async () => {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    translation = TestBed.inject(TranslationService);
    translation.setLanguages([...translation.languages(), { code: "pl", label: "Polski", locale: "pl" }]);
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    service = TestBed.inject(LanguageSyncService);
  });

  it("stays English with nobody signed in, and drops a stale cache", async () => {
    localStorage.setItem("cartvibe.language", "pl");
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    const fresh = TestBed.inject(TranslationService);
    TestBed.inject(LanguageSyncService);
    await settle();

    expect(fresh.language()).toBe("en");
    expect(localStorage.getItem("cartvibe.language")).toBeNull();
  });

  it("loads the account language, then switches once", async () => {
    TestBed.inject(AuthStore).setUserPreferences({ language: "pl" } as never);
    await settle();

    expect(translation.language()).toBe("en");
    http.expectOne("assets/i18n/pl.json").flush({ messages: { Dashboard: "Pulpit" } });
    await settle();

    expect(translation.language()).toBe("pl");
    expect(translation.t("Dashboard")).toBe("Pulpit");
  });

  it("stays English when the account language fails to load", async () => {
    TestBed.inject(AuthStore).setUserPreferences({ language: "pl" } as never);
    await settle();
    http.expectOne("assets/i18n/pl.json").flush("", { status: 500, statusText: "Server Error" });
    await settle();

    expect(translation.language()).toBe("en");
  });

  it("goes back to English and clears the cache when the preferences go away (logout)", async () => {
    translation.register("pl", { messages: {} });
    TestBed.inject(AuthStore).setUserPreferences({ language: "pl" } as never);
    await settle();
    expect(translation.language()).toBe("pl");

    seedStore(TestBed.inject(AuthStore), { userPreferences: undefined });
    await settle();

    expect(translation.language()).toBe("en");
    expect(localStorage.getItem("cartvibe.language")).toBeNull();
  });
});
