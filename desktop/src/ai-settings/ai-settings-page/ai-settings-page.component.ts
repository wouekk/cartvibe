import { CommonModule } from "@angular/common";
import { Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
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
  SystemTaskStatus,
  UpsertReceiptProcessingSettingsCommand,
  UpsertSystemSettingsCommand,
} from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SelectModule } from "../../select/select.module";
import { SnackbarService } from "../../services";
import { SetFeatureConfig } from "../../store";

/** What a new household AI setting is called; a processing setting's name must be unique. */
export const AI_SETTINGS_NAME = "Household AI";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** The outcome of "Test connection", as the page shows it. */
export interface ConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * The admin's AI page (Phase 3 A1/A2): pick Google Gemini (model + API key) or an LM Studio
 * server (URL, optional key, model), save, and test the connection. It edits the receipt
 * processing settings System Settings points at, creating and linking them the first time. The
 * prompt is built in (A3), so there is none to pick; OCR is fixed to Tesseract for a model that
 * cannot read images.
 */
@Component({
  selector: "app-ai-settings-page",
  templateUrl: "./ai-settings-page.component.html",
  styleUrls: ["./ai-settings-page.component.scss"],
  standalone: true,
  imports: [
    CheckboxModule,
    CommonModule,
    InputModule,
    MatButtonModule,
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
      { value: AiType.OpenAiCustom, displayValue: "LM Studio (on a computer at home)" },
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

  /** A stored key is never sent back, so an empty key field keeps it. */
  public readonly keyHint = computed(() =>
    this.saved() ? "A key is saved. Leave this empty to keep it." : undefined
  );

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

    const isGemini = value.aiType === AiType.Gemini;
    const command: UpsertReceiptProcessingSettingsCommand = {
      name: saved?.name || AI_SETTINGS_NAME,
      description: saved?.description ?? "",
      aiType: value.aiType!,
      model: (value.model ?? "").trim(),
      // Gemini takes no URL; the API refuses one.
      url: isGemini ? "" : (value.url ?? "").trim(),
      key,
      isVisionModel: isGemini ? true : !!value.isVisionModel,
      // LM Studio refuses the JSON-object response format the flag asks for.
      enforceJsonResponseFormat: isGemini,
      ocrEngine: saved?.ocrEngine ?? OcrEngine.Tesseract,
      // 0: the API points it at the default prompt; the prompt itself is built in (A3).
      promptId: saved?.promptId ?? 0,
    };

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

  /** Tests what is saved, with the saved key, so the key never has to be typed twice. */
  public testConnection(): void {
    const saved = this.saved();
    if (!saved || this.testing()) {
      return;
    }

    this.testing.set(true);
    this.connectionResult.set(undefined);
    this.receiptProcessingSettingsService
      .checkReceiptProcessingSettingsConnectivity({ id: saved.id })
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

/** "Connected", or why not, from the connectivity check's system task. */
export function describeConnection(status: SystemTaskStatus | undefined, resultDescription?: string): ConnectionResult {
  if (status === SystemTaskStatus.Succeeded) {
    return { ok: true, message: "Connected. Receipts will be read by this AI." };
  }

  return {
    ok: false,
    message: `Not connected: ${resultDescription?.trim() || "no answer from the AI"}`,
  };
}
