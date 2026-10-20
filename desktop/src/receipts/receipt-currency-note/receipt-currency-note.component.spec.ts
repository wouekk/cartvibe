import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReceiptCurrencyFields, ReceiptCurrencyNoteComponent } from "./receipt-currency-note.component";

describe("ReceiptCurrencyNoteComponent", () => {
  let fixture: ComponentFixture<ReceiptCurrencyNoteComponent>;

  const render = async (receipt: ReceiptCurrencyFields | undefined): Promise<string> => {
    fixture = TestBed.createComponent(ReceiptCurrencyNoteComponent);
    fixture.componentRef.setInput("receipt", receipt);
    await fixture.whenStable();
    return fixture.nativeElement.textContent.replace(/\s+/g, " ").trim();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiptCurrencyNoteComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it("shows nothing for a receipt in the main currency", async () => {
    expect(await render({ originalCurrency: "", originalAmount: null, exchangeRate: null })).toBe("");
    expect(await render(undefined)).toBe("");
  });

  it("shows the original amount and the rate for a converted receipt", async () => {
    expect(await render({ originalCurrency: "CHF", originalAmount: "45.9", exchangeRate: "1.04" })).toBe("45.9 CHF at 1.04");
    expect(fixture.nativeElement.querySelector("[data-testid=receipt-original-amount]")).not.toBeNull();
  });

  it("warns when a receipt in another currency has no rate yet", async () => {
    const text = await render({ originalCurrency: "PLN", originalAmount: "100", exchangeRate: null });

    expect(text).toContain("In PLN, not converted");
    expect(fixture.nativeElement.querySelector("[data-testid=receipt-rate-missing]")).not.toBeNull();
  });
});
