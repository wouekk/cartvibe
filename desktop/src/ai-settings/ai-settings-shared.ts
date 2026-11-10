import { DestroyRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormControl, Validators } from "@angular/forms";
import { AiType } from "../constants/ai-type";
import { OcrEngine, ReceiptProcessingSettings, SystemTaskStatus, UpsertReceiptProcessingSettingsCommand } from "../open-api";
import { marker } from "../i18n/marker";

/** What a new household AI setting is called; a processing setting's name must be unique. */
export const AI_SETTINGS_NAME = "Household AI";

/** The providers the AI page offers, in this order. Brand names stay as they are in every language. */
export const AI_PROVIDER_OPTIONS: { value: AiType; displayValue: string }[] = [
  { value: AiType.Anthropic, displayValue: "Claude" },
  { value: AiType.Gemini, displayValue: "Gemini" },
  { value: AiType.OpenAi, displayValue: "ChatGPT" },
  { value: AiType.OpenAiCustom, displayValue: marker("Local LM") },
  { value: AiType.Ollama, displayValue: "Ollama" },
];

/** The most a context size may be (the API's own bound). */
export const MAX_AI_CONTEXT_SIZE = 1048576;

/** The offered providers, plus whatever an older setting uses, so opening the page does not lose it. */
export function providerOptions(savedType: AiType | undefined): { value: string; displayValue: string }[] {
  const options = [...AI_PROVIDER_OPTIONS];
  if (savedType && !options.some((option) => option.value === savedType)) {
    options.push({ value: savedType, displayValue: `${savedType} (set up before)` });
  }
  return options;
}

/** The name a person knows the provider by, for messages. */
export function providerName(aiType: AiType | null | undefined): string {
  return AI_PROVIDER_OPTIONS.find((option) => option.value === aiType)?.displayValue ?? (aiType || "AI");
}

/** The company that lists a cloud provider's models. */
export function providerCompany(aiType: AiType | null | undefined): string {
  switch (aiType) {
    case AiType.Anthropic:
      return "Anthropic";
    case AiType.OpenAi:
      return "OpenAI";
    default:
      return "Google";
  }
}

/** Claude, Gemini and ChatGPT: a key is required, there is no URL, images are always read, models can be listed. */
export function isCloudProvider(aiType: AiType | null | undefined): boolean {
  return aiType === AiType.Anthropic || aiType === AiType.Gemini || aiType === AiType.OpenAi;
}

/** A server on a computer at home (LM Studio, Ollama): needs a URL, the key is optional. */
export function isLocalProvider(aiType: AiType | null | undefined): boolean {
  return aiType === AiType.OpenAiCustom || aiType === AiType.Ollama;
}

/** The controls of one AI provider, shared by the main AI and the backup AI. */
export interface AiProviderControls {
  aiType: FormControl<AiType | null>;
  model: FormControl<string | null>;
  url: FormControl<string | null>;
  key: FormControl<string | null>;
  isVisionModel: FormControl<boolean | null>;
  /** Ollama only: how many tokens of the prompt the model keeps (num_ctx). Empty keeps Ollama's own default. */
  contextSize: FormControl<number | null>;
}

export type AiProviderValue = {
  aiType?: AiType | null;
  model?: string | null;
  url?: string | null;
  key?: string | null;
  isVisionModel?: boolean | null;
  contextSize?: number | null;
};

export function buildAiProviderControls(formBuilder: FormBuilder, aiType: AiType = AiType.Gemini): AiProviderControls {
  return {
    aiType: formBuilder.control<AiType | null>(aiType, Validators.required),
    // No model is chosen for anyone: models are billed by the token at very different prices, so a person picks one.
    model: formBuilder.control<string | null>("", Validators.required),
    url: formBuilder.control<string | null>(""),
    key: formBuilder.control<string | null>(""),
    isVisionModel: formBuilder.control<boolean | null>(true),
    contextSize: formBuilder.control<number | null>(null, [Validators.min(0), Validators.max(MAX_AI_CONTEXT_SIZE)]),
  };
}

