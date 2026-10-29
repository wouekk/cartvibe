import { AfterViewInit, Component, DestroyRef, ElementRef, inject, OnInit, signal, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, ValidatorFn, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { Store } from "@ngxs/store";
import { filter, startWith, switchMap, take, tap } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { AppDialog } from "../../dialog/app-dialog";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AutocomleteComponent } from "../../autocomplete/autocomlete/autocomlete.component";
import { BaseFormComponent } from "../../form";
import { FormOption } from "../../interfaces/form-option.interface";
import {
  CurrencySeparator,
  CurrencySymbolPosition,
  FeatureConfigService,
  Permission,
  QueueName,
  ReceiptProcessingSettings,
  ShopLogoService,
  ShopLogoStatus,
  SystemSettings,
  SystemSettingsService
} from "../../open-api";
import { SAVED_KEY_PLACEHOLDER } from "../../ai-settings/ai-settings-shared";
import { InputReadonlyPipe } from "../../pipes/input-readonly.pipe";
import { SnackbarService } from "../../services";
import { AuthState, SetFeatureConfig } from "../../store";
import { SetCurrencyData, SetCurrencyDisplay, SetTimeZone } from "../../store/system-settings.state.actions";
import { DurationUnit, maxForUnit, minForUnit, splitHours, toHours } from "../../utils";
import { DEFAULT_APP_TIME_ZONE, timeZoneOptions } from "../../utils/app-time-zone";
import { absoluteUrlValidator, durationValueValidator } from "../../validators";
import { ExchangeRatesComponent } from "../exchange-rates/exchange-rates.component";
import { CURRENCY_PRESETS, CUSTOM_CURRENCY, matchCurrencyPreset } from "./currency-presets";
import { marker } from "../../i18n/marker";

interface QueueData extends FormOption {
  description: string;
}

/** The tab a settings form is placed on (route data `section`). */
export type SystemSettingsSection = "general" | "logos" | "security" | "tasks";

/**
 * The Logo.dev key field: empty (no key), the dots standing for a saved key, or a secret key. The publishable key gets
 * its own message: it cannot download logos the server may keep. Mirrors the API's validateShopLogoKey.
 */
export function shopLogoKeyValidator(): ValidatorFn {
  return (control) => {
    const value = String(control.value ?? "").trim();
    if (!value || value === SAVED_KEY_PLACEHOLDER) {
      return null;
    }
    if (value.startsWith("pk_")) {
      return { shopLogoKey: marker("This is the publishable key. The server needs the secret key, which starts with sk_") };
    }
    return /^sk_[A-Za-z0-9_-]{8,200}$/.test(value)
      ? null
      : { shopLogoKey: marker("A Logo.dev secret key starts with sk_") };
  };
}

