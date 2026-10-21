import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ThemeService } from "../../theme/theme.service";
import { ThemeSettingsComponent } from "./theme-settings.component";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NgxsModule } from "@ngxs/store";
import { AuthState } from "../../store/auth.state";

describe("ThemeSettingsComponent", () => {
  let fixture: ComponentFixture<ThemeSettingsComponent>;
  let theme: ThemeService;

  const el = (testId: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ThemeSettingsComponent, NgxsModule.forRoot([AuthState])],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    theme = TestBed.inject(ThemeService);
    fixture = TestBed.createComponent(ThemeSettingsComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  it("lists System, Light and Dark with a check on the active one", () => {
    expect(el("theme-mode-system").textContent).toContain("System");
    expect(el("theme-mode-light").textContent).toContain("White");
    expect(el("theme-mode-dark").textContent).toContain("Black");
    expect(el("theme-mode-system").getAttribute("aria-checked")).toBe("true");
    expect(el("theme-mode-system").querySelector("app-icon[name=check]")).not.toBeNull();
    expect(el("theme-mode-dark").querySelector("app-icon[name=check]")).toBeNull();
  });

  it("switches the mode when one is picked", async () => {
    el("theme-mode-dark").click();
    await fixture.whenStable();

    expect(theme.mode()).toBe("dark");
    expect(el("theme-mode-dark").getAttribute("aria-checked")).toBe("true");
    expect(el("theme-mode-dark").querySelector("app-icon[name=check]")).not.toBeNull();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
