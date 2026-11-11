import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { WarrantyRow } from "../../utils/warranty-period";
import { WarrantyMenuComponent } from "../../warranties/warranty-menu/warranty-menu.component";
import { OverviewWarrantiesPanelComponent } from "./overview-warranties-panel.component";

// The panel is a section the page places, so it is tested the way it is used: on a host's <section>.
@Component({
  imports: [OverviewWarrantiesPanelComponent],
  template: `<section app-overview-warranties-panel [rows]="rows()" [groupId]="3" (changed)="changes.set(changes() + 1)"></section>`,
})
class HostComponent {
  public readonly rows = signal<WarrantyRow[]>([]);
  public readonly changes = signal(0);
}

const row = (overrides: Partial<WarrantyRow>): WarrantyRow => ({
  receiptId: 5,
  groupId: 3,
  shop: "Media Expert",
  product: "Kettle",
  bought: "2025-01-03",
  warrantyUntil: "2027-01-03",
  daysLeft: 12,
  first: true,
  ...overrides,
});

describe("OverviewWarrantiesPanelComponent", () => {
  let fixture: ComponentFixture<HostComponent>;

  const all = (testId: string) => [...fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`)] as HTMLElement[];

  const show = async (rows: WarrantyRow[]) => {
    fixture.componentInstance.rows.set(rows);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  it("is a panel with its title, and a link to every warranty of the household", () => {
    const panel = fixture.nativeElement.querySelector("section") as HTMLElement;

    expect(panel.classList).toContain("cv-panel");
    expect(panel.getAttribute("aria-labelledby")).toBe("overview-warranties-title");
    expect(panel.querySelector("#overview-warranties-title")?.textContent).toContain("Warranties ending soon");
    expect(panel.querySelector("a")?.getAttribute("href")).toBe("/warranties/group/3");
  });

  it("says so when no warranty ends soon", () => {
    expect(all("overview-warranties-empty")).toHaveLength(1);
    expect(all("overview-warranties-ending-soon")).toHaveLength(0);
  });

  it("lists a row per product, with the shop, the date and the menu on a receipt's first row only", async () => {
    await show([
      row({ product: "Kettle", daysLeft: 12 }),
      row({ product: "Toaster", first: false }),
      row({ receiptId: 6, shop: "Phone shop", product: "", daysLeft: 40 }),
    ]);

    expect(all("overview-warranty-product").map((cell) => cell.textContent?.trim())).toEqual(["Kettle", "Toaster", "–"]);
    expect(all("overview-warranty-days-left").map((cell) => cell.textContent?.replace(/\s+/g, " ").trim())).toEqual(["12 days", "", "40 days"]);
    expect(fixture.debugElement.queryAll(By.directive(WarrantyMenuComponent))).toHaveLength(2);
  });

  it("says Today for a warranty that ends today, one day for tomorrow, and warns within a week", async () => {
    await show([row({ daysLeft: 0 }), row({ receiptId: 6, daysLeft: 1 }), row({ receiptId: 7, daysLeft: 8 })]);

    const cells = all("overview-warranty-days-left");
    expect(cells.map((cell) => cell.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Today", "1 day", "8 days"]);
    expect(cells.map((cell) => cell.classList.contains("text-warning-text"))).toEqual([true, true, false]);
  });

  it("tells the page when a row's menu changed a warranty", async () => {
    await show([row({})]);

    fixture.debugElement.query(By.directive(WarrantyMenuComponent)).componentInstance.changed.emit();

    expect(fixture.componentInstance.changes()).toBe(1);
  });
});
