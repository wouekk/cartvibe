import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { AiType } from "../../constants/ai-type";
import {
  FeatureConfigService,
  ReceiptProcessingSettingsService,
  SystemSettingsService,
  SystemTaskStatus,
} from "../../open-api";
import { SnackbarService } from "../../services";
import { AI_SETTINGS_NAME, AiSettingsPageComponent, describeConnection } from "./ai-settings-page.component";

import type { Mock } from "vitest";
describe("AiSettingsPageComponent", () => {
  let fixture: ComponentFixture<AiSettingsPageComponent>;
  let component: AiSettingsPageComponent;
  let processingService: { [method: string]: Mock };
  let systemSettingsService: { [method: string]: Mock };
  let snackbar: { success: Mock; error: Mock };

  const setUp = async (systemSettings: object, stored?: object): Promise<void> => {
    processingService = {
      getReceiptProcessingSettingsById: vi.fn(() => of(stored)),
      getAiModels: vi.fn(() => of([])),
      getAiUsage: vi.fn(() => of([])),
      createReceiptProcessingSettings: vi.fn((command) => of({ id: 5, ...command })),
      updateReceiptProcessingSettingsById: vi.fn((id, _updateKey, command) => of({ id, ...command })),
      checkReceiptProcessingSettingsConnectivity: vi.fn(() =>
        of({ status: SystemTaskStatus.Succeeded, resultDescription: "" })
      ),
    };
    systemSettingsService = {
      getSystemSettings: vi.fn(() => of(systemSettings)),
      updateSystemSettings: vi.fn((command) => of(command)),
    };
    snackbar = { success: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AiSettingsPageComponent, NgxsModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReceiptProcessingSettingsService, useValue: processingService },
        { provide: SystemSettingsService, useValue: systemSettingsService },
        { provide: FeatureConfigService, useValue: { getFeatureConfig: vi.fn(() => of({ aiPoweredReceipts: true })) } },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiSettingsPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  };

  it("creates Gemini settings and points System Settings at them", async () => {
    await setUp({ pdfDpi: 200 });
    component.form.patchValue({ model: "gemini-2.5-flash", key: "secret" });

    component.save();

    const command = processingService["createReceiptProcessingSettings"].mock.calls[0][0];
    expect(command).toEqual(
      expect.objectContaining({
        name: AI_SETTINGS_NAME,
        aiType: AiType.Gemini,
        url: "",
        key: "secret",
        isVisionModel: true,
        enforceJsonResponseFormat: true,
      })
    );
    expect(systemSettingsService["updateSystemSettings"]).toHaveBeenCalledWith(
      expect.objectContaining({ pdfDpi: 200, receiptProcessingSettingsId: 5 })
    );
    expect(component.saved()?.id).toBe(5);
  });

  it("offers Claude, Gemini, ChatGPT, Local LM and Ollama, in that order", async () => {
    await setUp({});
    const fields = fixture.debugElement.query((element) => element.name === "app-ai-provider-fields");

    expect(fields.componentInstance.providers().map((option: { displayValue: string }) => option.displayValue)).toEqual([
      "Claude",
      "Gemini",
      "ChatGPT",
      "Local LM",
      "Ollama",
    ]);
  });

  // Ollama names only its server, keeps JSON answers on, and may be told how much of a receipt to keep.
  it("creates Ollama settings with the server's address and a context size", async () => {
    await setUp({});
    component.form.controls.aiType.setValue(AiType.Ollama);
    component.form.controls.aiType.markAsDirty();
    component.form.patchValue({ model: "llama3.2-vision", url: " http://nas:11434 ", contextSize: 8192 });
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="ai-context-size"]')).not.toBeNull();
    component.save();

    expect(processingService["createReceiptProcessingSettings"].mock.calls[0][0]).toEqual(
      expect.objectContaining({ aiType: AiType.Ollama, url: "http://nas:11434", contextSize: 8192, enforceJsonResponseFormat: true })
    );
  });

  it("sends no context size for any other provider, and shows no field for it", async () => {
    await setUp({});
    component.form.patchValue({ model: "gemini-2.5-flash", key: "secret", contextSize: 8192 });
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="ai-context-size"]')).toBeNull();
    component.save();

    expect(processingService["createReceiptProcessingSettings"].mock.calls[0][0]).toEqual(expect.objectContaining({ contextSize: 0 }));
  });

  it("creates Claude settings: a key, no URL, images read, no JSON switch", async () => {
    await setUp({});
    component.form.patchValue({ aiType: AiType.Anthropic, model: "claude-opus-5-5", key: "sk-ant" });

    component.save();

    expect(processingService["createReceiptProcessingSettings"]).toHaveBeenCalledWith(
      expect.objectContaining({
        aiType: AiType.Anthropic,
        model: "claude-opus-5-5",
        key: "sk-ant",
        url: "",
        isVisionModel: true,
        enforceJsonResponseFormat: false,
      })
    );
  });

  it("creates ChatGPT settings held to JSON answers", async () => {
    await setUp({});
    component.form.patchValue({ aiType: AiType.OpenAi, model: "gpt-5-mini", key: "sk-openai" });

    component.save();

    expect(processingService["createReceiptProcessingSettings"]).toHaveBeenCalledWith(
      expect.objectContaining({ aiType: AiType.OpenAi, url: "", enforceJsonResponseFormat: true })
    );
  });

  it("starts with no model chosen, for every provider, and will not save until one is picked", async () => {
    await setUp({});
    component.form.controls.key.setValue("secret");

    expect(component.form.controls.model.value).toBe("");
    expect(component.form.controls.model.valid).toBe(false);

    for (const aiType of [AiType.Gemini, AiType.Anthropic, AiType.OpenAi]) {
      component.form.controls.aiType.markAsDirty();
      component.form.controls.aiType.setValue(aiType);
      expect(component.form.controls.model.value).toBe("");
    }

    component.save();

    expect(processingService["createReceiptProcessingSettings"]).not.toHaveBeenCalled();
  });

  it("picking another provider clears the model and empties the key box", async () => {
    await setUp({});
    component.form.patchValue({ model: "a-gemini-model", key: "gemini-key" });

    component.form.controls.aiType.markAsDirty();
    component.form.controls.aiType.setValue(AiType.Anthropic);

    expect(component.form.controls.model.value).toBe("");
    expect(component.form.controls.key.value).toBe("");
  });

  it("asks for a new key when saved Gemini settings move to Claude", async () => {
    await setUp({ receiptProcessingSettingsId: 3 }, { id: 3, name: "Old", aiType: AiType.Gemini, model: "m" });
    component.form.controls.aiType.markAsDirty();
    component.form.controls.aiType.setValue(AiType.Anthropic);
    component.form.controls.model.setValue("a-claude-model");

    expect(component.canTest()).toBe(false);
    component.save();

    expect(snackbar.error).toHaveBeenCalledWith("Paste the Claude API key.");
    expect(processingService["updateReceiptProcessingSettingsById"]).not.toHaveBeenCalled();
  });

  it("asks for a Gemini key before the first save", async () => {
    await setUp({});
    component.form.controls.model.setValue("a-gemini-model");

    component.save();

    expect(snackbar.error).toHaveBeenCalledWith("Paste the Gemini API key.");
    expect(processingService["createReceiptProcessingSettings"]).not.toHaveBeenCalled();
  });

  it("updates saved LM Studio settings, keeping the stored key when none is typed", async () => {
    await setUp(
      { receiptProcessingSettingsId: 3 },
      { id: 3, name: "Old", aiType: AiType.OpenAiCustom, url: "http://pc:1234/v1", model: "qwen", isVisionModel: false }
    );
    expect(component.form.value.url).toBe("http://pc:1234/v1");

    component.form.patchValue({ model: "qwen2.5-vl" });
    component.save();

    const [id, updateKey, command] = processingService["updateReceiptProcessingSettingsById"].mock.calls[0];
    expect(id).toBe(3);
    expect(updateKey).toBe(false);
    expect(command).toEqual(
      expect.objectContaining({ name: "Old", model: "qwen2.5-vl", enforceJsonResponseFormat: false })
    );
    expect(systemSettingsService["updateSystemSettings"]).not.toHaveBeenCalled();
  });

  it("requires a URL for LM Studio", async () => {
    await setUp({});
    component.form.patchValue({ aiType: AiType.OpenAiCustom, url: "", key: "" });

    expect(component.form.controls.url.invalid).toBe(true);
  });

  it("tests the saved settings and says so", async () => {
    await setUp({ receiptProcessingSettingsId: 3 }, { id: 3, name: "Old", aiType: AiType.Gemini, model: "m" });

    component.testConnection();

    expect(processingService["checkReceiptProcessingSettingsConnectivity"]).toHaveBeenCalledWith({ id: 3 });
    expect(component.connectionResult()?.ok).toBe(true);
  });

  it("explains a failed connection", () => {
    expect(describeConnection(SystemTaskStatus.Failed, "401 Unauthorized")).toEqual({
      ok: false,
      message: "Not connected: {reason}",
      params: { reason: "401 Unauthorized" },
    });
    expect(describeConnection(undefined).params).toEqual({ reason: "no answer from the AI" });
  });

  describe("for a household member who cannot read System Settings", () => {
    it("opens the first AI settings and saves new ones without touching System Settings", async () => {
      await setUp({});
      TestBed.resetTestingModule();
      processingService = {
        getAiModels: vi.fn(() => of([])),
        getPagedProcessingSettings: vi.fn(() =>
          of({ data: [{ id: 3, aiType: AiType.Gemini, model: "gemini-2.5-flash", url: "", isVisionModel: true }] })
        ),
        updateReceiptProcessingSettingsById: vi.fn((id, _updateKey, command) => of({ id, ...command })),
        checkReceiptProcessingSettingsConnectivity: vi.fn(),
        getAiUsage: vi.fn(() => of([])),
      };
      systemSettingsService = {
        getSystemSettings: vi.fn(() => throwError(() => new Error("403"))),
        updateSystemSettings: vi.fn(),
      };
      await TestBed.configureTestingModule({
        imports: [AiSettingsPageComponent, NgxsModule.forRoot([])],
        providers: [
          provideZonelessChangeDetection(),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: ReceiptProcessingSettingsService, useValue: processingService },
          { provide: SystemSettingsService, useValue: systemSettingsService },
          { provide: FeatureConfigService, useValue: { getFeatureConfig: vi.fn(() => of({ aiPoweredReceipts: true })) } },
          { provide: SnackbarService, useValue: { success: vi.fn(), error: vi.fn() } },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(AiSettingsPageComponent);
      component = fixture.componentInstance;
      await fixture.whenStable();

      expect(processingService["getPagedProcessingSettings"]).toHaveBeenCalled();
      expect(component.saved()?.id).toBe(3);
      expect(component.form.controls.model.value).toBe("gemini-2.5-flash");
      expect(systemSettingsService["updateSystemSettings"]).not.toHaveBeenCalled();
    });
  });
});
