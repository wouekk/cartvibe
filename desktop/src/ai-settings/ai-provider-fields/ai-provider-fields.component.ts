import { Component, computed, input } from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ReactiveFormsModule } from "@angular/forms";
import { startWith, switchMap } from "rxjs";
import { CheckboxModule } from "../../checkbox/checkbox.module";
import { AiType } from "../../constants/ai-type";
import { InputModule } from "../../input/input.module";
import { ReceiptProcessingSettings } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SelectModule } from "../../select/select.module";
import { AiModelFieldComponent } from "../ai-model-field/ai-model-field.component";
import {
  AiProviderControls,
  SAVED_KEY_PLACEHOLDER,
  isCloudProvider,
  isLocalProvider,
  needsNewKey,
  providerOptions,
} from "../ai-settings-shared";

/**
 * The fields of one AI provider: the provider dropdown (Claude, Gemini, ChatGPT, Local LM), then what that provider
 * needs. A cloud provider takes an API key and a model from the key's list; a local server takes its URL, an optional
 * key, a model name and whether it reads images. The main AI and the backup AI both use it, so they cannot drift.
 */
@Component({
  selector: "app-ai-provider-fields",
  host: { class: "contents" },
  templateUrl: "./ai-provider-fields.component.html",
  standalone: true,
  imports: [AiModelFieldComponent, CheckboxModule, InputModule, PipesModule, ReactiveFormsModule, SelectModule],
})
export class AiProviderFieldsComponent {
  public readonly controls = input.required<AiProviderControls>();

  /** The saved settings these fields edit, if any. */
  public readonly saved = input<ReceiptProcessingSettings | undefined>(undefined);

  /** Prefix of every test id: `ai` gives `ai-provider`, `ai-key`, `ai-model`, ... */
  public readonly testIdPrefix = input("ai");

  private readonly aiType = toSignal(
    toObservable(this.controls).pipe(
      switchMap((controls) => controls.aiType.valueChanges.pipe(startWith(controls.aiType.value)))
    ),
    { initialValue: AiType.Gemini as AiType | null }
  );

  public readonly isCloud = computed(() => isCloudProvider(this.aiType()));

  public readonly isLocal = computed(() => isLocalProvider(this.aiType()));

  public readonly currentAiType = computed(() => this.aiType() ?? AiType.Gemini);

  public readonly providers = computed(() => providerOptions(this.saved()?.aiType));

  /** The stored key only counts for the provider it was saved for. */
  private readonly hasStoredKey = computed(() => {
    const saved = this.saved();
    return !!saved && !needsNewKey({ aiType: this.aiType() }, saved);
  });

  /** A stored key is never sent back, so a saved key shows as dots and an empty key field keeps it. */
  public readonly keyPlaceholder = computed(() => (this.hasStoredKey() ? SAVED_KEY_PLACEHOLDER : ""));

  /** Saved settings whose stored key may list this provider's models. */
  public readonly modelSettingsId = computed(() => (this.hasStoredKey() ? this.saved()?.id : undefined));

  public testId(name: string): string {
    return `${this.testIdPrefix()}-${name}`;
  }
}
