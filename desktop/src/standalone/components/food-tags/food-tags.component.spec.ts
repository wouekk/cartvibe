import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FoodTagValues } from "./food-tags";
import { FoodTagsComponent } from "./food-tags.component";

describe("FoodTagsComponent", () => {
  let fixture: ComponentFixture<FoodTagsComponent>;

  const chips = async (values: FoodTagValues): Promise<string[]> => {
    fixture.componentRef.setInput("values", values);
    await fixture.whenStable();
    return [...fixture.nativeElement.querySelectorAll("[data-testid^='food-tag-']")].map(
      (chip: Element) => `${chip.getAttribute("data-testid")}:${chip.textContent}`
    );
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FoodTagsComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(FoodTagsComponent);
  });

  it("draws health first, then seasonality", async () => {
    expect(await chips({ health: "MEDIUM", seasonality: "OUT_OF_SEASON" })).toEqual([
      "food-tag-medium:Medium",
      "food-tag-imported:Imported",
    ]);
  });

  it("follows the item as the sweep classifies it, and drops tags a correction removes", async () => {
    expect(await chips({ health: "", seasonality: "" })).toEqual([]);
    expect(await chips({ health: "HEALTHY", seasonality: "SEASONAL" })).toEqual([
      "food-tag-healthy:Healthy",
      "food-tag-seasonal:Seasonal",
    ]);
    expect(await chips({ health: "NOT_FOOD", seasonality: "NOT_PRODUCE" })).toEqual([]);
  });

  it("shows nothing for values a newer server might send", async () => {
    expect(await chips({ health: "VERY_HEALTHY", seasonality: "WINTER" })).toEqual([]);
  });
});
