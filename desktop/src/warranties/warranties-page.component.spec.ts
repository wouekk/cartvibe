import { provideZonelessChangeDetection } from "@angular/core";
import { RouterTestingHarness } from "@angular/router/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule } from "@ngxs/store";
import { Observable, of, Subject, throwError } from "rxjs";
import { ReceiptService, SortDirection } from "../open-api";
import { SystemSettingsState } from "../store/system-settings.state";
import { WarrantiesPageComponent } from "./warranties-page.component";

import type { Mock } from "vitest";
const receipt = (id: number, shopName: string, warrantyProducts: string[] = []) => ({
  id,
  name: `Receipt ${id}`,
  shopName,
  date: "2026-09-01",
  warrantyUntil: "2028-09-01",
  warrantyProducts,
});

describe("WarrantiesPageComponent", () => {
  let harness: RouterTestingHarness;
  let getReceiptsForGroup: Mock;

  const el = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const byTestId = (id: string): HTMLElement[] => Array.from(el().querySelectorAll(`[data-testid=${id}]`));

  const open = async (response: () => Observable<unknown>, { settle = true } = {}) => {
    getReceiptsForGroup = vi.fn(response);
    await TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([SystemSettingsState])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: "warranties/group/:groupId", component: WarrantiesPageComponent }]),
        { provide: ReceiptService, useValue: { getReceiptsForGroup } },
      ],
    }).compileComponents();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/warranties/group/1", WarrantiesPageComponent);
    if (settle) {
      await harness.fixture.whenStable();
    }
  };

  it("asks for the group's running warranties, nearest end first", async () => {
    await open(() => of({ data: [] }));

    expect(getReceiptsForGroup).toHaveBeenCalledTimes(1);
    expect(getReceiptsForGroup).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ orderBy: "warranty_until", sortDirection: SortDirection.Asc, filter: { warrantyActive: true } })
    );
  });

  it("lists a row per product, with the receipt's dates on its first row only", async () => {
    await open(() => of({ data: [receipt(1, "MediaMarkt", ["Headphones", "Cable"]), receipt(2, "IKEA")] }));

    expect(byTestId("warranty-receipt-row")).toHaveLength(2);
    expect(byTestId("warranty-product-row")).toHaveLength(1);
    expect(byTestId("warranty-product").map((cell) => cell.textContent?.trim())).toEqual(["Headphones", "Cable", "–"]);
    expect(byTestId("warranty-until")).toHaveLength(3);
    expect(byTestId("warranty-until").filter((cell) => cell.textContent?.trim())).toHaveLength(2);
    expect(byTestId("warranties-empty")).toHaveLength(0);
  });

  it("shows neither the list nor the empty state while it loads", async () => {
    const pending = new Subject<unknown>();
    await open(() => pending, { settle: false });

    expect(byTestId("warranties-list")).toHaveLength(0);
    expect(byTestId("warranties-empty")).toHaveLength(0);

    pending.next({ data: [] });
    await harness.fixture.whenStable();

    expect(byTestId("warranties-empty")).toHaveLength(1);
  });

  it("shows the empty state when the load fails", async () => {
    await open(() => throwError(() => new Error("offline")));

    expect(byTestId("warranties-empty")).toHaveLength(1);
    expect(byTestId("warranties-list")).toHaveLength(0);
  });

  it("loads the new group when the route changes", async () => {
    await open(() => of({ data: [receipt(1, "MediaMarkt")] }));

    await harness.navigateByUrl("/warranties/group/2", WarrantiesPageComponent);
    await harness.fixture.whenStable();

    expect(getReceiptsForGroup).toHaveBeenCalledTimes(2);
    expect(getReceiptsForGroup).toHaveBeenLastCalledWith(2, expect.anything());
  });
});
