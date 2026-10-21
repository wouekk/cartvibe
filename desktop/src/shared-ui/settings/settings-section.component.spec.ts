import { TranslatePipe } from "../../i18n/translate.pipe";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SettingsSectionComponent } from "./settings-section.component";

describe("SettingsSectionComponent", () => {
  let fixture: ComponentFixture<SettingsSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslatePipe],
      declarations: [SettingsSectionComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(SettingsSectionComponent);
  });

  it("renders the card title and description", async () => {
    fixture.componentRef.setInput("title", "Session");
    fixture.componentRef.setInput("description", "How long");
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector(".rw-card__title")?.textContent).toContain("Session");
    expect(el.querySelector(".rw-card__desc")?.textContent).toContain("How long");
  });

  it("omits the head without a title", async () => {
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector(".rw-card__head")).toBeNull();
  });

  it("marks the destructive tone", async () => {
    fixture.componentRef.setInput("tone", "destructive");
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector(".rw-card--destructive")).not.toBeNull();
  });
});
