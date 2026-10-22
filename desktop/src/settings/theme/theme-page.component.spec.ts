import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NgxsModule } from "@ngxs/store";
import { AuthState } from "../../store/auth.state";
import { LanguagePageComponent } from "./language-page.component";
import { ThemePageComponent } from "./theme-page.component";

describe("Theme and Language pages", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ThemePageComponent, LanguagePageComponent, NgxsModule.forRoot([AuthState])],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  it("puts the theme choice, and nothing else, on the Theme page", async () => {
    const fixture = TestBed.createComponent(ThemePageComponent);
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;

    expect(page.querySelector("h1")?.textContent).toContain("Theme");
    expect(page.querySelector('[data-testid="theme-mode-card"]')).not.toBeNull();
    expect(page.querySelector('[data-testid="language-row"]')).toBeNull();
  });

  it("puts the language choice on a page of its own", async () => {
    const fixture = TestBed.createComponent(LanguagePageComponent);
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;

    expect(page.querySelector("h1")?.textContent).toContain("Language");
    expect(page.querySelector('[data-testid="language-row"]')).not.toBeNull();
    expect(page.querySelector('[data-testid="theme-mode-card"]')).toBeNull();
  });
});
