import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of, Subject, throwError } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { AutocompleteModule } from "../../autocomplete/autocomplete.module";
import { CheckboxModule } from "../../checkbox/checkbox.module";
import { InputModule } from "../../input/index";
import { FormMode } from "../../enums/form-mode.enum";
import { CurrencySeparator, CurrencySymbolPosition, FeatureConfigService, QueueName, ShopLogoService, SystemSettingsService } from "../../open-api";
import { PipesModule } from "../../pipes";
import { CustomCurrencyPipe } from "../../pipes/custom-currency.pipe";
import { SnackbarService } from "../../services";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AuthState } from "../../store/auth.state";
import { SystemSettingsState } from "../../store/system-settings.state";
import { SetTimeZone } from "../../store/system-settings.state.actions";
import { TaskQueueFormControlPipe } from "../pipes/task-queue-form-control.pipe";

import { SystemSettingsFormComponent } from "./system-settings-form.component";
import { SAVED_KEY_PLACEHOLDER } from "../../ai-settings/ai-settings-shared";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("SystemSettingsFormComponent", () => {
  let component: SystemSettingsFormComponent;
  let fixture: ComponentFixture<SystemSettingsFormComponent>;
  let store: Store;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SystemSettingsFormComponent, CustomCurrencyPipe, TaskQueueFormControlPipe],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [AutocompleteModule,
        CheckboxModule,
        InputModule,
        NgxsModule.forRoot([SystemSettingsState, AuthState]),
        PipesModule,
        ReactiveFormsModule,
        SharedUiModule],
    providers: [
        provideZonelessChangeDetection(),
        CustomCurrencyPipe,
        {
            provide: ActivatedRoute,
            useValue: {
                snapshot: {
                    data: {
                        allReceiptProcessingSettings: [],
                        systemSettings: {
                            taskQueueConfigurations: [
                                { name: "quick_scan", priority: 1 }
                            ]
                        },
                        formConfig: {}
                    }
                }
            }
        },
        { provide: Router, useValue: { navigate: jest.fn().mockResolvedValue(true) } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
})
      .compileComponents();

    store = TestBed.inject(Store);
    fixture = TestBed.createComponent(SystemSettingsFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("layout contracts", () => {
    // Both classes below are load-bearing and silently droppable: nothing fails
    // to compile without them, the page just goes back to overlapping itself.
    it("marks both duration rows so the flex-basis rule can reach them", () => {
      const rows: NodeListOf<HTMLElement> =
        fixture.nativeElement.querySelectorAll("[data-testid=duration-row]");

      // Session and temporary files. `.duration-row > *` in the component's SCSS is
      // what bases each column at 0; without the class they fall back to
      // flex-basis: auto and the hinted column swallows the row.
      expect(rows.length).toEqual(2);
      rows.forEach((row) => expect(row.classList).toContain("flex"));
    });

    it("pairs every host margin with block", () => {
      const hosts: NodeListOf<HTMLElement> =
        fixture.nativeElement.querySelectorAll("app-checkbox.mb-4, app-input.mb-4");

      // app-checkbox and app-input have no :host { display: block }, so a bare
      // mb-3 on the host is an inline element's vertical margin — it does (sections space their children with gap, so there may be none)
      // nothing at all until d-block comes with it.
      hosts.forEach((host) => expect(host.classList).toContain("block"));
    });
  });

  it("init form with no data", () => {
    component.ngOnInit();

    expect(component.form.value).toEqual({
      enableLocalSignUp: null,
      debugOcr: null,
      currencyDisplay: null,
      receiptProcessingSettingsId: null,
      fallbackReceiptProcessingSettingsId: null,
      currencyThousandthsSeparator: null,
      currencyDecimalSeparator: null,
      currencySymbolPosition: null,
      currencyHideDecimalPlaces: null,
      // Nothing stored matches a preset, so the raw fields show.
      currency: "CUSTOM",
      // Unset on the wire (an older server): seeds the server's own default.
      timeZone: "UTC",
      pdfDpi: null,
      taskConcurrency: null,
      taskQueueConfigurations: [
        { name: "quick_scan", priority: 1 }
      ],
      mcpEnabled: null,
      mcpPublicUrl: null,
      serverPublicUrl: null,
      // Unset on the wire (an older server): seeds the server's own default, off.
      secureCookies: false,
      shopLogoKey: "",
      // With no stored value, splitHours falls back to the 24h default and
      // renders it as the friendlier "1 Days".
      refreshTokenValidForValue: 1,
      refreshTokenValidForUnit: "DAYS",
      mcpRefreshTokenValidForValue: 1,
      mcpRefreshTokenValidForUnit: "DAYS",
      // Unset on the wire, so it renders its own 720h default rather than
      // splitHours' generic 24h fallback.
      tempFileRetentionValue: 30,
      tempFileRetentionUnit: "DAYS",
    });
  });

  it("fills the currency format from a picked currency, and shows the raw fields only for Custom", () => {
    component.ngOnInit();
    expect(component.isCustomCurrency()).toBe(true);

    component.form.get("currency")?.setValue("EUR");

    expect(component.isCustomCurrency()).toBe(false);
    expect(component.form.getRawValue()).toEqual(
      expect.objectContaining({
        currencyDisplay: " €",
        currencySymbolPosition: CurrencySymbolPosition.End,
        currencyThousandthsSeparator: CurrencySeparator.Period,
        currencyDecimalSeparator: CurrencySeparator.Comma,
        currencyHideDecimalPlaces: false,
      })
    );
  });

  it("init form with data", () => {
    const activatedRoute = TestBed.inject(ActivatedRoute);
    activatedRoute.snapshot.data["systemSettings"] = {
      enableLocalSignUp: true,
      debugOcr: true,
      currencyDisplay: "USD",
      receiptProcessingSettingsId: 1,
      fallbackReceiptProcessingSettingsId: 2,
      currencyThousandthsSeparator: CurrencySeparator.Comma,
      currencyDecimalSeparator: CurrencySeparator.Period,
      currencySymbolPosition: CurrencySymbolPosition.Start,
      currencyHideDecimalPlaces: true,
      timeZone: "America/New_York",
      pdfDpi: 300,
      taskConcurrency: 12,
      taskQueueConfigurations: [{
        name: QueueName.QuickScan,
        priority: 1,
      }],
      mcpEnabled: true,
      mcpPublicUrl: "https://receipts.example.com",
      serverPublicUrl: "https://receipts.example.com",
      secureCookies: true,
      shopLogoKeySet: true,
      refreshTokenValidForHours: 720,
      mcpRefreshTokenValidForHours: 6,
    };

    component.ngOnInit();

    expect(component.form.getRawValue()).toEqual({
      enableLocalSignUp: true,
      debugOcr: true,
      currencyDisplay: "USD",
      receiptProcessingSettingsId: 1,
      fallbackReceiptProcessingSettingsId: 2,
      currencyThousandthsSeparator: CurrencySeparator.Comma,
      currencyDecimalSeparator: CurrencySeparator.Period,
      currencySymbolPosition: CurrencySymbolPosition.Start,
      currencyHideDecimalPlaces: true,
      currency: "CUSTOM",
      timeZone: "America/New_York",
      pdfDpi: 300,
      taskConcurrency: 12,
      taskQueueConfigurations: [{
        name: QueueName.QuickScan,
        priority: 1,
      }],
      mcpEnabled: true,
      mcpPublicUrl: "https://receipts.example.com",
      serverPublicUrl: "https://receipts.example.com",
      secureCookies: true,
      shopLogoKey: SAVED_KEY_PLACEHOLDER,
      // 720 hours divides evenly into days, so it renders as 30 Days; 6 does
      // not, so it stays in hours.
      refreshTokenValidForValue: 30,
      refreshTokenValidForUnit: "DAYS",
      mcpRefreshTokenValidForValue: 6,
      mcpRefreshTokenValidForUnit: "HOURS",
      tempFileRetentionValue: 30,
      tempFileRetentionUnit: "DAYS",
    });
  });

  // `new URL()` is more lenient than Go's `url.Parse`: it normalizes these three
  // authority-less forms into a valid URL, while `url.Parse` leaves Host empty
  // and the backend rejects them. Without a literal `http(s)://` prefix check
  // the form would accept a value the server 400s on -- exactly what this
  // validator exists to prevent.
  it("rejects url forms that the backend rejects", () => {
    component.ngOnInit();

    const mcpPublicUrl = component.form.get("mcpPublicUrl")!;
    component.form.get("mcpEnabled")!.setValue(true);

    for (const value of [
      "https:receipts.example.com/api",
      "https:/receipts.example.com/api",
      "https:\\\\receipts.example.com/api",
    ]) {
      mcpPublicUrl.setValue(value);
      expect(mcpPublicUrl.hasError("url")).toBe(true);
    }

    // But the scheme is case-insensitive server-side (`url.Parse` lowercases
    // it), so an uppercase scheme must stay VALID -- a case-sensitive prefix
    // check would introduce the very mismatch above in the other direction.
    mcpPublicUrl.setValue("HTTPS://receipts.example.com/api");
    expect(mcpPublicUrl.valid).toBe(true);
  });

  it("rejects an mcp public url that is not an absolute http(s) url", () => {
    component.ngOnInit();

    const mcpEnabled = component.form.get("mcpEnabled")!;
    const mcpPublicUrl = component.form.get("mcpPublicUrl")!;
    mcpEnabled.setValue(true);

    mcpPublicUrl.setValue("   ");
    expect(mcpPublicUrl.hasError("url")).toBe(true);

    mcpPublicUrl.setValue("receipts.example.com");
    expect(mcpPublicUrl.hasError("url")).toBe(true);

    mcpPublicUrl.setValue("https://user:token@receipts.example.com");
    expect(mcpPublicUrl.hasError("url")).toBe(true);

    // The dev default must keep validating.
    mcpPublicUrl.setValue("http://localhost:8081");
    expect(mcpPublicUrl.valid).toBe(true);

    mcpPublicUrl.setValue("https://receipts.example.com");
    expect(mcpPublicUrl.valid).toBe(true);
  });

  it("caps the session lifetime at 720 hours or 30 days depending on the unit", () => {
    component.ngOnInit();

    const value = component.form.get("refreshTokenValidForValue")!;
    const unit = component.form.get("refreshTokenValidForUnit")!;

    unit.setValue("HOURS");
    value.setValue(720);
    expect(value.valid).toBe(true);

    value.setValue(721);
    expect(value.valid).toBe(false);

    // Flipping the unit has to retarget the max, or 30 days would be rejected
    // as if it were 30 hours over the limit.
    unit.setValue("DAYS");
    value.setValue(30);
    expect(value.valid).toBe(true);

    value.setValue(31);
    expect(value.valid).toBe(false);
  });

  it("caps temp file retention at 8760 hours or 365 days depending on the unit", () => {
    component.ngOnInit();

    const value = component.form.get("tempFileRetentionValue")!;
    const unit = component.form.get("tempFileRetentionUnit")!;

    unit.setValue("HOURS");
    value.setValue(8760);
    expect(value.valid).toBe(true);

    value.setValue(8761);
    expect(value.valid).toBe(false);

    unit.setValue("DAYS");
    value.setValue(365);
    expect(value.valid).toBe(true);

    value.setValue(366);
    expect(value.valid).toBe(false);
  });

  // The server floors this at 24 hours. Without a client-side floor the entry
  // passes validation and comes back as a bare 400 with nothing on the field.
  it("enforces the 24 hour retention floor in whichever unit is selected", () => {
    component.ngOnInit();

    const value = component.form.get("tempFileRetentionValue")!;
    const unit = component.form.get("tempFileRetentionUnit")!;

    unit.setValue("HOURS");
    value.setValue(23);
    expect(value.valid).toBe(false);
    expect(value.errors?.["duration"]).toEqual({ message: "Must be at least {min}.", min: 24 });

    value.setValue(24);
    expect(value.valid).toBe(true);

    unit.setValue("DAYS");
    value.setValue(1);
    expect(value.valid).toBe(true);
  });

  it("bounds the retention and the session lifetime independently", () => {
    component.ngOnInit();

    component.form.get("tempFileRetentionUnit")!.setValue("HOURS");
    component.form.get("tempFileRetentionValue")!.setValue(5000);
    expect(component.form.get("tempFileRetentionValue")!.valid).toBe(true);

    // The session lifetime keeps its own, much lower cap.
    component.form.get("refreshTokenValidForUnit")!.setValue("HOURS");
    component.form.get("refreshTokenValidForValue")!.setValue(5000);
    expect(component.form.get("refreshTokenValidForValue")!.valid).toBe(false);
  });

  it("requires a positive whole-number session lifetime", () => {
    component.ngOnInit();

    const value = component.form.get("refreshTokenValidForValue")!;

    value.setValue(0);
    expect(value.valid).toBe(false);

    value.setValue(null);
    expect(value.valid).toBe(false);

    // The API stores this as a Go int, so a fractional value would fail
    // json.Unmarshal instead of coming back as a field error.
    value.setValue(1.5);
    expect(value.valid).toBe(false);

    value.setValue(1);
    expect(value.valid).toBe(true);
  });

  it("surfaces a readable message when the lifetime is out of range", () => {
    component.ngOnInit();

    const value = component.form.get("refreshTokenValidForValue")!;
    component.form.get("refreshTokenValidForUnit")!.setValue("DAYS");

    value.setValue(31);

    // The message rides on the error value so BaseInputComponent renders it —
    // Validators.max has no message mapping and would show a blank error.
    expect(value.errors?.["duration"]).toEqual({ message: "Must be at most {max}.", max: 30 });
  });

  it("caps the mcp connector lifetime independently of the session lifetime", () => {
    component.ngOnInit();

    component.form.get("mcpRefreshTokenValidForUnit")!.setValue("DAYS");
    const mcpValue = component.form.get("mcpRefreshTokenValidForValue")!;

    mcpValue.setValue(31);
    expect(mcpValue.valid).toBe(false);

    mcpValue.setValue(30);
    expect(mcpValue.valid).toBe(true);

    // The app-session control keeps its own unit and bound.
    expect(component.form.get("refreshTokenValidForUnit")!.value).toBe("DAYS");
  });

  it("should submit form", () => {
    const systemSettingsService = TestBed.inject(SystemSettingsService);
    const snackbarService = TestBed.inject(SnackbarService);
    const router = TestBed.inject(Router);

    const updateSystemSettingsSpy = jest.spyOn(systemSettingsService, "updateSystemSettings").mockReturnValue(of(null as any));
    const snackbarServiceSpy = jest.spyOn(snackbarService, "success");
    const routerSpy = jest.spyOn(router, "navigate");

    component.originalSystemSettings.taskQueueConfigurations = [{
      name: QueueName.QuickScan,
      priority: "1",
    } as any];

    component.form.patchValue({
      enableLocalSignUp: true,
      debugOcr: true,
      currencyDisplay: "USD",
      receiptProcessingSettingsId: 1,
      fallbackReceiptProcessingSettingsId: 2,
      currencyThousandthsSeparator: CurrencySeparator.Comma,
      currencyDecimalSeparator: CurrencySeparator.Period,
      currencySymbolPosition: CurrencySymbolPosition.Start,
      currencyHideDecimalPlaces: false,
      timeZone: "Europe/Berlin",
      pdfDpi: "300",
      taskConcurrency: "12",
      mcpEnabled: true,
      mcpPublicUrl: "https://receipts.example.com",
      serverPublicUrl: "https://receipts.example.com",
      secureCookies: true,
      refreshTokenValidForValue: "14",
      refreshTokenValidForUnit: "DAYS",
      mcpRefreshTokenValidForValue: "12",
      mcpRefreshTokenValidForUnit: "HOURS",
    });

    // Update the quick_scan queue priority specifically
    const queueArray = component.form.get("taskQueueConfigurations") as FormArray;
    const quickScanIndex = queueArray.controls.findIndex(control => 
      control.get('name')?.value === 'quick_scan'
    );
    if (quickScanIndex >= 0) {
      queueArray.at(quickScanIndex).get('priority')?.setValue("1");
    }

    component.submit();

    expect(updateSystemSettingsSpy).toHaveBeenCalledWith({
      enableLocalSignUp: true,
      debugOcr: true,
      currencyDisplay: "USD",
      receiptProcessingSettingsId: 1,
      fallbackReceiptProcessingSettingsId: 2,
      currencyThousandthsSeparator: CurrencySeparator.Comma,
      currencyDecimalSeparator: CurrencySeparator.Period,
      currencySymbolPosition: CurrencySymbolPosition.Start,
      currencyHideDecimalPlaces: false,
      timeZone: "Europe/Berlin",
      pdfDpi: 300,
      taskConcurrency: 12,
      taskQueueConfigurations: [
        { name: 'quick_scan', priority: 1 }
      ],
      mcpEnabled: true,
      mcpPublicUrl: "https://receipts.example.com",
      serverPublicUrl: "https://receipts.example.com",
      secureCookies: true,
      // The value/unit pairs are folded into hours and the presentation-only
      // controls are stripped — toEqual would fail if any of them leaked.
      refreshTokenValidForHours: 336,
      mcpRefreshTokenValidForHours: 12,
      tempFileRetentionHours: 720,
    });

    expect(snackbarServiceSpy).toHaveBeenCalled();
    // Always editable now: a save stays on the tab and settles the form.
    expect(routerSpy).not.toHaveBeenCalled();
    expect(component.form.pristine).toBe(true);
  });

  describe("secure cookies", () => {
    function warning(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="secure-cookies-http-warning"]');
    }

    it("renders the checkbox with its test id", () => {
      const checkbox: HTMLElement | null = fixture.nativeElement.querySelector(
        '[data-testid="system-settings-secure-cookies"]'
      );

      expect(checkbox).not.toBeNull();
      expect(checkbox!.tagName.toLowerCase()).toEqual("app-checkbox");
    });

    it("is disabled in view mode but still read by getRawValue", () => {
      const activatedRoute = TestBed.inject(ActivatedRoute);
      activatedRoute.snapshot.data["systemSettings"] = { taskQueueConfigurations: [], secureCookies: true };
      activatedRoute.snapshot.data["formConfig"] = { mode: FormMode.view };
      component.ngOnInit();

      expect(component.form.get("secureCookies")!.disabled).toBe(true);
      expect(component.form.getRawValue().secureCookies).toBe(true);
    });

    // jsdom serves the page from http://localhost, i.e. the case the warning is for.
    it("warns when ticked on a page loaded over http", () => {
      expect(component.servedOverHttps).toBe(false);
      expect(warning()).toBeNull();

      component.form.get("secureCookies")!.setValue(true);
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      expect(warning()).not.toBeNull();

      component.form.get("secureCookies")!.setValue(false);
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      expect(warning()).toBeNull();
    });

    it("does not warn on a page loaded over https", () => {
      Object.assign(component, { servedOverHttps: true });

      component.form.get("secureCookies")!.setValue(true);
      fixture.detectChanges();

      expect(warning()).toBeNull();
    });
  });

  describe("time zone", () => {
    function setRouteSettings(settings: object): void {
      const activatedRoute = TestBed.inject(ActivatedRoute);
      activatedRoute.snapshot.data["systemSettings"] = {
        taskQueueConfigurations: [],
        ...settings,
      };
    }

    it("seeds the stored zone", () => {
      setRouteSettings({ timeZone: "Asia/Tokyo" });
      component.ngOnInit();

      expect(component.form.get("timeZone")!.value).toEqual("Asia/Tokyo");
    });

    it("is required", () => {
      component.ngOnInit();
      const timeZone = component.form.get("timeZone")!;

      timeZone.setValue(null);
      expect(timeZone.hasError("required")).toBe(true);

      timeZone.setValue("America/New_York");
      expect(timeZone.valid).toBe(true);
    });

    it("offers UTC first, then the browser's IANA zones", () => {
      expect(component.timeZones[0]).toEqual("UTC");
      expect(component.timeZones.filter((zone) => zone === "UTC").length).toEqual(1);
    });

    it("shows the picked zone's name rather than the autocomplete's blank default", () => {
      expect(component.timeZoneDisplayWith("Europe/Berlin")).toEqual("Europe/Berlin");
      expect(component.timeZoneDisplayWith(null)).toEqual("");
    });

    it("renders the picker with its test id", () => {
      const picker: HTMLElement | null = fixture.nativeElement.querySelector(
        '[data-testid="system-settings-time-zone"]'
      );

      expect(picker).not.toBeNull();
      expect(picker!.tagName.toLowerCase()).toEqual("app-autocomlete");
    });

    it("is disabled in view mode but still read by getRawValue", () => {
      setRouteSettings({ timeZone: "America/New_York" });
      const activatedRoute = TestBed.inject(ActivatedRoute);
      activatedRoute.snapshot.data["formConfig"] = { mode: FormMode.view };
      component.ngOnInit();

      expect(component.form.get("timeZone")!.disabled).toBe(true);
      expect(component.form.getRawValue().timeZone).toEqual("America/New_York");
    });

    it("dispatches the saved zone once the save succeeds", () => {
      const systemSettingsService = TestBed.inject(SystemSettingsService);
      const featureConfigService = TestBed.inject(FeatureConfigService);
      jest.spyOn(systemSettingsService, "updateSystemSettings").mockReturnValue(of(null as any));
      jest.spyOn(featureConfigService, "getFeatureConfig").mockReturnValue(of({} as any));
      const dispatchSpy = jest.spyOn(store, "dispatch");

      setRouteSettings({ timeZone: "UTC" });
      component.ngOnInit();
      component.form.get("timeZone")!.setValue("America/New_York");
      component.submit();

      expect(systemSettingsService.updateSystemSettings).toHaveBeenCalledWith(
        expect.objectContaining({ timeZone: "America/New_York" })
      );
      expect(dispatchSpy).toHaveBeenCalledWith(new SetTimeZone("America/New_York"));
      expect(store.selectSnapshot(SystemSettingsState.timeZone)).toEqual("America/New_York");
    });

    it("does not dispatch a zone the server rejected", () => {
      const systemSettingsService = TestBed.inject(SystemSettingsService);
      jest
        .spyOn(systemSettingsService, "updateSystemSettings")
        .mockReturnValue(throwError(() => new Error("400")) as any);
      const dispatchSpy = jest.spyOn(store, "dispatch");

      component.ngOnInit();
      component.form.get("timeZone")!.setValue("America/New_York");
      component.submit();

      expect(dispatchSpy).not.toHaveBeenCalledWith(new SetTimeZone("America/New_York"));
    });
  });

  describe("tabs", () => {
    const place = (section: string | undefined) => {
      const activatedRoute = TestBed.inject(ActivatedRoute);
      activatedRoute.snapshot.data["section"] = section;
      activatedRoute.snapshot.data["formConfig"] = { mode: FormMode.edit };
      component.ngOnInit();
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };

    const cards = (): string[] =>
      Array.from(fixture.nativeElement.querySelectorAll("[data-testid^='settings-card-']")).map(
        (card) => (card as HTMLElement).getAttribute("data-testid")!.replace("settings-card-", "")
      );

    it("shows every settings card when it is not placed on a tab", () => {
      place(undefined);

      expect(cards()).toEqual(["currency", "regional", "shop-logos", "signup-session", "worker", "queues"]);
    });

    it("Shop Logos holds the Logo.dev key with how to get it and the attribution", () => {
      place("logos");

      expect(cards()).toEqual(["shop-logos"]);
      expect(fixture.nativeElement.querySelector("[data-testid=system-settings-shop-logo-key]")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=shop-logos-steps]")).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain("Logos provided by Logo.dev");
    });

    it("Currency & Time Zone holds the currency (with rates) and the time zone", () => {
      place("general");

      expect(cards()).toEqual(["currency", "regional"]);
      expect(fixture.nativeElement.querySelector("app-exchange-rates")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=system-settings-time-zone]")).not.toBeNull();
    });

    it("Auth & Security holds sign-up, session, cookies and the server URL in one card", () => {
      place("security");

      expect(cards()).toEqual(["signup-session"]);
      expect(fixture.nativeElement.querySelector("[data-testid=system-settings-secure-cookies]")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("[data-testid=server-public-url]")).not.toBeNull();
    });

    it("Tasks & Storage lists the queues compactly", () => {
      place("tasks");

      expect(cards()).toEqual(["worker", "queues"]);
      const rows = fixture.nativeElement.querySelectorAll("[data-testid=queue-row]");
      expect(rows.length).toBe(2);
      expect(fixture.nativeElement.querySelector("[data-testid=queue-priority-quick_scan]")).not.toBeNull();
      expect((component.form.get("taskQueueConfigurations") as FormArray).length).toBe(1);
    });

    it("keeps every setting in the form whatever the tab, so a save sends them all", () => {
      place("general");

      expect(Object.keys(component.form.controls)).toEqual(
        expect.arrayContaining(["enableLocalSignUp", "mcpEnabled", "taskConcurrency", "mcpPublicUrl", "timeZone"])
      );
    });
  });
  describe("exchange rates share the Save changes button", () => {
    const fakeRates = (dirty: boolean) => ({ dirty: () => dirty, save: jest.fn() });
    let updateSystemSettings: jest.SpyInstance;

    beforeEach(() => {
      updateSystemSettings = jest
        .spyOn(TestBed.inject(SystemSettingsService), "updateSystemSettings")
        .mockReturnValue(of(null as any));
    });

    it("counts typed rates as unsaved changes", () => {
      (component as any).exchangeRates = () => fakeRates(true);

      expect(component.hasUnsavedChanges()).toBe(true);
    });

    it("saves only the rates when nothing else changed", () => {
      const rates = fakeRates(true);
      (component as any).exchangeRates = () => rates;
      component.form.markAsPristine();

      component.submit();

      expect(rates.save).toHaveBeenCalledWith();
      expect(updateSystemSettings).not.toHaveBeenCalled();
    });

    it("saves the rates after the settings, re-reading the main currency", () => {
      const rates = fakeRates(true);
      (component as any).exchangeRates = () => rates;
      component.form.markAsDirty();

      component.submit();

      expect(updateSystemSettings).toHaveBeenCalled();
      expect(rates.save).toHaveBeenCalledWith(true);
    });
  });

  describe("the Logo.dev key", () => {
    const submitted = () => {
      const spy = jest
        .spyOn(TestBed.inject(SystemSettingsService), "updateSystemSettings")
        .mockReturnValue(of({ shopLogoKeySet: true } as any));
      component.form.markAsDirty();
      component.submit();
      return spy.mock.calls[0][0] as Record<string, unknown>;
    };

    it("leaves a saved key alone unless one is typed", () => {
      const activatedRoute = TestBed.inject(ActivatedRoute);
      activatedRoute.snapshot.data["systemSettings"] = { ...activatedRoute.snapshot.data["systemSettings"], shopLogoKeySet: true };
      component.ngOnInit();

      expect(component.form.get("shopLogoKey")!.value).toBe(SAVED_KEY_PLACEHOLDER);
      expect("shopLogoKey" in submitted()).toBe(false);
    });

    it("sends a typed key trimmed, and an emptied field as \"\" to remove it", () => {
      const key = component.form.get("shopLogoKey")!;
      key.setValue("  sk_ExampleKey12345 ");
      key.markAsDirty();
      expect(submitted()["shopLogoKey"]).toBe("sk_ExampleKey12345");

      jest.restoreAllMocks();
      key.setValue("");
      key.markAsDirty();
      expect(submitted()["shopLogoKey"]).toBe("");
    });

    it("shows how many logos are downloaded on the Shop Logos tab", async () => {
      jest
        .spyOn(TestBed.inject(ShopLogoService), "getShopLogoStatus")
        .mockReturnValue(of({ running: false, downloaded: 312, total: 393, lastError: "Logo.dev refused the key" } as any));
      const activatedRoute = TestBed.inject(ActivatedRoute);
      activatedRoute.snapshot.data["section"] = "logos";
      activatedRoute.snapshot.data["formConfig"] = { mode: FormMode.edit };
      component.ngOnInit();
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("[data-testid=shop-logos-status]").textContent).toContain("Logos for 312 of the 393 known shops on your receipts.");
      expect(fixture.nativeElement.querySelector("[data-testid=shop-logos-error]").textContent).toContain("Logo.dev refused the key");
    });

    it("offers Fetch logos now only with a saved key, and starts a fetch", () => {
      const api = TestBed.inject(ShopLogoService);
      jest.spyOn(api, "getShopLogoStatus").mockReturnValue(of({ running: false, downloaded: 1, total: 2, lastError: "" } as any));
      const start = jest
        .spyOn(api, "startShopLogoSync")
        .mockReturnValue(of({ running: false, downloaded: 1, total: 2, lastError: "" } as any));

      expect(component.canFetchLogos()).toBe(false);

      const activatedRoute = TestBed.inject(ActivatedRoute);
      activatedRoute.snapshot.data["systemSettings"] = { ...activatedRoute.snapshot.data["systemSettings"], shopLogoKeySet: true };
      component.ngOnInit();
      expect(component.canFetchLogos()).toBe(true);

      // A typed key has to be saved first.
      component.form.get("shopLogoKey")!.markAsDirty();
      expect(component.canFetchLogos()).toBe(false);
      component.form.get("shopLogoKey")!.markAsPristine();

      component.fetchLogos();
      expect(start).toHaveBeenCalledTimes(1);
      expect(component.logoStatus()?.running).toBe(true);
      expect(component.canFetchLogos()).toBe(false);
    });

    it("deletes the logos only after the confirmation, and never during a download", () => {
      const api = TestBed.inject(ShopLogoService);
      const remove = jest
        .spyOn(api, "deleteShopLogos")
        .mockReturnValue(of({ running: false, downloaded: 0, total: 2, lastError: "" } as any));
      jest.spyOn(TestBed.inject(FeatureConfigService), "getFeatureConfig").mockReturnValue(of({} as any));
      const answer = new Subject<boolean | undefined>();
      const dialogRef = { componentInstance: {} as any, afterClosed: () => answer.asObservable() };
      jest.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue(dialogRef as any);

      component.logoStatus.set({ running: true, downloaded: 2, total: 2, lastError: "" } as any);
      expect(component.canDeleteLogos()).toBe(false);
      component.logoStatus.set({ running: false, downloaded: 0, total: 2, lastError: "" } as any);
      expect(component.canDeleteLogos()).toBe(false);
      component.logoStatus.set({ running: false, downloaded: 2, total: 2, lastError: "" } as any);
      expect(component.canDeleteLogos()).toBe(true);

      component.deleteLogos();
      expect(dialogRef.componentInstance.confirmText).toBe("Delete");
      answer.next(undefined);
      expect(remove).not.toHaveBeenCalled();

      const confirm = new Subject<boolean | undefined>();
      dialogRef.afterClosed = () => confirm.asObservable();
      component.deleteLogos();
      confirm.next(true);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(component.logoStatus()?.downloaded).toBe(0);
      expect(component.canDeleteLogos()).toBe(false);
    });
  });
});
