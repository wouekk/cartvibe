import { TranslatePipe } from "../../i18n/translate.pipe";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { HlmTabsImports } from "@spartan-ng/helm/tabs";
import { AppIconComponent } from "../icon/icon.component";
import { SettingsTabsComponent } from "./settings-tabs.component";

describe("SettingsTabsComponent", () => {
  let fixture: ComponentFixture<SettingsTabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppIconComponent, TranslatePipe, ...HlmTabsImports],
      declarations: [SettingsTabsComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(SettingsTabsComponent);
    fixture.componentRef.setInput("tabs", [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]);
  });

  it("renders a button per tab and marks the active one", async () => {
    fixture.componentRef.setInput("value", "b");
    await fixture.whenStable();

    const buttons = fixture.nativeElement.querySelectorAll(".filter-tab");
    expect(buttons.length).toBe(2);
    expect(fixture.nativeElement.querySelector(".filter-tab.active").textContent).toContain("B");
  });

  it("emits valueChange when a tab is clicked", async () => {
    fixture.componentRef.setInput("value", "a");
    await fixture.whenStable();
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

    fixture.nativeElement.querySelectorAll(".filter-tab")[1].click();
    await fixture.whenStable();

    expect(emitted).toEqual(["b"]);
  });
});
