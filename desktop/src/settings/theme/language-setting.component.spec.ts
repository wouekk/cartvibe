import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { registerRealLanguages } from "../../i18n/i18n-test-utils";
import { TranslationService } from "../../i18n/translation.service";
import { AuthStore } from "../../store/auth.store";
import { LanguageSettingComponent } from "./language-setting.component";

describe("LanguageSettingComponent", () => {
  let fixture: ComponentFixture<LanguageSettingComponent>;
  let translation: TranslationService;
  let http: HttpTestingController;

  const el = (testId: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LanguageSettingComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    translation = TestBed.inject(TranslationService);
    registerRealLanguages(translation);
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).setUserPreferences({ language: "en" } as never);
    fixture = TestBed.createComponent(LanguageSettingComponent);
    await settle();
  });

  it("lists every registered language by its own name, with a check on the active one", () => {
    expect(el("language-en").textContent).toContain("English");
    expect(el("language-pl").textContent).toContain("Polski");
    expect(el("language-en").getAttribute("aria-checked")).toBe("true");
    expect(el("language-pl").getAttribute("aria-checked")).toBe("false");
  });

  it("switches at once and saves the choice with the account", async () => {
    el("language-pl").click();
    await settle();

    expect(translation.language()).toBe("pl");
    expect(el("language-pl").getAttribute("aria-checked")).toBe("true");
    expect(fixture.nativeElement.textContent).toContain("Język");

    const request = http.expectOne((candidate) => candidate.method === "PUT" && candidate.url.includes("userPreferences"));
    expect(request.request.body.language).toBe("pl");
  });

  it("follows the interface language for the AI until another one is picked", () => {
    expect(el("ai-language-same").getAttribute("aria-checked")).toBe("true");
    expect(el("ai-language-pl").getAttribute("aria-checked")).toBe("false");
  });

  it("saves the AI language with the account and shows it once saved, leaving the interface language alone", async () => {
    el("ai-language-pl").click();
    await settle();

    const request = http.expectOne((candidate) => candidate.method === "PUT" && candidate.url.includes("userPreferences"));
    expect(request.request.body.aiLanguage).toBe("pl");
    expect(request.request.body.language).toBe("en");
    request.flush({ language: "en", aiLanguage: "pl" });
    await settle();

    expect(el("ai-language-pl").getAttribute("aria-checked")).toBe("true");
    expect(el("ai-language-same").getAttribute("aria-checked")).toBe("false");
    expect(translation.language()).toBe("en");
  });

  it("goes back to following the interface language", async () => {
    TestBed.inject(AuthStore).setUserPreferences({ language: "en", aiLanguage: "de" } as never);
    await settle();

    el("ai-language-same").click();
    await settle();

    const request = http.expectOne((candidate) => candidate.method === "PUT" && candidate.url.includes("userPreferences"));
    expect(request.request.body.aiLanguage).toBe("");
  });
});
