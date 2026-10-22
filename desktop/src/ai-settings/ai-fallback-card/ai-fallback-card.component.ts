import { Component, computed, inject, input, OnInit, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { catchError, finalize, map, Observable, of, startWith, switchMap, take, tap } from "rxjs";
import { CheckboxModule } from "../../checkbox/checkbox.module";
import { InputModule } from "../../input/input.module";
import {
  AiType,
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
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SnackbarService } from "../../services";
import { GeminiModelFieldComponent } from "../gemini-model-field/gemini-model-field.component";
import { ConnectionResult, DEFAULT_GEMINI_MODEL, SAVED_KEY_PLACEHOLDER, describeConnection } from "../ai-settings-shared";

/** What the backup AI settings are called; a processing setting's name must be unique. */
export const AI_FALLBACK_SETTINGS_NAME = "Household AI backup";

/**
 * The backup AI (only Google Gemini for now): used when the main AI cannot be reached or fails. It is a second set of
 * receipt processing settings that System Settings points at as the fallback. Turning it off only unlinks it, so the
 * model and key are kept for the next time. It needs access to System Settings (the link lives there), so a household
 * member without it simply does not see this card.
 */
@Component({
  selector: "app-ai-fallback-card",
  host: { class: "block" },
  templateUrl: "./ai-fallback-card.component.html",
  standalone: true,
  imports: [SharedUiModule, AppIconComponent, CheckboxModule, GeminiModelFieldComponent, HlmButton, InputModule, PipesModule, ReactiveFormsModule],
})
export class AiFallbackCardComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly receiptProcessingSettingsService = inject(ReceiptProcessingSettingsService);
  private readonly systemSettingsService = inject(SystemSettingsService);
  private readonly snackbarService = inject(SnackbarService);

  /** The main AI's settings id: a backup only makes sense next to a saved main AI. */
  public readonly primaryId = input<number | undefined>(undefined);

  public readonly form = this.formBuilder.group({
    enabled: [false],
    model: [DEFAULT_GEMINI_MODEL, Validators.required],
    key: [""],
  });

  /** System Settings, or undefined when the user cannot read them (the card is then hidden). */
  public readonly systemSettings = signal<SystemSettings | undefined>(undefined);

  public readonly saved = signal<ReceiptProcessingSettings | undefined>(undefined);

  public readonly loading = signal(true);

  public readonly saving = signal(false);

  public readonly testing = signal(false);

  public readonly connectionResult = signal<ConnectionResult | undefined>(undefined);

  public readonly visible = computed(() => !this.loading() && !!this.systemSettings());

  public readonly canSave = computed(() => this.primaryId() !== undefined && !this.saving());

  public readonly keyPlaceholder = computed(() => (this.saved() ? SAVED_KEY_PLACEHOLDER : ""));

  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  /** The backup can be tested as typed: a saved key covers an empty key box, a new one needs its key. */
  public readonly canTest = computed(() => {
    const value = this.formValue();
    return !!value.enabled && (!!this.saved() || !!(value.key ?? "").trim());
  });

  public ngOnInit(): void {
    this.systemSettingsService
      .getSystemSettings()
      .pipe(
        take(1),
        catchError(() => of(undefined)),
        tap((systemSettings) => this.systemSettings.set(systemSettings)),
        switchMap((systemSettings) =>
          systemSettings?.fallbackReceiptProcessingSettingsId
            ? this.receiptProcessingSettingsService.getReceiptProcessingSettingsById(
                systemSettings.fallbackReceiptProcessingSettingsId
              )
            : of(undefined)
        ),
        finalize(() => this.loading.set(false))
      )
      .subscribe((settings) => {
        if (settings) {
          this.saved.set(settings);
          this.form.reset({ enabled: true, model: settings.model ?? DEFAULT_GEMINI_MODEL, key: "" });
        }
      });
  }

  public save(): void {
    if (!this.canSave()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const key = (value.key ?? "").trim();
    const saved = this.saved();

    if (!value.enabled) {
      this.unlink();
      return;
    }

    if (!saved && !key) {
      this.snackbarService.error("Paste the Gemini API key for the backup AI.");
      return;
    }

    const command: UpsertReceiptProcessingSettingsCommand = {
      name: saved?.name || AI_FALLBACK_SETTINGS_NAME,
      description: saved?.description ?? "",
      aiType: AiType.Gemini,
      model: (value.model ?? "").trim(),
      url: "",
      key,
      isVisionModel: true,
      enforceJsonResponseFormat: true,
      ocrEngine: saved?.ocrEngine ?? OcrEngine.Tesseract,
      promptId: saved?.promptId ?? 0,
    };

    this.saving.set(true);
    const request: Observable<ReceiptProcessingSettings> = saved
      ? this.receiptProcessingSettingsService.updateReceiptProcessingSettingsById(saved.id, key.length > 0, command)
      : this.receiptProcessingSettingsService.createReceiptProcessingSettings(command);

    request
      .pipe(
        take(1),
        switchMap((settings) => this.link(settings.id).pipe(map(() => settings))),
        finalize(() => this.saving.set(false))
      )
      .subscribe((settings) => {
        this.saved.set(settings);
        this.connectionResult.set(undefined);
        this.form.markAsPristine();
        this.form.controls.key.reset("");
        this.snackbarService.success("Backup AI saved");
      });
  }

  public testConnection(): void {
    const saved = this.saved();
    if (!this.canTest() || this.testing()) {
      return;
    }

    const value = this.form.getRawValue();
    const request =
      saved && !this.form.dirty
        ? { id: saved.id }
        : {
            id: saved?.id,
            name: saved?.name || AI_FALLBACK_SETTINGS_NAME,
            description: saved?.description ?? "",
            aiType: AiType.Gemini,
            model: (value.model ?? "").trim(),
            url: "",
            key: (value.key ?? "").trim(),
            isVisionModel: true,
            enforceJsonResponseFormat: true,
            ocrEngine: saved?.ocrEngine ?? OcrEngine.Tesseract,
            promptId: saved?.promptId ?? 0,
          };

    this.testing.set(true);
    this.connectionResult.set(undefined);
    this.receiptProcessingSettingsService
      .checkReceiptProcessingSettingsConnectivity(request)
      .pipe(
        take(1),
        map((task) => describeConnection(task.status as SystemTaskStatus | undefined, task.resultDescription)),
        finalize(() => this.testing.set(false))
      )
      .subscribe((result) => this.connectionResult.set(result));
  }

  // Turning the backup off only unlinks it; the saved model and key stay for the next time it is switched on.
  private unlink(): void {
    if (!this.systemSettings()?.fallbackReceiptProcessingSettingsId) {
      this.snackbarService.success("Backup AI is off");
      this.form.markAsPristine();
      return;
    }

    this.saving.set(true);
    this.link(undefined)
      .pipe(
        take(1),
        finalize(() => this.saving.set(false))
      )
      .subscribe(() => {
        this.form.markAsPristine();
        this.connectionResult.set(undefined);
        this.snackbarService.success("Backup AI is off");
      });
  }

  // Points System Settings at the backup (or at none), keeping everything else as it is.
  private link(fallbackId: number | undefined): Observable<SystemSettings> {
    const command = {
      ...(this.systemSettings() ?? {}),
      fallbackReceiptProcessingSettingsId: fallbackId ?? null,
    } as unknown as UpsertSystemSettingsCommand;

    return this.systemSettingsService
      .updateSystemSettings(command)
      .pipe(tap((systemSettings) => this.systemSettings.set(systemSettings)));
  }
}
