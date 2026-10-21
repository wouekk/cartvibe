import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl } from "@angular/forms";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { NgxsModule } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { ReceiptProcessingSettingsService } from "../../open-api";
import { GeminiModelFieldComponent } from "./gemini-model-field.component";

describe("GeminiModelFieldComponent", () => {
  let fixture: ComponentFixture<GeminiModelFieldComponent>;
  let component: GeminiModelFieldComponent;
  let service: { getGeminiModels: jest.Mock };
  let modelControl: FormControl<string | null>;
  let keyControl: FormControl<string | null>;

  const setUp = async (settingsId?: number, models = [{ name: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }]) => {
    service = { getGeminiModels: jest.fn(() => of(models)) };
    modelControl = new FormControl<string | null>("gemini-2.5-flash");
    keyControl = new FormControl<string | null>("");

    await TestBed.configureTestingModule({
      imports: [GeminiModelFieldComponent, NgxsModule.forRoot([]), NoopAnimationsModule],
      providers: [provideZonelessChangeDetection(), { provide: ReceiptProcessingSettingsService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(GeminiModelFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("modelControl", modelControl);
    fixture.componentRef.setInput("keyControl", keyControl);
    fixture.componentRef.setInput("settingsId", settingsId);
    await fixture.whenStable();
  };

  it("loads the models of a saved key straight away, by settings id", async () => {
    await setUp(7);

    expect(service.getGeminiModels).toHaveBeenCalledWith({ receiptProcessingSettingsId: 7 });
    expect(component.hasModels()).toBe(true);
  });

  it("does not load anything for an unsaved key until asked, then sends the typed key", async () => {
    await setUp();
    expect(service.getGeminiModels).not.toHaveBeenCalled();

    keyControl.setValue("  typed-key ");
    component.load();

    expect(service.getGeminiModels).toHaveBeenCalledWith({ key: "typed-key" });
  });

  it("asks for a key when there is neither a typed key nor saved settings", async () => {
    await setUp();

    component.load();

    expect(service.getGeminiModels).not.toHaveBeenCalled();
    expect(component.error()).toBe("Paste the API key first.");
  });

  it("keeps the current model in the list even when Google no longer lists it", async () => {
    await setUp(7, [{ name: "gemini-3-pro", displayName: "Gemini 3 Pro" }]);

    expect(component.options().map((option) => option.value)).toEqual(["gemini-2.5-flash", "gemini-3-pro"]);
  });

  it("falls back to the text box and shows Google's reason when the key is refused", async () => {
    await setUp();
    service.getGeminiModels.mockReturnValue(
      throwError(() => ({ error: { errors: { key: "Google did not accept the key (status 400)" } } }))
    );
    keyControl.setValue("bad");

    component.load();

    expect(component.hasModels()).toBe(false);
    expect(component.error()).toBe("Google did not accept the key (status 400)");
  });
});
