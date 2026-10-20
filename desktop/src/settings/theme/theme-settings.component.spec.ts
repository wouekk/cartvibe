import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ThemeService } from "../../theme/theme.service";
import { ThemeSettingsComponent } from "./theme-settings.component";

describe("ThemeSettingsComponent", () => {
  let fixture: ComponentFixture<ThemeSettingsComponent>;
  let theme: ThemeService;

  const el = (testId: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ThemeSettingsComponent],
      providers: [provideZonelessChangeDetection()],
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
    expect(el("theme-mode-light").textContent).toContain("Light");
    expect(el("theme-mode-dark").textContent).toContain("Dark");
    expect(el("theme-mode-system").getAttribute("aria-checked")).toBe("true");
    expect(el("theme-mode-system").textContent).toContain("check");
    expect(el("theme-mode-dark").textContent).not.toContain("check");
  });

  it("switches the mode when one is picked", async () => {
    el("theme-mode-dark").click();
    await fixture.whenStable();

    expect(theme.mode()).toBe("dark");
    expect(el("theme-mode-dark").getAttribute("aria-checked")).toBe("true");
    expect(el("theme-mode-dark").textContent).toContain("check");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("offers the five accents, none of them orange, and switches on a click", async () => {
    for (const key of ["classic", "emerald", "violet", "brown", "graphite"]) {
      expect(el("theme-accent-" + key)).not.toBeNull();
    }
    expect(fixture.nativeElement.querySelectorAll(".swatch").length).toBe(5);

    el("theme-accent-graphite").click();
    await fixture.whenStable();

    expect(theme.accent()).toBe("graphite");
    expect(el("theme-accent-graphite").getAttribute("aria-checked")).toBe("true");
    expect(el("theme-accent-name").textContent).toContain("Graphite Gray");
  });
});
