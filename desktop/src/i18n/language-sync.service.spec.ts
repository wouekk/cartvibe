import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { AuthState } from "../store/auth.state";
import { SetUserPreferences } from "../store/auth.state.actions";
import { LanguageSyncService } from "./language-sync.service";
import { TranslationService } from "./translation.service";

describe("LanguageSyncService", () => {
  let service: LanguageSyncService;
  let translation: TranslationService;
  let store: Store;
  let http: HttpTestingController;

  const settle = async () => {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([AuthState])],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    translation = TestBed.inject(TranslationService);
    translation.setLanguages([...translation.languages(), { code: "pl", label: "Polski", locale: "pl" }]);
    store = TestBed.inject(Store);
    http = TestBed.inject(HttpTestingController);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    service = TestBed.inject(LanguageSyncService);
  });

  it("stays English with nobody signed in, and drops a stale cache", async () => {
    localStorage.setItem("cartvibe.language", "pl");
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([AuthState])],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    const fresh = TestBed.inject(TranslationService);
    TestBed.inject(LanguageSyncService);
    await settle();

    expect(fresh.language()).toBe("en");
    expect(localStorage.getItem("cartvibe.language")).toBeNull();
  });

  it("loads the account language, then switches once", async () => {
    store.dispatch(new SetUserPreferences({ language: "pl" } as never));
    await settle();

    expect(translation.language()).toBe("en");
    http.expectOne("assets/i18n/pl.json").flush({ messages: { Dashboard: "Pulpit" } });
    await settle();

    expect(translation.language()).toBe("pl");
    expect(translation.t("Dashboard")).toBe("Pulpit");
  });

  it("stays English when the account language fails to load", async () => {
    store.dispatch(new SetUserPreferences({ language: "pl" } as never));
    await settle();
    http.expectOne("assets/i18n/pl.json").flush("", { status: 500, statusText: "Server Error" });
    await settle();

    expect(translation.language()).toBe("en");
  });

  it("goes back to English and clears the cache when the preferences go away (logout)", async () => {
    translation.register("pl", { messages: {} });
    store.dispatch(new SetUserPreferences({ language: "pl" } as never));
    await settle();
    expect(translation.language()).toBe("pl");

    store.reset({ ...store.snapshot(), auth: { ...store.snapshot().auth, userPreferences: undefined } });
    await settle();

    expect(translation.language()).toBe("en");
    expect(localStorage.getItem("cartvibe.language")).toBeNull();
  });
});
