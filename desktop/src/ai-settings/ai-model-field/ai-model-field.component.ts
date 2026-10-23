import { Component, computed, effect, inject, input, signal, untracked, ChangeDetectionStrategy } from "@angular/core";
import { FormControl } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { finalize, take } from "rxjs";
import { AiType } from "../../constants/ai-type";
import { AiModel, ReceiptProcessingSettingsService } from "../../open-api";
import { InputModule } from "../../input/input.module";
import { PipesModule } from "../../pipes/pipes.module";
import { SelectModule } from "../../select/select.module";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { marker } from "../../i18n/marker";
import { defaultModelFor, providerCompany } from "../ai-settings-shared";

/**
 * The model field for a cloud provider (Claude, Gemini, ChatGPT): a dropdown of the models the API key can use, fetched
 * from the provider through the API, falling back to a plain text box until the list is loaded or when the provider
 * refuses the key. The typed key is used when there is one; otherwise the key of the saved settings (`settingsId`) is
 * used server-side, so the stored key never reaches the browser.
 */
@Component({
  selector: "app-ai-model-field",
  host: { class: "block" },
  templateUrl: "./ai-model-field.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AppIconComponent, HlmButton, InputModule, PipesModule, SelectModule],
})
export class AiModelFieldComponent {
  private readonly receiptProcessingSettingsService = inject(ReceiptProcessingSettingsService);

  public readonly modelControl = input.required<FormControl<string | null>>();

  public readonly keyControl = input.required<FormControl<string | null>>();

  public readonly aiType = input.required<AiType>();

  /** Saved settings of this provider, whose stored key is used while no key is typed. */
  public readonly settingsId = input<number | undefined>(undefined);

  public readonly testId = input("ai-model");

  public readonly models = signal<AiModel[]>([]);

  public readonly loading = signal(false);

  public readonly error = signal<string | undefined>(undefined);

  public readonly company = computed(() => ({ company: providerCompany(this.aiType()) }));

  public readonly example = computed(() => ({ model: defaultModelFor(this.aiType()) }));

  /** The loaded models, plus the current value when the provider no longer lists it, so opening the page never loses it. */
  public readonly options = computed(() => {
    const options = this.models().map((model) => ({ value: model.name, displayValue: model.displayName }));
    const current = (this.modelControl().value ?? "").trim();
    if (current && !options.some((option) => option.value === current)) {
      options.unshift({ value: current, displayValue: current });
    }
    return options;
  });

  public readonly hasModels = computed(() => this.models().length > 0);

  public readonly canLoad = computed(() => !this.loading());

  constructor() {
    // Another provider starts with no list; a saved key can list its models straight away, a typed one waits for the button.
    effect(() => {
      const settingsId = this.settingsId();
      this.aiType();
      untracked(() => {
        this.models.set([]);
        this.error.set(undefined);
        if (settingsId !== undefined) {
          this.load();
        }
      });
    });
  }

  public load(): void {
    const typedKey = (this.keyControl().value ?? "").trim();
    const settingsId = this.settingsId();
    if (this.loading() || (!typedKey && settingsId === undefined)) {
      if (!typedKey && settingsId === undefined) {
        this.error.set(marker("Paste the API key first."));
      }
      return;
    }

    const aiType = this.aiType();
    this.loading.set(true);
    this.error.set(undefined);
    this.receiptProcessingSettingsService
      .getAiModels(typedKey ? { aiType, key: typedKey } : { aiType, receiptProcessingSettingsId: settingsId })
      .pipe(
        take(1),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (models) => {
          this.models.set(models);
          if (models.length === 0) {
            this.error.set(marker("No models were listed for this key."));
          }
        },
        error: (response) => {
          this.models.set([]);
          this.error.set(
            response?.error?.errors?.key ?? response?.error?.errorMsg ?? marker("The models could not be loaded. Type the name instead.")
          );
        },
      });
  }
}
