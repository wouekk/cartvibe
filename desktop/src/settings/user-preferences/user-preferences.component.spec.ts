import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { of } from "rxjs";
import { InputReadonlyPipe } from "src/pipes/input-readonly.pipe";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { Permission, UserPreferences, UserPreferencesService } from "../../open-api";
import { AuthStore } from "../../store/auth.store";

import { UserPreferencesComponent } from "./user-preferences.component";
import { seedStore } from "../../testing/seed-store";

describe("UserPreferencesComponent", () => {
  let component: UserPreferencesComponent;
  let fixture: ComponentFixture<UserPreferencesComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [
        ReactiveFormsModule,
                SharedUiModule,
        UserPreferencesComponent, InputReadonlyPipe
    ],
    providers: [
        UserPreferencesService,
        {
            provide: ActivatedRoute,
            useValue: { snapshot: { data: { formConfig: {} } } },
        },
        {
            provide: Router,
            useValue: { navigate: vi.fn().mockResolvedValue(true) },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});
    fixture = TestBed.createComponent(UserPreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("gates the edit button on app.user-preferences.update", () => {

    TestBed.inject(AuthStore).setPermissions([], {});
    expect((component as any).canEdit()).toEqual(false);

    TestBed.inject(AuthStore).setPermissions([Permission.AppUserPreferencesUpdate], {});
    expect((component as any).canEdit()).toEqual(true);
  });

  it("should init form correctly without data", () => {
    component.ngOnInit();

    expect(component.form.value).toEqual({
      quickScanDefaultPaidById: "",
      quickScanDefaultGroupId: "",
      quickScanDefaultStatus: "",
      monthlySpendingGoal: "",
      closeChipSelectOnSelect: false,
      region: "browser",
      warrantyPeriodYears: "automatic",
      warrantyReminderLeadDays: "30",
    });
  });

  it("should init form with user preference data", () => {
    seedStore(TestBed.inject(AuthStore), {
      userPreferences: {
        quickScanDefaultPaidById: "1",
        quickScanDefaultGroupId: "2",
        quickScanDefaultStatus: "OPEN",
        closeChipSelectOnSelect: true,
      },
    });
    component.ngOnInit();

    expect(component.form.value).toEqual({
      quickScanDefaultPaidById: "1",
      quickScanDefaultGroupId: "2",
      quickScanDefaultStatus: "OPEN",
      monthlySpendingGoal: "",
      closeChipSelectOnSelect: true,
      region: "browser",
      warrantyPeriodYears: "automatic",
      warrantyReminderLeadDays: "30",
    });
  });

  it("should attempt to call update endpoint", () => {
    const userPreference: UserPreferences = {
      quickScanDefaultPaidById: 1,
      quickScanDefaultGroupId: 2,
      quickScanDefaultStatus: "OPEN",
    } as UserPreferences;
    const serviceSpy = vi.spyOn(
      TestBed.inject(UserPreferencesService),
      "updateUserPreferences"
    ).mockReturnValue(of(userPreference) as any);

    component.ngOnInit();
    component.form.patchValue(userPreference);
    component.submit();

    expect(serviceSpy).toHaveBeenCalledWith(component.form.value);
    // The session keeps what the server answered, so the rest of the app follows without a reload.
    expect(TestBed.inject(AuthStore).userPreferences()).toEqual(userPreference);
  });

  it("should attempt to call update endpoint with nulls", () => {
    // Reset store state to ensure clean test
    seedStore(TestBed.inject(AuthStore), {
      userPreferences: undefined,
    });

    const serviceSpy = vi.spyOn(
      TestBed.inject(UserPreferencesService),
      "updateUserPreferences"
    ).mockReturnValue(of(undefined as any));

    component.ngOnInit();
    component.submit();

    expect(serviceSpy).toHaveBeenCalledWith({
      quickScanDefaultPaidById: null,
      quickScanDefaultGroupId: null,
      quickScanDefaultStatus: "",
      monthlySpendingGoal: null,
      displayCurrency: "",
      displayCurrencyRate: null,
      closeChipSelectOnSelect: false,
      region: "",
      warrantyPeriodYears: null,
      warrantyReminderLeadDays: 30,
    } as any);
  });

  describe("the warranty settings", () => {
    it("shows what Automatic resolves to for the region and saves numbers", () => {
      seedStore(TestBed.inject(AuthStore), { userPreferences: { region: "PL", warrantyPeriodYears: 3, warrantyReminderLeadDays: 7 } });
      const serviceSpy = vi
        .spyOn(TestBed.inject(UserPreferencesService), "updateUserPreferences")
        .mockReturnValue(of(undefined as any));

      component.ngOnInit();
      expect(component.periodOptions()[0].displayValue).toBe("Automatic (2 years)");
      component.form.get("region")?.setValue("US");
      expect(component.periodOptions()[0].displayValue).toBe("Automatic (1 year)");

      component.submit();
      expect(serviceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ region: "US", warrantyPeriodYears: 3, warrantyReminderLeadDays: 7 })
      );
    });
  });

  describe("the Dashboard currency", () => {
    it("is no longer a preference: no field, and saving clears one an older version stored", () => {
      seedStore(TestBed.inject(AuthStore), { userPreferences: { displayCurrency: "PLN", displayCurrencyRate: "4.25" } });
      const serviceSpy = vi
        .spyOn(TestBed.inject(UserPreferencesService), "updateUserPreferences")
        .mockReturnValue(of({} as any));

      component.ngOnInit();
      expect(component.form.get("displayCurrency")).toBeNull();
      component.submit();

      expect(serviceSpy).toHaveBeenCalledWith(expect.objectContaining({ displayCurrency: "", displayCurrencyRate: null }));
    });
  });

  it("has no shortcut list: a stored one from an older version is neither shown nor sent back", () => {
    seedStore(TestBed.inject(AuthStore), {
      userPreferences: { userShortcuts: [{ id: 1, name: "Test", url: "test", icon: "icon" }] },
    });
    const serviceSpy = vi
      .spyOn(TestBed.inject(UserPreferencesService), "updateUserPreferences")
      .mockReturnValue(of({} as any));

    component.ngOnInit();
    expect(component.form.get("userShortcuts")).toBeNull();
    component.submit();

    expect(Object.keys(serviceSpy.mock.calls[0][0] as object)).not.toContain("userShortcuts");
  });
});
