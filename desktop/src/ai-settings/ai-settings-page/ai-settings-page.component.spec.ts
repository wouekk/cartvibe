import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { NgxsModule } from "@ngxs/store";
import { of, throwError } from "rxjs";
import {
  AiType,
  FeatureConfigService,
  ReceiptProcessingSettingsService,
  SystemSettingsService,
  SystemTaskStatus,
} from "../../open-api";
import { SnackbarService } from "../../services";
import { FeatureConfigState } from "../../store/feature-config.state";
import { AI_SETTINGS_NAME, AiSettingsPageComponent, describeConnection } from "./ai-settings-page.component";

describe("AiSettingsPageComponent", () => {
  let fixture: ComponentFixture<AiSettingsPageComponent>;
  let component: AiSettingsPageComponent;
  let processingService: { [method: string]: jest.Mock };
  let systemSettingsService: { [method: string]: jest.Mock };
  let snackbar: { success: jest.Mock; error: jest.Mock };

  const setUp = async (systemSettings: object, stored?: object): Promise<void> => {
    processingService = {
      getReceiptProcessingSettingsById: jest.fn(() => of(stored)),
      getGeminiModels: jest.fn(() => of([])),
      createReceiptProcessingSettings: jest.fn((command) => of({ id: 5, ...command })),
      updateReceiptProcessingSettingsById: jest.fn((id, _updateKey, command) => of({ id, ...command })),
      checkReceiptProcessingSettingsConnectivity: jest.fn(() =>
        of({ status: SystemTaskStatus.Succeeded, resultDescription: "" })
      ),
    };
    systemSettingsService = {
      getSystemSettings: jest.fn(() => of(systemSettings)),
      updateSystemSettings: jest.fn((command) => of(command)),
    };
    snackbar = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [AiSettingsPageComponent, NgxsModule.forRoot([FeatureConfigState]), NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReceiptProcessingSettingsService, useValue: processingService },
        { provide: SystemSettingsService, useValue: systemSettingsService },
        { provide: FeatureConfigService, useValue: { getFeatureConfig: jest.fn(() => of({ aiPoweredReceipts: true })) } },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiSettingsPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  };

  it("creates Gemini settings and points System Settings at them", async () => {
    await setUp({ taskConcurrency: 1 });
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
      expect.objectContaining({ taskConcurrency: 1, receiptProcessingSettingsId: 5 })
    );
    expect(component.saved()?.id).toBe(5);
  });

  it("asks for a Gemini key before the first save", async () => {
    await setUp({});

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
        getGeminiModels: jest.fn(() => of([])),
        getPagedProcessingSettings: jest.fn(() =>
          of({ data: [{ id: 3, aiType: AiType.Gemini, model: "gemini-2.5-flash", url: "", isVisionModel: true }] })
        ),
        updateReceiptProcessingSettingsById: jest.fn((id, _updateKey, command) => of({ id, ...command })),
        checkReceiptProcessingSettingsConnectivity: jest.fn(),
      };
      systemSettingsService = {
        getSystemSettings: jest.fn(() => throwError(() => new Error("403"))),
        updateSystemSettings: jest.fn(),
      };
      await TestBed.configureTestingModule({
        imports: [AiSettingsPageComponent, NgxsModule.forRoot([FeatureConfigState]), NoopAnimationsModule],
        providers: [
          provideZonelessChangeDetection(),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: ReceiptProcessingSettingsService, useValue: processingService },
          { provide: SystemSettingsService, useValue: systemSettingsService },
          { provide: FeatureConfigService, useValue: { getFeatureConfig: jest.fn(() => of({ aiPoweredReceipts: true })) } },
          { provide: SnackbarService, useValue: { success: jest.fn(), error: jest.fn() } },
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