@UntilDestroy()
@Component({
  selector: "app-system-settings-form",
  templateUrl: "./system-settings-form.component.html",
  providers: [InputReadonlyPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SystemSettingsFormComponent extends BaseFormComponent implements OnInit, AfterViewInit {
  // Optional: the processing pickers are no longer rendered (Phase 3 M1).
  public readonly fallbackReceiptProcessingSettings = viewChild<AutocomleteComponent>("fallbackReceiptProcessingSettings");

  public readonly alert = viewChild.required("alert", { read: ElementRef });

  /** Only on the General tab; its rates save with this form's Save changes. */
  public readonly exchangeRates = viewChild(ExchangeRatesComponent);

  public hasUnsavedChanges(): boolean {
    return this.form.dirty || !!this.exchangeRates()?.dirty();
  }

  public originalSystemSettings!: SystemSettings;

  public allReceiptProcessingSettings: ReceiptProcessingSettings[] = [];

  public filteredReceiptProcessingSettings: ReceiptProcessingSettings[] = [];

  /** A signal, so the alert appears when a save finishes (zoneless change detection). */
  public readonly showRestartTaskServerAlert = signal(false);

  /** Which tab's cards this form shows (route data); undefined shows every card. */
  public section?: SystemSettingsSection;

  public readonly canReadSystemTasks = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppSystemTasksRead));

  public readonly queueData: QueueData[] = [
    {
      value: QueueName.QuickScan,
      displayValue: "Quick Scan",
      description: marker("Processes quick scan receipts")
    },
    {
      value: QueueName.SystemCleanUp,
      displayValue: marker("System Clean Up"),
      description: marker("Expires refresh tokens and reclaims temporary files")
    }
  ];

  /** Whether the cards of a tab are shown: all of them when the form is not placed on a tab. */
  public shows(section: SystemSettingsSection): boolean {
    return !this.section || this.section === section;
  }

  // The backend caps a refresh-token lifetime at 720 hours (30 days) and treats
  // 0 as "unset, use the default". Mirrored here so the form rejects what the
  // server would reject.
  public static readonly MAX_TOKEN_LIFETIME_HOURS = 720;

  // Temp-file retention has its own, much wider bounds — do not reuse the token
  // cap above. 24 hours is a real floor on the server, so it is enforced here
  // too or the entry fails with a bare 400 and no message on the field.
  public static readonly MIN_TEMP_FILE_RETENTION_HOURS = 24;

  public static readonly MAX_TEMP_FILE_RETENTION_HOURS = 8760;

  public static readonly DEFAULT_TEMP_FILE_RETENTION_HOURS = 720;

  public readonly durationUnits: FormOption[] = [
    {
      displayValue: marker("Hours"),
      value: "HOURS"
    },
    {
      displayValue: marker("Days"),
      value: "DAYS"
    }
  ];

  public readonly symbolPositions: FormOption[] = [
    {
      displayValue: "Start",
      value: CurrencySymbolPosition.Start
    },
    {
      displayValue: "End",
      value: CurrencySymbolPosition.End,
    }
  ];

  public readonly currencies: FormOption[] = [
    ...CURRENCY_PRESETS.map((preset) => ({ displayValue: preset.label, value: preset.code })),
    { displayValue: "Custom", value: CUSTOM_CURRENCY },
  ];

  public readonly isCustomCurrency = signal(false);

  public readonly decimalSeparators: FormOption[] = [
    {
      displayValue: ", (Comma)",
      value: CurrencySeparator.Comma
    },
    {
      displayValue: ". (Dot)",
      value: CurrencySeparator.Period
    }
  ];

  // Plain IANA names (~420): the autocomplete filters and renders bare strings
  // itself, so there is no value/display split to model. Built once — the list
  // is static for the browser's lifetime.
  public readonly timeZones: string[] = timeZoneOptions();

  // The autocomplete's default displayWith renders "", which would blank the
  // field once a zone is picked.
  public readonly timeZoneDisplayWith = (zone: string | null): string => zone ?? "";

  // Whether this page reached the browser over HTTPS. Secure cookies set over
  // plain HTTP are dropped by the browser, so saving Secure Cookies on while
  // this is false locks out everyone reaching the app over HTTP, this admin
  // included — the template warns before they save it.
  public readonly servedOverHttps = window.location.protocol === "https:";

  constructor(
    private activatedRoute: ActivatedRoute,
    private featureConfigService: FeatureConfigService,
    private formBuilder: FormBuilder,
    private router: Router,
    private snackbarService: SnackbarService,
    private store: Store,
    private systemSettingsService: SystemSettingsService,
    private inputReadonlyPipe: InputReadonlyPipe,
  ) {
    super();
  }

  public ngOnInit(): void {
    this.setFormConfigFromRoute(this.activatedRoute);
    this.allReceiptProcessingSettings = this.activatedRoute.snapshot.data?.["allReceiptProcessingSettings"];
    this.originalSystemSettings = this.activatedRoute.snapshot.data?.["systemSettings"];
    this.section = this.activatedRoute.snapshot.data?.["section"];
    this.showRestartTaskServerAlert.set(this.activatedRoute.snapshot?.queryParams?.["restartTaskServer"] === "true");
    this.initForm();
    if (this.section === "logos") {
      this.refreshLogoStatus();
    }
  }

  /** The logo download as the server reports it; undefined until loaded (or when the status cannot be read). */
  public readonly logoStatus = signal<ShopLogoStatus | undefined>(undefined);

  private readonly shopLogoService = inject(ShopLogoService);

  private readonly appDialog = inject(AppDialog);

  private logoStatusTimer?: ReturnType<typeof setTimeout>;

  private readonly stopLogoStatusPolling = inject(DestroyRef).onDestroy(() => clearTimeout(this.logoStatusTimer));

  /** Fetch logos now: with a saved key, while nothing runs, and not with a typed key that still needs saving. */
  public canFetchLogos(): boolean {
    return !!this.originalSystemSettings?.shopLogoKeySet && !this.logoStatus()?.running && !this.form.get("shopLogoKey")?.dirty;
  }

  /** Delete logos: once some are downloaded and while nothing runs (the server refuses during a download). */
  public canDeleteLogos(): boolean {
    const status = this.logoStatus();
    return !!status && !status.running && status.downloaded > 0;
  }

  /** Asks first, then deletes every downloaded logo; the key stays, and downloading them again costs credits. */
  public deleteLogos(): void {
    const dialogRef = this.appDialog.open(ConfirmationDialogComponent, DEFAULT_DIALOG_CONFIG);
    dialogRef.componentInstance.headerText = marker("Delete the logos");
    dialogRef.componentInstance.confirmText = marker("Delete");
    dialogRef.componentInstance.dialogContent = marker(
      "Delete every downloaded logo from this server? Receipts show the shop's first letter until the logos are downloaded again, which uses Logo.dev credits. The key stays saved."
    );

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        filter((confirmed) => !!confirmed),
        switchMap(() => this.shopLogoService.deleteShopLogos()),
        tap((status) => {
          this.logoStatus.set(status);
          this.snackbarService.success(marker("The logos were deleted"));
        }),
        switchMap(() => this.featureConfigService.getFeatureConfig()),
        tap((featureConfig) => this.store.dispatch(new SetFeatureConfig(featureConfig))),
      )
      .subscribe({ error: () => this.refreshLogoStatus() });
  }

  /** Fetches the missing logos now instead of at the next 12-hourly run, then follows the download's status. */
  public fetchLogos(): void {
    this.shopLogoService
      .startShopLogoSync()
      .pipe(take(1))
      .subscribe({
        next: (status) => {
          this.logoStatus.set({ ...status, running: true });
          clearTimeout(this.logoStatusTimer);
          this.logoStatusTimer = setTimeout(() => this.refreshLogoStatus(), 1500);
        },
        error: () => this.refreshLogoStatus(),
      });
  }

  /** Reads the download status, and again every few seconds while a download runs. */
  private refreshLogoStatus(): void {
    clearTimeout(this.logoStatusTimer);
    this.shopLogoService
      .getShopLogoStatus()
      .pipe(take(1))
      .subscribe({
        next: (status) => {
          this.logoStatus.set(status);
          if (status.running) {
            this.logoStatusTimer = setTimeout(() => this.refreshLogoStatus(), 3000);
          }
        },
        error: () => this.logoStatus.set(undefined),
      });
  }

  public ngAfterViewInit(): void {
    setTimeout(() => {

      if (this.showRestartTaskServerAlert()) {
        this.alert().nativeElement.scrollIntoView({ behavior: "smooth" });
      }

    }, 0);
  }

  private initForm(): void {
    const refreshTokenLifetime = splitHours(this.originalSystemSettings?.refreshTokenValidForHours);
    const mcpRefreshTokenLifetime = splitHours(this.originalSystemSettings?.mcpRefreshTokenValidForHours);
    // splitHours falls back to 24 hours for an unset value, which would render
    // this setting as "1 Days". Its own default is 720, so substitute that
    // first — the server reads 0 the same way.
    const tempFileRetention = splitHours(
      this.originalSystemSettings?.tempFileRetentionHours || SystemSettingsFormComponent.DEFAULT_TEMP_FILE_RETENTION_HOURS
    );

    this.form = this.formBuilder.group({
      enableLocalSignUp: [this.originalSystemSettings?.enableLocalSignUp],
      debugOcr: [this.originalSystemSettings?.debugOcr],
      currencyDisplay: [this.originalSystemSettings?.currencyDisplay],
      currencyThousandthsSeparator: [this.originalSystemSettings.currencyThousandthsSeparator, [Validators.required]],
      currencyDecimalSeparator: [this.originalSystemSettings.currencyDecimalSeparator, [Validators.required]],
      currencySymbolPosition: [this.originalSystemSettings.currencySymbolPosition, [Validators.required]],
      currencyHideDecimalPlaces: [this.originalSystemSettings.currencyHideDecimalPlaces],
      // Form-only: a named currency that fills the five fields above (Phase 3 M7).
      currency: [matchCurrencyPreset(this.originalSystemSettings ?? {})],
      timeZone: [this.originalSystemSettings?.timeZone || DEFAULT_APP_TIME_ZONE, [Validators.required]],
      receiptProcessingSettingsId: [this.originalSystemSettings?.receiptProcessingSettingsId],
      fallbackReceiptProcessingSettingsId: [this.originalSystemSettings?.fallbackReceiptProcessingSettingsId],
      pdfDpi: [this.originalSystemSettings?.pdfDpi, [Validators.min(72), Validators.max(1200)]],
      taskConcurrency: [this.originalSystemSettings?.taskConcurrency, [Validators.min(0), Validators.required]],
      taskQueueConfigurations: this.formBuilder.array(this.buildAsynqQueueConfigurations()),
      mcpEnabled: [this.originalSystemSettings?.mcpEnabled],
      mcpPublicUrl: [this.originalSystemSettings?.mcpPublicUrl],
      // Always sent, never conditionally required: the backend accepts a blank
      // value, and the cross-setting rule ("required once a provider is
      // enabled") is enforced where providers are saved so an admin cannot
      // register one that has no redirect URI to publish.
      serverPublicUrl: [this.originalSystemSettings?.serverPublicUrl, [absoluteUrlValidator()]],
      secureCookies: [this.originalSystemSettings?.secureCookies ?? false],
      // A saved key is never sent back: the field shows dots, and only a typed change is sent (see submit()).
      shopLogoKey: [this.originalSystemSettings?.shopLogoKeySet ? SAVED_KEY_PLACEHOLDER : "", [shopLogoKeyValidator()]],
      // Form-only controls. The API stores hours; the unit is presentation and
      // is folded back into `<name>Hours` in submit().
      refreshTokenValidForValue: [refreshTokenLifetime.value],
      refreshTokenValidForUnit: [refreshTokenLifetime.unit],
      mcpRefreshTokenValidForValue: [mcpRefreshTokenLifetime.value],
      mcpRefreshTokenValidForUnit: [mcpRefreshTokenLifetime.unit],
      tempFileRetentionValue: [tempFileRetention.value],
      tempFileRetentionUnit: [tempFileRetention.unit],
    });

    if (this.inputReadonlyPipe.transform(this.formConfig.mode)) {
      this.form.get("debugOcr")?.disable();
      this.form.get("enableLocalSignUp")?.disable();
      this.form.get("currencyThousandthsSeparator")?.disable();
      this.form.get("currencyDecimalSeparator")?.disable();
      this.form.get("currencySymbolPosition")?.disable();
      this.form.get("currencyHideDecimalPlaces")?.disable();
      this.form.get("currency")?.disable();
      this.form.get("timeZone")?.disable();
      this.form.get("mcpEnabled")?.disable();
      this.form.get("mcpPublicUrl")?.disable();
      this.form.get("serverPublicUrl")?.disable();
      this.form.get("secureCookies")?.disable();
      this.form.get("shopLogoKey")?.disable();
      this.form.get("refreshTokenValidForValue")?.disable();
      this.form.get("refreshTokenValidForUnit")?.disable();
      this.form.get("mcpRefreshTokenValidForValue")?.disable();
      this.form.get("mcpRefreshTokenValidForUnit")?.disable();
      this.form.get("tempFileRetentionValue")?.disable();
      this.form.get("tempFileRetentionUnit")?.disable();
    }

    this.listenForReceiptProcessingSettingsChanges();
    this.listenForHideDecimalPlacesChanges();
    this.listenForCurrencyChanges();
    this.listenForMcpEnabledChanges();
    this.listenForDurationUnitChanges(
      "refreshTokenValidForValue",
      "refreshTokenValidForUnit",
      SystemSettingsFormComponent.MAX_TOKEN_LIFETIME_HOURS
    );
    this.listenForDurationUnitChanges(
      "mcpRefreshTokenValidForValue",
      "mcpRefreshTokenValidForUnit",
      SystemSettingsFormComponent.MAX_TOKEN_LIFETIME_HOURS
    );
    this.listenForDurationUnitChanges(
      "tempFileRetentionValue",
      "tempFileRetentionUnit",
      SystemSettingsFormComponent.MAX_TEMP_FILE_RETENTION_HOURS,
      SystemSettingsFormComponent.MIN_TEMP_FILE_RETENTION_HOURS
    );
  }

  // The bounds depend on the selected unit (720 hours === 30 days), so the value
  // control's validators are re-applied whenever the unit flips. Like
  // urlValidators() below, setValidators replaces the whole list, so required
  // has to be re-supplied each time rather than declared in initForm.
  //
  // The bounds are parameters rather than the token cap this once hardcoded:
  // temp-file retention runs to a year and has a real floor of its own.
  private listenForDurationUnitChanges(
    valueControlName: string,
    unitControlName: string,
    maxHours: number,
    minHours: number = 1
  ): void {
    const valueControl = this.form.get(valueControlName);

    this.form.get(unitControlName)?.valueChanges
      .pipe(
        startWith(this.form.get(unitControlName)?.value),
        untilDestroyed(this),
        tap((unit: DurationUnit) => {
          valueControl?.setValidators([
            Validators.required,
            durationValueValidator(maxForUnit(maxHours, unit), minForUnit(minHours, unit)),
          ]);
          valueControl?.updateValueAndValidity({ emitEvent: false });
        })
      )
      .subscribe();
  }

  // TODO: finish implementing UI for taskQueueConfigurations
  private buildAsynqQueueConfigurations(): FormGroup[] {
    return (this.originalSystemSettings?.taskQueueConfigurations ?? []).map(config => {
      return this.formBuilder.group({
        name: [config.name],
        priority: [config.priority],
      });
    });
  }

  private listenForReceiptProcessingSettingsChanges(): void {
    this.form.get("receiptProcessingSettingsId")?.valueChanges
      .pipe(
        startWith(this.form.get("receiptProcessingSettingsId")?.value),
        untilDestroyed(this),
        tap((value: number) => {
          this.filteredReceiptProcessingSettings = this.allReceiptProcessingSettings.filter((rps) => rps.id !== value);

          if (!value) {
            this.fallbackReceiptProcessingSettings()?.clearFilter();
          }
        })
      )
      .subscribe();
  }

  // Picking a currency fills in its format; "Custom" shows the raw fields instead.
  private listenForCurrencyChanges(): void {
    this.form.get("currency")?.valueChanges
      .pipe(
        startWith(this.form.get("currency")?.value),
        untilDestroyed(this),
        tap((code: string) => {
          this.isCustomCurrency.set(code === CUSTOM_CURRENCY);

          const preset = CURRENCY_PRESETS.find((candidate) => candidate.code === code);
          if (preset) {
            this.form.patchValue({
              currencyDisplay: preset.currencyDisplay,
              currencySymbolPosition: preset.currencySymbolPosition,
              currencyThousandthsSeparator: preset.currencyThousandthsSeparator,
              currencyDecimalSeparator: preset.currencyDecimalSeparator,
              currencyHideDecimalPlaces: false,
            });
          }
        })
      )
      .subscribe();
  }

  private listenForHideDecimalPlacesChanges(): void {
    this.form.get("currencyHideDecimalPlaces")?.valueChanges
      .pipe(
        startWith(this.form.get("currencyHideDecimalPlaces")?.value),
        untilDestroyed(this),
        tap((hide: boolean) => {
          if (hide) {
            this.form.get("currencyDecimalSeparator")?.disable();
          } else {
            this.form.get("currencyDecimalSeparator")?.enable();
          }
        })
      )
      .subscribe();
  }

  // A public URL is required to enable the MCP server, mirroring the backend
  // validation. The control's validators are toggled with the enable flag; the
  // format check stays on either way because the backend validates a non-empty
  // URL regardless of the toggle.
  private listenForMcpEnabledChanges(): void {
    const mcpPublicUrl = this.form.get("mcpPublicUrl");

    this.form.get("mcpEnabled")?.valueChanges
      .pipe(
        startWith(this.form.get("mcpEnabled")?.value),
        untilDestroyed(this),
        tap((enabled: boolean) => {
          mcpPublicUrl?.setValidators(this.urlValidators(enabled));
          mcpPublicUrl?.updateValueAndValidity({ emitEvent: false });
        })
      )
      .subscribe();
  }

  // setValidators replaces the whole list, so the format check has to be
  // re-supplied on every toggle rather than declared once in initForm.
  private urlValidators(required: boolean): ValidatorFn[] {
    return required
      ? [Validators.required, absoluteUrlValidator()]
      : [absoluteUrlValidator()];
  }

  public displayWith(id: number): string {
    return this.allReceiptProcessingSettings.find((rps) => rps.id === id)?.name ?? "";
  }

  private doesTaskServerRequiresRestart(): boolean {
    let requiresRestart = this.originalSystemSettings.taskConcurrency !== this.form.get("taskConcurrency")?.value;
    for (let i = 0; i < this.originalSystemSettings.taskQueueConfigurations.length; i++) {
      const originalConfig = this.originalSystemSettings.taskQueueConfigurations[i];
      const formConfig = (this.form.get("taskQueueConfigurations") as FormArray).controls.find((control) => control.get("name")?.value === originalConfig.name);

      if (originalConfig.priority !== formConfig?.get("priority")?.value) {
        requiresRestart = true;
        break;
      }
    }

    return requiresRestart;
  }

  public submit(): void {
    const rates = this.exchangeRates();
    if (this.form.pristine && rates?.dirty()) {
      // Only the exchange rates changed: there are no settings to send.
      rates?.save();
      return;
    }

    const formValue = this.form.getRawValue();
    // Fold the value/unit pairs back into the hours the API stores, then drop
    // the presentation-only controls so they never reach the wire.
    formValue["refreshTokenValidForHours"] = toHours(
      formValue["refreshTokenValidForValue"],
      formValue["refreshTokenValidForUnit"]
    );
    formValue["mcpRefreshTokenValidForHours"] = toHours(
      formValue["mcpRefreshTokenValidForValue"],
      formValue["mcpRefreshTokenValidForUnit"]
    );
    formValue["tempFileRetentionHours"] = toHours(
      formValue["tempFileRetentionValue"],
      formValue["tempFileRetentionUnit"]
    );
    delete formValue["refreshTokenValidForValue"];
    delete formValue["refreshTokenValidForUnit"];
    delete formValue["mcpRefreshTokenValidForValue"];
    delete formValue["mcpRefreshTokenValidForUnit"];
    delete formValue["tempFileRetentionValue"];
    delete formValue["tempFileRetentionUnit"];
    delete formValue["currency"];
    // The Logo.dev key goes out only when typed: omitted, the server keeps the saved one; "" removes it.
    const shopLogoKey = this.form.get("shopLogoKey");
    if (!shopLogoKey?.dirty || formValue["shopLogoKey"] === SAVED_KEY_PLACEHOLDER) {
      delete formValue["shopLogoKey"];
    } else {
      formValue["shopLogoKey"] = String(formValue["shopLogoKey"] ?? "").trim();
    }
    formValue["taskConcurrency"] = Number.parseInt(formValue["taskConcurrency"]);
    formValue["pdfDpi"] = Number.parseInt(formValue["pdfDpi"]);
    (formValue["taskQueueConfigurations"] as Array<any>).forEach(config => {
      config.priority = Number.parseInt(config.priority);
    });
    const restartTaskServer = this.doesTaskServerRequiresRestart();

    this.systemSettingsService.updateSystemSettings(formValue)
      .pipe(
        take(1),
        tap((saved) => {
          this.snackbarService.success("System settings updated successfully");
          // Stay on the tab: the form is always editable, so a save just settles it.
          if (saved) {
            this.originalSystemSettings = { ...this.originalSystemSettings, ...saved };
          }
          if ("shopLogoKey" in formValue) {
            // The key is never shown again: dots while one is saved. The server has just started the download.
            this.form.get("shopLogoKey")?.setValue(this.originalSystemSettings?.shopLogoKeySet ? SAVED_KEY_PLACEHOLDER : "");
            this.logoStatusTimer = setTimeout(() => this.refreshLogoStatus(), 1000);
          }
          this.form.markAsPristine();
          this.showRestartTaskServerAlert.set(restartTaskServer);
          if (rates?.dirty()) {
            rates.save(true);
          }
        }),
        switchMap(() => this.featureConfigService.getFeatureConfig()),
        tap((featureConfig) => this.store.dispatch(new SetFeatureConfig(featureConfig))),
        switchMap(() => this.store.dispatch(new SetCurrencyDisplay(formValue["currencyDisplay"]?.toString()))),
        switchMap(() => this.store.dispatch(
          new SetCurrencyData(formValue["currencySymbolPosition"],
            formValue["currencyDecimalSeparator"],
            formValue["currencyThousandthsSeparator"],
            formValue["currencyHideDecimalPlaces"]
          ))),
        // Every appDate pipe and "today" reads the zone from the store, so the
        // app repaints in the new zone without a reload.
        switchMap(() => this.store.dispatch(new SetTimeZone(formValue["timeZone"]))),
      )
      .subscribe();
  }

  public restartTaskServer(): void {
    this.systemSettingsService.restartTaskServer().pipe(
      take(1),
      tap(() => {
          this.snackbarService.success("Task server restarted successfully");
          this.showRestartTaskServerAlert.set(false);
        },
      )).subscribe();
  }
}
