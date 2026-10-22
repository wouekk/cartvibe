import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { NgxsModule } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { AiType, ReceiptProcessingSettingsService, SystemSettingsService, SystemTaskStatus } from "../../open-api";
import { SnackbarService } from "../../services";
import { AI_FALLBACK_SETTINGS_NAME, AiFallbackCardComponent } from "./ai-fallback-card.component";

describe("AiFallbackCardComponent", () => {
  let fixture: ComponentFixture<AiFallbackCardComponent>;
  let component: AiFallbackCardComponent;
  let processingService: { [method: string]: jest.Mock };
  let systemSettingsService: { [method: string]: jest.Mock };
  let snackbar: { success: jest.Mock; error: jest.Mock };

  const setUp = async (systemSettings: object | "forbidden", fallback?: object, primaryId: number | null = 1) => {
    processingService = {
      getReceiptProcessingSettingsById: jest.fn(() => of(fallback)),
      getGeminiModels: jest.fn(() => of([])),
      createReceiptProcessingSettings: jest.fn((command) => of({ id: 9, ...command })),
      updateReceiptProcessingSettingsById: jest.fn((id, _updateKey, command) => of({ id, ...command })),
      checkReceiptProcessingSettingsConnectivity: jest.fn(() =>
        of({ status: SystemTaskStatus.Succeeded, resultDescription: "" })
      ),
    };
    systemSettingsService = {
      getSystemSettings: jest.fn(() =>
        systemSettings === "forbidden" ? throwError(() => new Error("403")) : of(systemSettings)
      ),
      updateSystemSettings: jest.fn((command) => of(command)),
    };
    snackbar = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [AiFallbackCardComponent, NgxsModule.forRoot([]), NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReceiptProcessingSettingsService, useValue: processingService },
        { provide: SystemSettingsService, useValue: systemSettingsService },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiFallbackCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("primaryId", primaryId ?? undefined);
    await fixture.whenStable();
  };

  it("is hidden for someone who cannot read System Settings", async () => {
    await setUp("forbidden");

    expect(component.visible()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="ai-fallback-card"]')).toBeNull();
  });

  it("starts switched off when no backup is linked", async () => {
    await setUp({ receiptProcessingSettingsId: 1 });

    expect(component.visible()).toBe(true);
    expect(component.form.controls.enabled.value).toBe(false);
  });

  it("creates Gemini settings and links them as the backup", async () => {
    await setUp({ receiptProcessingSettingsId: 1, taskConcurrency: 2 });
    component.form.patchValue({ enabled: true, model: "gemini-2.5-flash", key: "secret" });

    component.save();

    expect(processingService["createReceiptProcessingSettings"]).toHaveBeenCalledWith(
      expect.objectContaining({ name: AI_FALLBACK_SETTINGS_NAME, aiType: AiType.Gemini, key: "secret", url: "" })
    );
    expect(systemSettingsService["updateSystemSettings"]).toHaveBeenCalledWith(
      expect.objectContaining({ receiptProcessingSettingsId: 1, taskConcurrency: 2, fallbackReceiptProcessingSettingsId: 9 })
    );
    expect(component.saved()?.id).toBe(9);
  });

  it("asks for a key before the first save", async () => {
    await setUp({ receiptProcessingSettingsId: 1 });
    component.form.patchValue({ enabled: true });

    component.save();

    expect(snackbar.error).toHaveBeenCalledWith("Paste the Gemini API key for the backup AI.");
    expect(processingService["createReceiptProcessingSettings"]).not.toHaveBeenCalled();
  });

  it("switching it off only unlinks the backup and keeps the saved settings", async () => {
    await setUp(
      { receiptProcessingSettingsId: 1, fallbackReceiptProcessingSettingsId: 9 },
      { id: 9, name: AI_FALLBACK_SETTINGS_NAME, aiType: AiType.Gemini, model: "m" }
    );
    expect(component.form.controls.enabled.value).toBe(true);

    component.form.patchValue({ enabled: false });
    component.save();

    expect(systemSettingsService["updateSystemSettings"]).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackReceiptProcessingSettingsId: null })
    );
    expect(processingService["updateReceiptProcessingSettingsById"]).not.toHaveBeenCalled();
    expect(snackbar.success).toHaveBeenCalledWith("Backup AI is off");
  });

  it("updates the saved backup and keeps its stored key when none is typed", async () => {
    await setUp(
      { receiptProcessingSettingsId: 1, fallbackReceiptProcessingSettingsId: 9 },
      { id: 9, name: AI_FALLBACK_SETTINGS_NAME, aiType: AiType.Gemini, model: "m" }
    );
    component.form.patchValue({ model: "gemini-3-pro" });

    component.save();

    const [id, updateKey, command] = processingService["updateReceiptProcessingSettingsById"].mock.calls[0];
    expect(id).toBe(9);
    expect(updateKey).toBe(false);
    expect(command).toEqual(expect.objectContaining({ model: "gemini-3-pro" }));
  });

  it("cannot be saved before the main AI is", async () => {
    await setUp({}, undefined, null);
    component.form.patchValue({ enabled: true, key: "secret" });

    component.save();

    expect(component.canSave()).toBe(false);
    expect(processingService["createReceiptProcessingSettings"]).not.toHaveBeenCalled();
  });

  it("tests the saved backup", async () => {
    await setUp(
      { receiptProcessingSettingsId: 1, fallbackReceiptProcessingSettingsId: 9 },
      { id: 9, name: AI_FALLBACK_SETTINGS_NAME, aiType: AiType.Gemini, model: "m" }
    );

    component.testConnection();

    expect(processingService["checkReceiptProcessingSettingsConnectivity"]).toHaveBeenCalledWith({ id: 9 });
    expect(component.connectionResult()?.ok).toBe(true);
  });
});
