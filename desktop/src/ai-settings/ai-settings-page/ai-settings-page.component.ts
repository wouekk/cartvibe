import { CommonModule } from "@angular/common";
import { Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { Store } from "@ngxs/store";
import { catchError, finalize, map, Observable, of, startWith, switchMap, take, tap } from "rxjs";
import { CheckboxModule } from "../../checkbox/checkbox.module";
import { InputModule } from "../../input/input.module";
import {
  AiType,
  FeatureConfigService,
  OcrEngine,
  ReceiptProcessingSettings,
  ReceiptProcessingSettingsService,
  SystemSettings,
  SystemSettingsService,
  UpsertReceiptProcessingSettingsCommand,
  UpsertSystemSettingsCommand,
} from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SelectModule } from "../../select/select.module";
import { SnackbarService } from "../../services";
import { SetFeatureConfig } from "../../store";
import { AiFallbackCardComponent } from "../ai-fallback-card/ai-fallback-card.component";
import { GeminiModelFieldComponent } from "../gemini-model-field/gemini-model-field.component";
import { AI_SETTINGS_NAME, ConnectionResult, DEFAULT_GEMINI_MODEL, SAVED_KEY_PLACEHOLDER, describeConnection } from "../ai-settings-shared";
import { marker } from "../../i18n/marker";

export { AI_SETTINGS_NAME, DEFAULT_GEMINI_MODEL, describeConnection } from "../ai-settings-shared";
export type { ConnectionResult } from "../ai-settings-shared";

/**
 * The admin's AI page (Phase 3 A1/A2): pick Google Gemini (model + API key) or an LM Studio
 * server (URL, optional key, model), save, and test the connection. It edits the receipt
 * processing settings System Settings points at, creating and linking them the first time. The
 * prompt is built in (A3), so there is none to pick; OCR is fixed to Tesseract for a model that
 * cannot read images.
 */
