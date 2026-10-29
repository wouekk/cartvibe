import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl } from "@angular/forms";
import { NgxsModule } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { AiType } from "../../constants/ai-type";
import { ReceiptProcessingSettingsService } from "../../open-api";
import { AiModelFieldComponent } from "./ai-model-field.component";

import type { Mock } from "vitest";
describe("AiModelFieldComponent", () => {
  let fixture: ComponentFixture<AiModelFieldComponent>;
  let component: AiModelFieldComponent;
  let service: { getAiModels: Mock };
  let modelControl: FormControl<string | null>;
  let keyControl: FormControl<string | null>;

  const setUp = async (
    settingsId?: number,
    models = [{ name: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }],
    aiType: string = AiType.Gemini
  ) => {
    service = { getAiModels: vi.fn(() => of(models)) };
    modelControl = new FormControl<string | null>("gemini-2.5-flash");
    keyControl = new FormControl<string | null>("");

    await TestBed.configureTestingModule({
      imports: [AiModelFieldComponent, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection(), { provide: ReceiptProcessingSettingsService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(AiModelFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("modelControl", modelControl);
    fixture.componentRef.setInput("keyControl", keyControl);
    fixture.componentRef.setInput("aiType", aiType);
    fixture.componentRef.setInput("settingsId", settingsId);
    await fixture.whenStable();
  };

  it("loads the models of a saved key straight away, by settings id and provider", async () => {
    await setUp(7);

    expect(service.getAiModels).toHaveBeenCalledWith({ aiType: AiType.Gemini, receiptProcessingSettingsId: 7 });
    expect(component.hasModels()).toBe(true);
  });

  it("does not load anything for an unsaved key until asked, then sends the typed key", async () => {
    await setUp(undefined, [], AiType.Anthropic);
    expect(service.getAiModels).not.toHaveBeenCalled();

    keyControl.setValue("  typed-key ");
    component.load();

    expect(service.getAiModels).toHaveBeenCalledWith({ aiType: AiType.Anthropic, key: "typed-key" });
  });

  it("names the provider's company on the button", async () => {
    await setUp(undefined, [], AiType.OpenAi);

    expect(fixture.nativeElement.querySelector('[data-testid="ai-model-load"]').textContent).toContain(
      "Get the models from OpenAI"
    );
  });

  it("starts over when the provider changes", async () => {
    await setUp(7);
    expect(component.hasModels()).toBe(true);

    fixture.componentRef.setInput("aiType", AiType.Anthropic);
    fixture.componentRef.setInput("settingsId", undefined);
    await fixture.whenStable();

    expect(component.hasModels()).toBe(false);
    expect(component.error()).toBeUndefined();
  });

  it("asks for a key when there is neither a typed key nor saved settings", async () => {
    await setUp();

    component.load();

    expect(service.getAiModels).not.toHaveBeenCalled();
    expect(component.error()).toBe("Paste the API key first.");
  });

  it("keeps the current model in the list even when the provider no longer lists it", async () => {
    await setUp(7, [{ name: "gemini-3-pro", displayName: "Gemini 3 Pro" }]);

    expect(component.options().map((option) => option.value)).toEqual(["gemini-2.5-flash", "gemini-3-pro"]);
  });

  it("falls back to the text box and shows the provider's reason when the key is refused", async () => {
    await setUp();
    service.getAiModels.mockReturnValue(
      throwError(() => ({ error: { errors: { key: "Google did not accept the key (status 400)" } } }))
    );
    keyControl.setValue("bad");

    component.load();

    expect(component.hasModels()).toBe(false);
    expect(component.error()).toBe("Google did not accept the key (status 400)");
  });
});
