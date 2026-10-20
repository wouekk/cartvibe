import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { foodTagsOf } from "./food-tags";
import { FoodTagsComponent } from "./food-tags.component";

describe("food tags", () => {
  it("shows health, then seasonality for produce", () => {
    expect(foodTagsOf({ health: "HEALTHY", seasonality: "SEASONAL" }).map((tag) => tag.label)).toEqual([
      "Healthy",
      "Seasonal",
    ]);
    expect(foodTagsOf({ health: "UNHEALTHY", seasonality: "NOT_PRODUCE" }).map((tag) => tag.label)).toEqual([
      "Unhealthy",
    ]);
    expect(foodTagsOf({ health: "MEDIUM", seasonality: "OUT_OF_SEASON" }).map((tag) => tag.label)).toEqual([
      "Medium",
      "Imported",
    ]);
  });

  it("shows nothing for non-food, unknown, unclassified or values this build does not know", () => {
    for (const health of ["NOT_FOOD", "UNKNOWN", "", "SOMETHING_NEW", undefined]) {
      expect(foodTagsOf({ health, seasonality: "" })).toEqual([]);
    }
  });

  it("renders the chips", async () => {
    await TestBed.configureTestingModule({
      imports: [FoodTagsComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(FoodTagsComponent);
    fixture.componentRef.setInput("values", { health: "UNHEALTHY", seasonality: "" });
    await fixture.whenStable();

    const chip = fixture.nativeElement.querySelector('[data-testid="food-tag-unhealthy"]');
    expect(chip?.textContent).toBe("Unhealthy");
    expect(chip?.className).toContain("food-tag--bad");
  });
});
