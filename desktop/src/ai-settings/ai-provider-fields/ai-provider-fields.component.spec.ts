import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormBuilder } from "@angular/forms";
import { of } from "rxjs";
import type { Mock } from "vitest";
import { AiType } from "../../constants/ai-type";
import { ReceiptProcessingSettings, ReceiptProcessingSettingsService } from "../../open-api";
import { AiProviderControls, SAVED_KEY_PLACEHOLDER, buildAiProviderControls } from "../ai-settings-shared";
import { AiProviderFieldsComponent } from "./ai-provider-fields.component";

const savedClaude = { id: 12, name: "Household AI", aiType: AiType.Anthropic, model: "claude-opus-5-5" } as ReceiptProcessingSettings;

describe("AiProviderFieldsComponent", () => {
  let fixture: ComponentFixture<AiProviderFieldsComponent>;
  let controls: AiProviderControls;
  let service: { getAiModels: Mock };

  const field = (name: string, prefix = "ai"): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${prefix}-${name}"]`);
  const keyInput = (): HTMLInputElement => field("key")!.querySelector("input")!;

  const setUp = async (aiType: string, saved?: ReceiptProcessingSettings, prefix?: string) => {
    service = { getAiModels: vi.fn(() => of([])) };
    await TestBed.configureTestingModule({
      imports: [AiProviderFieldsComponent],
      providers: [provideZonelessChangeDetection(), { provide: ReceiptProcessingSettingsService, useValue: service }],
    }).compileComponents();
    controls = buildAiProviderControls(TestBed.inject(FormBuilder), aiType);
    fixture = TestBed.createComponent(AiProviderFieldsComponent);
    fixture.componentRef.setInput("controls", controls);
    fixture.componentRef.setInput("saved", saved);
    if (prefix) {
      fixture.componentRef.setInput("testIdPrefix", prefix);
    }
    await fixture.whenStable();
  };

  const pick = async (aiType: string) => {
    controls.aiType.setValue(aiType);
    await fixture.whenStable();
  };

  it("asks a cloud provider for a key and a model it can list, and no server URL", async () => {
    await setUp(AiType.Gemini);

    expect(field("url")).toBeNull();
    expect(field("vision")).toBeNull();
    expect(field("key")?.textContent).toContain("API key");
    expect(field("key")?.textContent).not.toContain("optional");
    expect(field("model-load")).not.toBeNull();
  });

  it("asks a local server for its URL, an optional key, a typed model name and whether it reads images", async () => {
    await setUp(AiType.OpenAiCustom);

    expect(field("url")?.querySelector("input")?.getAttribute("placeholder")).toBe("http://192.168.1.20:1234/v1");
    expect(field("key")?.textContent).toContain("API key (optional)");
    expect(field("model")?.querySelector("input")).not.toBeNull();
    expect(field("model-load")).toBeNull();
    expect(field("vision")).not.toBeNull();
  });

  it("switches the fields as soon as another provider is picked", async () => {
    await setUp(AiType.Anthropic);
    expect(field("url")).toBeNull();

    await pick(AiType.Ollama);
    expect(field("url")).not.toBeNull();
    expect(fixture.componentInstance.isLocal()).toBe(true);

    await pick(AiType.OpenAi);
    expect(field("url")).toBeNull();
    expect(fixture.componentInstance.isCloud()).toBe(true);
  });

  it("shows a stored key as dots, and lists its models, only for the provider it was saved under", async () => {
    await setUp(AiType.Anthropic, savedClaude);

    expect(keyInput().getAttribute("placeholder")).toBe(SAVED_KEY_PLACEHOLDER);
    expect(keyInput().value).toBe("");
    expect(service.getAiModels).toHaveBeenCalledWith({ aiType: AiType.Anthropic, receiptProcessingSettingsId: 12 });

    service.getAiModels.mockClear();
    await pick(AiType.Gemini);

    expect(keyInput().getAttribute("placeholder") ?? "").toBe("");
    expect(fixture.componentInstance.modelSettingsId()).toBeUndefined();
    expect(service.getAiModels).not.toHaveBeenCalledWith(expect.objectContaining({ receiptProcessingSettingsId: 12 }));
  });

  it("lists Ollama once when it is the saved provider", async () => {
    await setUp(AiType.Ollama, { id: 3, aiType: AiType.Ollama } as ReceiptProcessingSettings);

    expect(fixture.componentInstance.providers().map((option) => option.displayValue)).toEqual([
      "Claude",
      "Gemini",
      "ChatGPT",
      "Local LM",
      "Ollama",
    ]);
  });

  it("names its test ids after the prefix, so the main and backup AI do not collide", async () => {
    await setUp(AiType.OpenAiCustom, undefined, "fallback");

    for (const name of ["provider", "url", "key", "model", "vision"]) {
      expect(field(name, "fallback")).not.toBeNull();
      expect(field(name)).toBeNull();
    }
  });
});
