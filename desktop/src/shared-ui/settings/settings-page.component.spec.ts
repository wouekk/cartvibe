import { TranslatePipe } from "../../i18n/translate.pipe";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SettingsPageComponent } from "./settings-page.component";

describe("SettingsPageComponent", () => {
  let fixture: ComponentFixture<SettingsPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslatePipe],
      declarations: [SettingsPageComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(SettingsPageComponent);
  });

  it("renders the title and description", async () => {
    fixture.componentRef.setInput("title", "Tags");
    fixture.componentRef.setInput("description", "Group receipts");
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("h1")?.textContent).toContain("Tags");
    expect(el.textContent).toContain("Group receipts");
  });

  it("fills the shared page width whatever width it is given", async () => {
    await fixture.whenStable();
    expect(fixture.nativeElement.className).toContain("w-full");
    expect(fixture.nativeElement.className).not.toContain("max-w-");

    fixture.componentRef.setInput("width", "narrow");
    await fixture.whenStable();
    expect(fixture.nativeElement.className).toContain("w-full");
    expect(fixture.nativeElement.className).not.toContain("max-w-");
  });
});
