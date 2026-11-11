import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { GroupOverviewProduct, OverviewService } from "../../open-api";
import { DisplayCurrencyService } from "../../services/display-currency.service";
import { OverviewDetailDialogComponent, OverviewDetailDialogData } from "./overview-detail-dialog.component";

import type { Mock } from "vitest";

const product = (id: number, name: string, amount?: string): GroupOverviewProduct => ({
  id,
  receiptId: 100 + id,
  receiptName: `Receipt ${id}`,
  receiptDate: "2026-10-12",
  name,
  quantity: "",
  health: "UNKNOWN",
  ...(amount ? { amount } : {}),
});

describe("OverviewDetailDialogComponent", () => {
  let overviewService: { getOverviewProducts: Mock };
  let fixture: ComponentFixture<OverviewDetailDialogComponent>;

  const create = async (data: Partial<OverviewDetailDialogData>): Promise<OverviewDetailDialogComponent> => {
    await TestBed.configureTestingModule({
      imports: [OverviewDetailDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AppDialogRef, useValue: { close: vi.fn() } },
        { provide: OverviewService, useValue: overviewService },
        { provide: DisplayCurrencyService, useValue: { format: (value: number | string | null | undefined) => `€${value}` } },
        { provide: APP_DIALOG_DATA, useValue: { title: "T", kind: "FOODGROUP", groupId: 1, from: "2026-10-01", to: "2026-10-31", ...data } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OverviewDetailDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  };

  beforeEach(() => {
    overviewService = { getOverviewProducts: vi.fn() };
  });

  it("lists one category's lines, asking by its id", async () => {
    overviewService.getOverviewProducts.mockReturnValue(of([product(1, "Milk", "2.50")]));

    const component = await create({ kind: "FOODGROUP", categoryId: 4 });

    expect(overviewService.getOverviewProducts).toHaveBeenCalledWith(1, "FOODGROUP", undefined, 4, undefined, undefined, "2026-10-01", "2026-10-31");
    expect(component.products()).toHaveLength(1);
    expect(component.loading()).toBe(false);
  });

  describe("Other", () => {
    const members = [{ name: "Pets", categoryId: 3 }, { name: "Gifts" }, { name: "Uncategorized" }];

    it("asks once per folded category and gives each its lines and subtotal, leaving empty ones out", async () => {
      overviewService.getOverviewProducts.mockImplementation((_g: number, _k: string, foodGroup?: string, categoryId?: number) => {
        if (categoryId === 3) {
          return of([product(1, "Dog food", "10.50"), product(2, "Leash", "4.00"), product(3, "Free sample")]);
        }
        return of(foodGroup === "" ? [product(4, "Loose item", "1.25")] : []);
      });

      const component = await create({ kind: "OTHER", members });

      expect(overviewService.getOverviewProducts).toHaveBeenCalledTimes(3);
      expect(overviewService.getOverviewProducts).toHaveBeenCalledWith(1, "FOODGROUP", undefined, 3, undefined, undefined, "2026-10-01", "2026-10-31");
      expect(overviewService.getOverviewProducts).toHaveBeenCalledWith(1, "FOODGROUP", "Gifts", undefined, undefined, undefined, "2026-10-01", "2026-10-31");
      expect(overviewService.getOverviewProducts).toHaveBeenCalledWith(1, "FOODGROUP", "", undefined, undefined, undefined, "2026-10-01", "2026-10-31");
      expect(component.sections().map((section) => [section.name, section.total, section.products.length])).toEqual([
        ["Pets", 14.5, 3],
        ["Uncategorized", 1.25, 1],
      ]);
      expect(fixture.nativeElement.querySelector('[data-testid="overview-detail-section-Pets"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="overview-detail-section-Gifts"]')).toBeNull();
      // One table, one column layout, a shaded band per category.
      expect(fixture.nativeElement.querySelectorAll('table').length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('tbody tr.detail-group').length).toBe(2);
      expect(fixture.nativeElement.querySelectorAll('thead').length).toBe(1);
    });

    it("says it could not load, rather than showing a short list, when one category fails", async () => {
      overviewService.getOverviewProducts.mockImplementation((_g: number, _k: string, _f?: string, categoryId?: number) =>
        categoryId === 3 ? throwError(() => new Error("boom")) : of([product(5, "Card", "3.00")])
      );

      const component = await create({ kind: "OTHER", members });

      expect(component.failed()).toBe(true);
      expect(component.sections()).toEqual([]);
      expect(fixture.nativeElement.querySelector('[data-testid="overview-detail-failed"]')).not.toBeNull();
    });

    it("says there is nothing when every folded category is empty", async () => {
      overviewService.getOverviewProducts.mockReturnValue(of([]));

      await create({ kind: "OTHER", members });

      expect(fixture.nativeElement.querySelector('[data-testid="overview-detail-empty"]')).not.toBeNull();
    });
  });
});
