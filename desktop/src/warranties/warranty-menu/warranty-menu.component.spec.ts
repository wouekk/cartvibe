import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { ReceiptService } from "../../open-api";
import { SnackbarService } from "../../services/snackbar.service";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AuthStore } from "../../store";
import { WarrantyDateDialogComponent } from "./warranty-date-dialog.component";
import { WarrantyMenuComponent } from "./warranty-menu.component";

describe("WarrantyMenuComponent", () => {
  let fixture: ComponentFixture<WarrantyMenuComponent>;
  let component: WarrantyMenuComponent;
  let setReceiptWarranty: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.fn>;
  let dialogResult: unknown;
  let confirmation: Record<string, string>;

  beforeEach(async () => {
    setReceiptWarranty = vi.fn(() => of({ warrantyUntil: "2029-01-31" }));
    confirmation = {};
    open = vi.fn((component: unknown) => ({
      afterClosed: () => of(dialogResult),
      componentInstance: component === ConfirmationDialogComponent ? confirmation : {},
    }));

    await TestBed.configureTestingModule({
      imports: [WarrantyMenuComponent, NgxsModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReceiptService, useValue: { setReceiptWarranty } },
        { provide: AppDialog, useValue: { open } },
        { provide: SnackbarService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WarrantyMenuComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("receiptId", 7);
    fixture.componentRef.setInput("groupId", 3);
    fixture.componentRef.setInput("shop", "MediaMarkt");
    fixture.componentRef.setInput("warrantyUntil", "2028-09-01");
  });

  const menuButton = () => fixture.nativeElement.querySelector('[data-testid="warranty-menu"]');

  it("shows the menu only with group.receipts.update in the receipt's own group", async () => {
    TestBed.inject(AuthStore).setPermissions([], { 4: ["group.receipts.update"] });
    await fixture.whenStable();
    expect(menuButton()).toBeNull();

    TestBed.inject(AuthStore).setPermissions([], { 3: ["group.receipts.update"] });
    await fixture.whenStable();
    expect(menuButton()).not.toBeNull();
  });

  it("Edit saves the picked day and tells the list to load again", () => {
    const changed = vi.fn();
    component.changed.subscribe(changed);
    dialogResult = "2029-01-31";

    component.edit();

    expect(open).toHaveBeenCalledWith(WarrantyDateDialogComponent, expect.objectContaining({
      data: { shop: "MediaMarkt", warrantyUntil: "2028-09-01" },
    }));
    expect(setReceiptWarranty).toHaveBeenCalledWith(7, { warrantyUntil: "2029-01-31" });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("Edit cancelled, or the same day kept, saves nothing", () => {
    dialogResult = undefined;
    component.edit();
    dialogResult = "2028-09-01";
    component.edit();

    expect(setReceiptWarranty).not.toHaveBeenCalled();
  });

  it("Remove asks with a red Remove button, then clears only the warranty date", () => {
    const changed = vi.fn();
    component.changed.subscribe(changed);
    dialogResult = true;

    component.remove();

    expect(confirmation["confirmText"]).toBe("Remove");
    expect(setReceiptWarranty).toHaveBeenCalledWith(7, { warrantyUntil: "" });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("Remove cancelled changes nothing", () => {
    dialogResult = false;

    component.remove();

    expect(setReceiptWarranty).not.toHaveBeenCalled();
  });

  it("a failed save lets the person try again", () => {
    setReceiptWarranty.mockReturnValue(throwError(() => new Error("offline")));
    dialogResult = true;

    component.remove();

    expect(component.saving()).toBe(false);
  });
});