/** The form value of saved settings; the key box always starts empty (a stored key is never sent back). */
export function providerValueFrom(settings: ReceiptProcessingSettings): Required<AiProviderValue> {
  return {
    aiType: settings.aiType ?? AiType.Gemini,
    model: settings.model ?? "",
    url: settings.url ?? "",
    key: "",
    isVisionModel: settings.isVisionModel ?? true,
    contextSize: settings.contextSize || null,
  };
}

/**
 * Keeps the provider's rules on the form: a local server needs a URL. When a person picks another provider, the model
 * and the key box empty (another company's model name means nothing here, and a key typed for one company must never
 * be sent to another).
 */
export function watchProviderRules(controls: AiProviderControls, destroyRef: DestroyRef): void {
  const apply = (aiType: AiType | null) => {
    if (isLocalProvider(aiType)) {
      controls.url.setValidators(Validators.required);
    } else {
      controls.url.clearValidators();
    }
    controls.url.updateValueAndValidity({ emitEvent: false });
  };

  controls.aiType.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe((aiType) => {
    apply(aiType);
    // A reset (loading saved settings) leaves the control pristine; only a person's pick clears the model.
    if (controls.aiType.dirty) {
      controls.model.setValue("");
      controls.key.setValue("");
    }
  });
  apply(controls.aiType.value);
}

/** Saved settings of another provider have no key for this one: a new key has to be typed. */
export function needsNewKey(value: AiProviderValue, saved: ReceiptProcessingSettings | undefined): boolean {
  return isCloudProvider(value.aiType) && (!saved || saved.aiType !== value.aiType);
}

/** Settings can be tested as typed, saved or not: a saved key covers an empty key box for its own provider only. */
export function canTestProvider(value: AiProviderValue, saved: ReceiptProcessingSettings | undefined): boolean {
  if (isLocalProvider(value.aiType)) {
    return !!saved || !!(value.url ?? "").trim();
  }
  return !needsNewKey(value, saved) || !!(value.key ?? "").trim();
}

/** The command for these settings. Cloud providers take no URL (the API refuses one) and always read images. */
export function buildProviderCommand(
  value: AiProviderValue,
  saved: ReceiptProcessingSettings | undefined,
  defaultName: string
): UpsertReceiptProcessingSettingsCommand {
  const aiType = value.aiType ?? AiType.Gemini;
  const cloud = isCloudProvider(aiType);
  return {
    name: saved?.name || defaultName,
    description: saved?.description ?? "",
    aiType,
    model: (value.model ?? "").trim(),
    url: cloud ? "" : (value.url ?? "").trim(),
    key: (value.key ?? "").trim(),
    isVisionModel: cloud ? true : !!value.isVisionModel,
    // Gemini, ChatGPT and Ollama can be held to JSON answers; LM Studio refuses that flag. Claude and every other
    // provider get the schema of the answer where the API has one for the call, whatever this says.
    enforceJsonResponseFormat: aiType === AiType.Gemini || aiType === AiType.OpenAi || aiType === AiType.Ollama,
    // Only Ollama reads it; 0 leaves its own default.
    contextSize: aiType === AiType.Ollama ? Math.trunc(Number(value.contextSize)) || 0 : 0,
    ocrEngine: saved?.ocrEngine ?? OcrEngine.Tesseract,
  };
}

/** The outcome of "Test connection", as the AI page shows it. */
export interface ConnectionResult {
  ok: boolean;
  /** An English message with {placeholders}; show it through the `t` pipe with `params`. */
  message: string;
  params?: Record<string, string>;
}

/** "Connected", or why not, from the connectivity check's system task. */
export function describeConnection(status: SystemTaskStatus | undefined, resultDescription?: string): ConnectionResult {
  if (status === SystemTaskStatus.Succeeded) {
    return { ok: true, message: marker("Connected. Receipts will be read by this AI.") };
  }

  return {
    ok: false,
    message: marker("Not connected: {reason}"),
    params: { reason: resultDescription?.trim() || "no answer from the AI" },
  };
}

/** What a saved key shows in the key box: dots, the way a typed one looks. The key itself is never sent back. */
export const SAVED_KEY_PLACEHOLDER = "••••••••••••••••••••••••";
