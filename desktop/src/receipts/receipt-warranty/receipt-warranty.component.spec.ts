import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { formatDateInput } from "../../datepicker/date-input.directive";
import { Receipt, ReceiptService } from "../../open-api";
import { WebPushService } from "../../services/web-push.service";
import { AuthState } from "../../store";
import { FeatureConfigState } from "../../store/feature-config.state";
import { SystemSettingsState } from "../../store/system-settings.state";
import { ReceiptWarrantyComponent } from "./receipt-warranty.component";

import type { Mock } from "vitest";
describe("ReceiptWarrantyComponent", () => {
  let fixture: ComponentFixture<ReceiptWarrantyComponent>;
  let component: ReceiptWarrantyComponent;
  let receiptService: { setReceiptWarranty: Mock };
  let webPush: { enableForWarranties: Mock };

  const receipt = (warrantyUntil?: string): Receipt =>
    ({ id: 9, name: "Toaster", date: "2026-10-29T00:00:00Z", warrantyUntil, amount: "49", status: "OPEN" }) as Receipt;

  const setPreferences = (preferences: Record<string, unknown>) => {
    const store = TestBed.inject(Store);
    store.reset({ ...store.snapshot(), auth: { ...store.snapshot().auth, userPreferences: preferences } });
  };

  beforeEach(async () => {
    receiptService = { setReceiptWarranty: vi.fn((_id: number, command: { warrantyUntil: string }) => of({ warrantyUntil: command.warrantyUntil || undefined })) };
    webPush = { enableForWarranties: vi.fn(() => Promise.resolve()) };

    await TestBed.configureTestingModule({
      imports: [ReceiptWarrantyComponent, NgxsModule.forRoot([AuthState, FeatureConfigState, SystemSettingsState])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReceiptService, useValue: receiptService },
        { provide: WebPushService, useValue: webPush },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptWarrantyComponent);
    component = fixture.componentInstance;
  });

  const render = async (value: Receipt, canEdit = true) => {
    fixture.componentRef.setInput("receipt", value);
    fixture.componentRef.setInput("canEdit", canEdit);
    await fixture.whenStable();
  };

  it("starts a new date at the receipt day plus the region's Automatic period", async () => {
    setPreferences({ region: "PL" });
    await render(receipt());
    expect(formatDateInput(component.startDate())).toBe("2028-10-29");

    setPreferences({ region: "US" });
    expect(formatDateInput(component.startDate())).toBe("2027-10-29");
  });

  it("starts at the chosen period when there is one", async () => {
    setPreferences({ region: "PL", warrantyPeriodYears: 5 });
    await render(receipt());
    expect(formatDateInput(component.startDate())).toBe("2031-10-29");
  });

  it("saves the picked day on its own, and asks for notifications on the first date", async () => {
    setPreferences({ region: "PL" });
    await render(receipt());

    (fixture.nativeElement.querySelector('[data-testid="receipt-warranty-add"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(formatDateInput(component.control.value)).toBe("2028-10-29");

    component.save();
    await fixture.whenStable();

    expect(receiptService.setReceiptWarranty).toHaveBeenCalledWith(9, { warrantyUntil: "2028-10-29" });
    expect(component.warrantyUntil()).toBe("2028-10-29");
    expect(webPush.enableForWarranties).toHaveBeenCalledTimes(1);
  });

  it("removes the date without asking for notifications", async () => {
    await render(receipt("2028-10-29"));

    component.remove();
    await fixture.whenStable();

    expect(receiptService.setReceiptWarranty).toHaveBeenCalledWith(9, { warrantyUntil: "" });
    expect(component.warrantyUntil()).toBeNull();
    expect(webPush.enableForWarranties).not.toHaveBeenCalled();
  });

  it("offers no buttons to someone who cannot edit the receipt", async () => {
    await render(receipt(), false);
    expect(fixture.nativeElement.querySelector('[data-testid="receipt-warranty-add"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("No warranty date");
  });
});
