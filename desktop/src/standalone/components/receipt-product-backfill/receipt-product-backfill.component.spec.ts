import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { Permission, ReceiptProductService } from "../../../open-api";
import { AuthState } from "../../../store/auth.state";
import { SetPermissions } from "../../../store/auth.state.actions";
import { ReceiptProductBackfillComponent } from "./receipt-product-backfill.component";

describe("ReceiptProductBackfillComponent", () => {
  let fixture: ComponentFixture<ReceiptProductBackfillComponent>;
  let service: { queueGroupReceiptProducts: jest.Mock };

  const button = (): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector('[data-testid="receipt-product-backfill"]');

  const render = async (permissions: string[]) => {
    TestBed.inject(Store).dispatch(new SetPermissions([], { 3: permissions }));
    fixture = TestBed.createComponent(ReceiptProductBackfillComponent);
    fixture.componentRef.setInput("groupId", 3);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    service = { queueGroupReceiptProducts: jest.fn(() => of({ queued: 4 })) };
    await TestBed.configureTestingModule({
      imports: [ReceiptProductBackfillComponent, NgxsModule.forRoot([AuthState])],
      providers: [provideZonelessChangeDetection(), { provide: ReceiptProductService, useValue: service }],
    }).compileComponents();
  });

  it("is hidden without update permission", async () => {
    await render([Permission.GroupReceiptsRead]);
    expect(button()).toBeNull();
  });

  it("queues the group's older receipts and reports how many", async () => {
    await render([Permission.GroupReceiptsUpdate]);

    button()!.click();
    await fixture.whenStable();

    expect(service.queueGroupReceiptProducts).toHaveBeenCalledWith(3);
    expect(fixture.nativeElement.querySelector('[data-testid="receipt-product-backfill-result"]')?.textContent).toContain(
      "Queued 4 receipts"
    );
  });
});
