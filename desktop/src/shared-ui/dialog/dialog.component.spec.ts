import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { registerRealLanguages } from "../../i18n/i18n-test-utils";
import { TranslationService } from "../../i18n/translation.service";
import { SharedUiModule } from "../shared-ui.module";

@Component({
  template: `<app-dialog [headerText]="header()"></app-dialog>`,
  imports: [SharedUiModule],
})
class HostComponent {
  public readonly header = signal("");
}

describe("DialogComponent", () => {
  const render = async (header: string): Promise<string> => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.header.set(header);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector("h2")?.textContent?.trim() ?? "";
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const translation = TestBed.inject(TranslationService);
    registerRealLanguages(translation);
    translation.register("pl", { messages: { "Discard changes": "Odrzuć zmiany", "Edit {name}": "Edytuj {name}" } });
    translation.choose("pl");
  });

  it("translates a header that is a catalogue text", async () => {
    expect(await render("Discard changes")).toBe("Odrzuć zmiany");
  });

  it("shows a name or an already translated header as given, never matching a {placeholder} pattern", async () => {
    expect(await render("Edit Milk")).toBe("Edit Milk");
    expect(await render("Edytuj Mleko")).toBe("Edytuj Mleko");
  });
});