@Component({
  selector: "app-ai-settings-page",
  host: { class: "block" },
  templateUrl: "./ai-settings-page.component.html",
  standalone: true,
  imports: [
    AiFallbackCardComponent,
    SharedUiModule,
    CheckboxModule,
    GeminiModelFieldComponent,
    CommonModule,
    InputModule,
    HlmButton,
    AppIconComponent,
    PipesModule,
    ReactiveFormsModule,
    SelectModule,
  ],
})
export class AiSettingsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly receiptProcessingSettingsService = inject(ReceiptProcessingSettingsService);
  private readonly systemSettingsService = inject(SystemSettingsService);
  private readonly featureConfigService = inject(FeatureConfigService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);

  public readonly form = this.formBuilder.group({
    aiType: [AiType.Gemini as AiType, Validators.required],
    model: [DEFAULT_GEMINI_MODEL, Validators.required],
    url: [""],
    key: [""],
    isVisionModel: [true],
  });

  /** The settings System Settings points at; undefined until loaded or before the first save. */
  public readonly saved = signal<ReceiptProcessingSettings | undefined>(undefined);

  public readonly loading = signal(true);

  public readonly saving = signal(false);

  public readonly testing = signal(false);

  public readonly connectionResult = signal<ConnectionResult | undefined>(undefined);

  private systemSettings?: SystemSettings;

  private readonly aiType = toSignal(
    this.form.controls.aiType.valueChanges.pipe(startWith(this.form.controls.aiType.value)),
    { requireSync: true }
  );

  public readonly isGemini = computed(() => this.aiType() === AiType.Gemini);

  public readonly isLmStudio = computed(() => this.aiType() === AiType.OpenAiCustom);

  /** Gemini and LM Studio, plus whatever an older setting uses, so it is not lost by opening the page. */
  public readonly providers = computed(() => {
    const options = [
      { value: AiType.Gemini, displayValue: "Google Gemini" },
      { value: AiType.OpenAiCustom, displayValue: marker("LM Studio (on a computer at home)") },
    ];
    const savedType = this.saved()?.aiType;
    if (savedType && !options.some((option) => option.value === savedType)) {
      options.push({ value: savedType, displayValue: `${savedType} (set up before)` });
    }
    return options;
  });

  public ngOnInit(): void {
    this.form.controls.aiType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((aiType) => this.applyProviderRules(aiType));
    this.applyProviderRules(this.form.controls.aiType.value);

    this.systemSettingsService
      .getSystemSettings()
      .pipe(
        take(1),
        // A household member cannot read System Settings (403): the page then works from the processing
        // settings alone, and the server links the first ones they save.
        catchError(() => of(undefined)),
        tap((systemSettings) => (this.systemSettings = systemSettings)),
        switchMap((systemSettings) =>
          systemSettings?.receiptProcessingSettingsId
            ? this.receiptProcessingSettingsService.getReceiptProcessingSettingsById(
                systemSettings.receiptProcessingSettingsId
              )
            : systemSettings
              ? of(undefined)
              : this.firstProcessingSettings()
        ),
        finalize(() => this.loading.set(false))
      )
      .subscribe((settings) => {
        if (settings) {
          this.saved.set(settings);
          this.form.reset({
            aiType: settings.aiType ?? AiType.Gemini,
            model: settings.model ?? "",
            url: settings.url ?? "",
            key: "",
            isVisionModel: settings.isVisionModel ?? true,
          });
        }
      });
  }

  /** A stored key is never sent back, so a saved key shows as dots and an empty key field keeps it. */
  public readonly keyPlaceholder = computed(() => (this.saved() ? SAVED_KEY_PLACEHOLDER : ""));

  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  /** Settings can be tested as typed, saved or not: a saved key covers an empty key box, a new one needs its key or URL. */
  public readonly canTest = computed(() => {
    const value = this.formValue();
    if (this.saved()) {
      return true;
    }
    return value.aiType === AiType.Gemini ? !!(value.key ?? "").trim() : !!(value.url ?? "").trim();
  });

  private buildCommand(): UpsertReceiptProcessingSettingsCommand {
    const saved = this.saved();
    const value = this.form.getRawValue();
    const isGemini = value.aiType === AiType.Gemini;
    return {
      name: saved?.name || AI_SETTINGS_NAME,
      description: saved?.description ?? "",
      aiType: value.aiType!,
      model: (value.model ?? "").trim(),
      // Gemini takes no URL; the API refuses one.
      url: isGemini ? "" : (value.url ?? "").trim(),
      key: (value.key ?? "").trim(),
      isVisionModel: isGemini ? true : !!value.isVisionModel,
      // LM Studio refuses the JSON-object response format the flag asks for.
      enforceJsonResponseFormat: isGemini,
      ocrEngine: saved?.ocrEngine ?? OcrEngine.Tesseract,
    };
  }

  public save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const saved = this.saved();
    const value = this.form.getRawValue();
    const key = (value.key ?? "").trim();
    if (value.aiType === AiType.Gemini && !saved && !key) {
      this.snackbarService.error("Paste the Gemini API key.");
      return;
    }

    const command = this.buildCommand();

    this.saving.set(true);
    const request: Observable<ReceiptProcessingSettings> = saved
      ? this.receiptProcessingSettingsService.updateReceiptProcessingSettingsById(saved.id, key.length > 0, command)
      : this.receiptProcessingSettingsService
          .createReceiptProcessingSettings(command)
          .pipe(switchMap((created) => this.linkToSystemSettings(created)));

    request
      .pipe(
        take(1),
        finalize(() => this.saving.set(false))
      )
      .subscribe((settings) => {
        this.saved.set(settings);
        this.connectionResult.set(undefined);
        this.form.markAsPristine();
        this.form.controls.key.reset("");
        this.snackbarService.success("AI settings saved");
      });
  }

  /**
   * Tests the settings as they are on the page, saved or not. A saved key stands in for an empty key box (the API
   * reads it for this id), so the key never has to be typed twice; an untouched form just tests what is saved.
   */
  public testConnection(): void {
    const saved = this.saved();
    if (!this.canTest() || this.testing()) {
      return;
    }

    const request = saved && !this.form.dirty ? { id: saved.id } : { id: saved?.id, ...this.buildCommand() };

    this.testing.set(true);
    this.connectionResult.set(undefined);
    this.receiptProcessingSettingsService
      .checkReceiptProcessingSettingsConnectivity(request)
      .pipe(
        take(1),
        map((task) => describeConnection(task.status, task.resultDescription)),
        finalize(() => this.testing.set(false))
      )
      .subscribe((result) => this.connectionResult.set(result));
  }

  // The first processing settings there are: what a member who cannot read System Settings edits.
  private firstProcessingSettings(): Observable<ReceiptProcessingSettings | undefined> {
    return this.receiptProcessingSettingsService
      .getPagedProcessingSettings({ page: 1, pageSize: 1, orderBy: "name", sortDirection: "asc" })
      .pipe(
        map((response) => (response.data as unknown as ReceiptProcessingSettings[])[0]),
        catchError(() => of(undefined))
      );
  }

  // Points System Settings at new settings, then refreshes the AI feature flag the app reads.
  private linkToSystemSettings(created: ReceiptProcessingSettings): Observable<ReceiptProcessingSettings> {
    // Without access to System Settings the server has already linked the first settings; only the AI flag
    // the app reads needs refreshing.
    if (!this.systemSettings) {
      return this.featureConfigService.getFeatureConfig().pipe(
        tap((featureConfig) => this.store.dispatch(new SetFeatureConfig(featureConfig))),
        map(() => created)
      );
    }

    const command = {
      ...(this.systemSettings ?? {}),
      receiptProcessingSettingsId: created.id,
    } as UpsertSystemSettingsCommand;

    return this.systemSettingsService.updateSystemSettings(command).pipe(
      tap((systemSettings) => (this.systemSettings = systemSettings)),
      switchMap(() => this.featureConfigService.getFeatureConfig()),
      tap((featureConfig) => this.store.dispatch(new SetFeatureConfig(featureConfig))),
      map(() => created)
    );
  }

  // LM Studio needs a URL; Gemini always reads images and takes no URL.
  private applyProviderRules(aiType: AiType | null): void {
    const url = this.form.controls.url;
    if (aiType === AiType.OpenAiCustom || aiType === AiType.Ollama) {
      url.setValidators(Validators.required);
    } else {
      url.clearValidators();
    }
    url.updateValueAndValidity({ emitEvent: false });
  }
}
