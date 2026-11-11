import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule } from "@ngxs/store";
import { Observable, Subject, of, throwError } from "rxjs";
import type { Mock } from "vitest";
import { AppDialogRef } from "../../dialog/app-dialog";
import { PagedData, Receipt, ReceiptService, SortDirection } from "../../open-api";
import { ShoppingListsModule } from "../shopping-lists.module";
import { ATTACHABLE_RECEIPT_COUNT, AttachReceiptDialogComponent } from "./attach-receipt-dialog.component";

const receipt = (id: number, name: string): Receipt =>
  ({ id, name, date: "2026-11-02T00:00:00Z", amount: "12.50", groupId: 4 }) as unknown as Receipt;

describe("AttachReceiptDialogComponent", () => {
  let fixture: ComponentFixture<AttachReceiptDialogComponent>;
  let service: { getReceiptsForGroup: Mock };
  let dialogRef: { close: Mock };

  const choices = (): HTMLElement[] => [...fixture.nativeElement.querySelectorAll('[data-testid="attach-receipt-choice"]')];

  const open = async (answer: Observable<PagedData>, attachedReceiptIds: number[] = []) => {
    service.getReceiptsForGroup.mockReturnValue(answer);
    fixture = TestBed.createComponent(AttachReceiptDialogComponent);
    fixture.componentInstance.groupId = 4;
    fixture.componentInstance.attachedReceiptIds = attachedReceiptIds;
    await fixture.whenStable();
  };

  beforeEach(async () => {
    service = { getReceiptsForGroup: vi.fn() };
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ShoppingListsModule, NgxsModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AppDialogRef, useValue: dialogRef },
        { provide: ReceiptService, useValue: service },
      ],
    }).compileComponents();
  });

  it("asks for the group's newest receipts and leaves out the ones already on the list", async () => {
    await open(of({ data: [receipt(1, "Lidl"), receipt(2, "Biedronka"), receipt(3, "Rossmann")], totalCount: 3 } as unknown as PagedData), [2]);

    expect(service.getReceiptsForGroup).toHaveBeenCalledWith(4, {
      page: 1,
      pageSize: ATTACHABLE_RECEIPT_COUNT,
      orderBy: "date",
      sortDirection: SortDirection.Desc,
    });
    expect(choices().map((choice) => choice.textContent)).toEqual([
      expect.stringContaining("Lidl"),
      expect.stringContaining("Rossmann"),
    ]);
  });

  it("closes with the picked receipt's id", async () => {
    await open(of({ data: [receipt(7, "Lidl")], totalCount: 1 } as unknown as PagedData));

    choices()[0].click();

    expect(dialogRef.close).toHaveBeenCalledWith(7);
  });

  it("says loading until the receipts arrive", async () => {
    const answer = new Subject<PagedData>();
    await open(answer);
    expect(fixture.nativeElement.textContent).toContain("Loading receipts");
    expect(fixture.nativeElement.querySelector('[data-testid="attach-receipt-none"]')).toBeNull();

    answer.next({ data: [receipt(1, "Lidl")], totalCount: 1 } as unknown as PagedData);
    answer.complete();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain("Loading receipts");
    expect(choices().length).toBe(1);
  });

  it("shows the empty message when everything is attached already", async () => {
    await open(of({ data: [receipt(1, "Lidl")], totalCount: 1 } as unknown as PagedData), [1]);

    expect(choices()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[data-testid="attach-receipt-none"]')?.textContent).toContain(
      "No receipts to attach"
    );
  });

  it("offers nothing, rather than spinning forever, when the receipts cannot be loaded", async () => {
    await open(throwError(() => new Error("offline")));

    expect(fixture.nativeElement.textContent).not.toContain("Loading receipts");
    expect(fixture.nativeElement.querySelector('[data-testid="attach-receipt-none"]')).not.toBeNull();
  });

  it("closes with nothing on cancel", async () => {
    await open(of({ data: [], totalCount: 0 } as unknown as PagedData));

    fixture.componentInstance.close();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
