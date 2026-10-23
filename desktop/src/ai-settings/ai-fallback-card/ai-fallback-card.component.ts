import { Component, DestroyRef, computed, inject, input, OnInit, signal, ChangeDetectionStrategy } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { catchError, finalize, map, Observable, of, startWith, switchMap, take, tap } from "rxjs";
import { CheckboxModule } from "../../checkbox/checkbox.module";
import {
  ReceiptProcessingSettings,
  ReceiptProcessingSettingsService,
  SystemSettings,
  SystemSettingsService,
  SystemTaskStatus,
  UpsertSystemSettingsCommand,
} from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SnackbarService } from "../../services";
import { TranslationService } from "../../i18n/translation.service";
import { marker } from "../../i18n/marker";
import { AiProviderFieldsComponent } from "../ai-provider-fields/ai-provider-fields.component";
import {
  ConnectionResult,
  buildAiProviderControls,
  buildProviderCommand,
  canTestProvider,
  describeConnection,
  needsNewKey,
  providerName,
  providerValueFrom,
  watchProviderRules,
} from "../ai-settings-shared";

/** What the backup AI settings are called; a processing setting's name must be unique. */
export const AI_FALLBACK_SETTINGS_NAME = "Household AI backup";

/**
 * The backup AI, any of the main AI's providers (Claude, Gemini, ChatGPT, Local LM): used when the main AI cannot be
 * reached or fails. It is a second set of receipt processing settings that System Settings points at as the fallback.
 * Turning it off only unlinks it, so the provider, model and key are kept for the next time. It needs access to System
 * Settings (the link lives there), so a household member without it simply does not see this card.
 */
@Component({
  selector: "app-ai-fallback-card",
  host: { class: "block" },
  templateUrl: "./ai-fallback-card.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SharedUiModule, AppIconComponent, AiProviderFieldsComponent, CheckboxModule, HlmButton, PipesModule, ReactiveFormsModule],
})
export class AiFallbackCardComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly receiptProcessingSettingsService = inject(ReceiptProcessingSettingsService);
  private readonly systemSettingsService = inject(SystemSettingsService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  /** The main AI's settings id: a backup only makes sense next to a saved main AI. */
  public readonly primaryId = input<number | undefined>(undefined);

  public readonly form = this.formBuilder.group({
    enabled: this.formBuilder.control<boolean | null>(false),
    ...buildAiProviderControls(this.formBuilder),
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

  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  /** The backup can be tested as typed: a saved key covers an empty key box for its own provider, a new one needs its key. */
  public readonly canTest = computed(() => {
    const value = this.formValue();
    return !!value.enabled && canTestProvider(value, this.saved());
  });

  public ngOnInit(): void {
    watchProviderRules(this.form.controls, this.destroyRef);

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
          this.form.reset({ enabled: true, ...providerValueFrom(settings) });
        }
      });
  }

  public save(): void {
    if (!this.canSave()) {
      return;
    }

    const value = this.form.getRawValue();
    if (!value.enabled) {
      this.unlink();
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const key = (value.key ?? "").trim();
    const saved = this.saved();

    if (needsNewKey(value, saved) && !key) {
      this.snackbarService.error(
        this.translation.t(marker("Paste the {provider} API key for the backup AI."), {
          provider: providerName(value.aiType),
        })
      );
      return;
    }

    const command = buildProviderCommand(value, saved, AI_FALLBACK_SETTINGS_NAME);

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

    const request =
      saved && !this.form.dirty
        ? { id: saved.id }
        : { id: saved?.id, ...buildProviderCommand(this.form.getRawValue(), saved, AI_FALLBACK_SETTINGS_NAME) };

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

  // Turning the backup off only unlinks it; the saved settings stay for the next time it is switched on.
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
