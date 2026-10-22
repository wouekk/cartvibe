import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { SettingsEntityListComponent } from "./settings-entity-list.component";

describe("SettingsEntityListComponent", () => {
  it("draws its content on the card surface", async () => {
    await TestBed.configureTestingModule({
      declarations: [SettingsEntityListComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(SettingsEntityListComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".cv-card")).not.toBeNull();
  });
});
