import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { AppDialog, AppDialogRef } from "../dialog/app-dialog";
import { registerRealLanguages } from "../i18n/i18n-test-utils";
import { TranslationService } from "../i18n/translation.service";
import { Permission, SystemSettingsService, UserPreferencesService } from "../open-api";
import { AuthStore } from "../store/auth.store";
import { SystemSettingsStore } from "../store/system-settings.store";
import { ThemeService } from "../theme/theme.service";
import { OnboardingService } from "./onboarding.service";
import { WelcomeDialogComponent } from "./welcome-dialog.component";

describe("WelcomeDialogComponent", () => {
  let fixture: ComponentFixture<WelcomeDialogComponent>;
  const close = vi.fn();
  const updateUserPreferences = vi.fn();
  const getSystemSettings = vi.fn();
  const updateSystemSettings = vi.fn();

  const element = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  const create = async (permissions: string[] = []) => {
    TestBed.inject(AuthStore).setPermissions(permissions, {});
    fixture = TestBed.createComponent(WelcomeDialogComponent);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    window.localStorage.clear();
    close.mockReset();
    updateUserPreferences.mockReset().mockImplementation((body) => of(body));
    getSystemSettings.mockReset().mockReturnValue(of({ id: 1, currencyDisplay: " €", timeZone: "UTC" }));
    updateSystemSettings.mockReset().mockImplementation((body) => of(body));

    await TestBed.configureTestingModule({
      imports: [WelcomeDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppDialogRef, useValue: { close } },
        { provide: UserPreferencesService, useValue: { updateUserPreferences } },
        { provide: SystemSettingsService, useValue: { getSystemSettings, updateSystemSettings } },
      ],
    }).compileComponents();

    registerRealLanguages(TestBed.inject(TranslationService));
    TestBed.inject(AuthStore).setUserPreferences({ id: 1, userId: 7, language: "en", onboardingPending: true } as never);
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-palette");
  });

  it("offers language and theme to everyone, and the currency only to an admin", async () => {
    await create();
    expect(element("welcome-language")).not.toBeNull();
    expect(element("welcome-theme")).not.toBeNull();
    expect(element("welcome-currency")).toBeNull();

    await create([Permission.AppSystemSettingsUpdate]);
    expect(element("welcome-currency")).not.toBeNull();
    expect(element("welcome-currency-EUR")).not.toBeNull();
    expect(element("welcome-currency-PLN")).not.toBeNull();
  });

  it("applies a mode at once", async () => {
    await create();

    element("welcome-theme-dark")?.click();
    await fixture.whenStable();

    expect(TestBed.inject(ThemeService).mode()).toBe("dark");
  });

  it("applies a palette at once and keeps the mode", async () => {
    await create();
    for (const key of ["zinc", "blue", "indigo", "emerald", "violet"]) {
      expect(element(`welcome-palette-${key}`)).not.toBeNull();
    }

    element("welcome-theme-dark")?.click();
    await fixture.whenStable();
    element("welcome-palette-emerald")?.click();
    await fixture.whenStable();

    const theme = TestBed.inject(ThemeService);
    expect(theme.palette()).toBe("emerald");
    expect(theme.mode()).toBe("dark");
  });

  it("ends the welcome on Get started and keeps the household currency when it was not changed", async () => {
    await create([Permission.AppSystemSettingsUpdate]);

    element("welcome-start")?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));

    expect(updateSystemSettings).not.toHaveBeenCalled();
    expect(updateUserPreferences).toHaveBeenCalledWith(expect.objectContaining({ onboardingPending: false, language: "en" }));
    expect(TestBed.inject(AuthStore).userPreferences()?.onboardingPending).toBe(false);
    expect(close).toHaveBeenCalledWith(true);
  });

  it("saves a picked currency with the rest of the settings", async () => {
    await create([Permission.AppSystemSettingsUpdate]);

    element("welcome-currency-PLN")?.click();
    await fixture.whenStable();
    element("welcome-start")?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));

    expect(updateSystemSettings).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, timeZone: "UTC", currencyDisplay: " zł", currencySymbolPosition: "END" })
    );
    expect(TestBed.inject(SystemSettingsStore).currencyDisplay()).toBe(" zł");
    expect(close).toHaveBeenCalledWith(true);
  });
});

describe("OnboardingService", () => {
  const open = vi.fn();

  beforeEach(() => {
    open.mockReset();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: AppDialog, useValue: { open } }],
    });
  });

  it("opens the welcome once for an account that has it pending, and not for others", () => {
    TestBed.inject(OnboardingService);

    TestBed.inject(AuthStore).setUserPreferences({ id: 1, userId: 3, onboardingPending: false } as never);
    TestBed.tick();
    expect(open).not.toHaveBeenCalled();

    TestBed.inject(AuthStore).setUserPreferences({ id: 2, userId: 7, onboardingPending: true } as never);
    TestBed.tick();
    TestBed.inject(AuthStore).setUserPreferences({ id: 2, userId: 7, onboardingPending: true, language: "pl" } as never);
    TestBed.tick();

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe(WelcomeDialogComponent);
    expect(open.mock.calls[0][1].disableClose).toBe(true);
  });
});
