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
    document.documentElement.removeAttribute("data-palette");
  });

  it("lists System, Day and Night with a check on the active one", () => {
    expect(el("theme-mode-system").textContent).toContain("System");
    expect(el("theme-mode-light").textContent).toContain("Day");
    expect(el("theme-mode-dark").textContent).toContain("Night");
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

  it("lists the five palettes, each with a swatch, and Zinc is the one showing at first", () => {
    for (const [key, label] of [["blue", "Blue"], ["zinc", "Zinc"], ["indigo", "Indigo"], ["emerald", "Emerald"], ["violet", "Violet"]]) {
      expect(el(`theme-palette-${key}`).textContent).toContain(label);
      expect(el(`theme-palette-${key}`).querySelector(`app-palette-swatch[data-palette=${key}]`)).not.toBeNull();
    }
    expect(el("theme-palette-zinc").getAttribute("aria-checked")).toBe("true");
    expect(el("theme-palette-zinc").querySelector("app-icon[name=check]")).not.toBeNull();
    expect(el("theme-palette-indigo").getAttribute("aria-checked")).toBe("false");
  });

  it("switches the palette when one is picked and leaves the mode alone", async () => {
    el("theme-mode-dark").click();
    await fixture.whenStable();

    el("theme-palette-indigo").click();
    await fixture.whenStable();

    expect(theme.palette()).toBe("indigo");
    expect(theme.mode()).toBe("dark");
    expect(document.documentElement.getAttribute("data-palette")).toBe("indigo");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(el("theme-palette-indigo").getAttribute("aria-checked")).toBe("true");
    expect(el("theme-palette-zinc").getAttribute("aria-checked")).toBe("false");
    expect(el("theme-palette-indigo").querySelector("app-icon[name=check]")).not.toBeNull();
  });
});
