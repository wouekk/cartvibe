import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { registerRealLanguages } from "../../i18n/i18n-test-utils";
import { TranslationService } from "../../i18n/translation.service";
import { AuthState } from "../../store/auth.state";
import { SetUserPreferences } from "../../store/auth.state.actions";
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
      imports: [LanguageSettingComponent, NgxsModule.forRoot([AuthState])],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    translation = TestBed.inject(TranslationService);
    registerRealLanguages(translation);
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Store).dispatch(new SetUserPreferences({ language: "en" } as never));
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
});
