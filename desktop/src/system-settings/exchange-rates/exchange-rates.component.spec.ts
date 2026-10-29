import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { CurrencyRateTable, ExchangeRateService, Permission } from "../../open-api";
import { SnackbarService } from "../../services";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";
import { ExchangeRatesComponent } from "./exchange-rates.component";

import type { Mock } from "vitest";
describe("ExchangeRatesComponent", () => {
  let fixture: ComponentFixture<ExchangeRatesComponent>;
  let component: ExchangeRatesComponent;
  let service: { getExchangeRates: Mock; updateExchangeRates: Mock };
  let snackbar: { success: Mock; error: Mock };

  const table = (rates: { code: string; rate?: string }[]): CurrencyRateTable => ({ mainCurrency: "EUR", rates });

  const input = (code: string): HTMLInputElement =>
    fixture.nativeElement.querySelector(`[data-testid="exchange-rate-input-${code}"]`);

  const type = async (code: string, text: string): Promise<HTMLInputElement> => {
    const field = input(code);
    field.value = text;
    field.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    return field;
  };

  beforeEach(async () => {
    service = {
      getExchangeRates: vi.fn(() => of(table([{ code: "CHF" }, { code: "PLN", rate: "0.230000" }]))),
      updateExchangeRates: vi.fn((view: CurrencyRateTable) => of(view)),
    };
    snackbar = { success: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([AuthState]), ExchangeRatesComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExchangeRateService, useValue: service },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    TestBed.inject(Store).dispatch(new SetPermissions([Permission.AppSystemSettingsUpdate], {}));
    fixture = TestBed.createComponent(ExchangeRatesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("shows saved rates without the zeros the database pads them with", () => {
    expect(input("PLN").value).toBe("0.23");
    expect(input("CHF").value).toBe("");
  });

  it("keeps a half-typed number exactly as typed", async () => {
    for (const text of ["0.", "1.0", "0.2", "1.04"]) {
      const field = await type("CHF", text);

      expect(field.value).toBe(text);
      expect(component.rows().find((row) => row.code === "CHF")?.rate).toBe(text);
    }
  });

  it("turns a comma into a dot as it is typed, and drops what is not a number", async () => {
    expect((await type("CHF", "1,08")).value).toBe("1.08");
    expect((await type("CHF", "1.0a8")).value).toBe("1.08");
    expect((await type("CHF", "1.0.8")).value).toBe("1.08");
  });

  it("finishes the number when the field is left, and Enter does not submit the surrounding form", async () => {
    const field = await type("CHF", "1.");
    field.dispatchEvent(new Event("blur"));
    await fixture.whenStable();
    expect(field.value).toBe("1");

    const typed = await type("PLN", ".5");
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    typed.dispatchEvent(enter);
    await fixture.whenStable();

    expect(enter.defaultPrevented).toBe(true);
    expect(typed.value).toBe("0.5");
  });

  it("saves the parsed rates and shows them again afterwards", async () => {
    await type("CHF", "1,04");
    expect(fixture.nativeElement.querySelector("[data-testid=exchange-rates-unsaved]")).not.toBeNull();

    component.save();
    await fixture.whenStable();

    expect(service.updateExchangeRates).toHaveBeenCalledWith({
      mainCurrency: "EUR",
      rates: [
        { code: "CHF", rate: "1.04" },
        { code: "PLN", rate: "0.23" },
      ],
    });
    expect(snackbar.success).toHaveBeenCalled();
    expect(input("CHF").value).toBe("1.04");
    expect(fixture.nativeElement.querySelector("[data-testid=exchange-rates-unsaved]")).toBeNull();
  });

  it("refuses to save a rate that is not above zero", async () => {
    await type("CHF", "0");

    component.save();
    await fixture.whenStable();

    expect(service.updateExchangeRates).not.toHaveBeenCalled();
    expect(component.error()).toContain("CHF");
  });
});
