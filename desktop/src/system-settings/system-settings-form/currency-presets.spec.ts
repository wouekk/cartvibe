import { CurrencySeparator, CurrencySymbolPosition } from "../../open-api";
import { CURRENCY_PRESETS, CUSTOM_CURRENCY, matchCurrencyPreset } from "./currency-presets";

describe("currency presets", () => {
  const euro = CURRENCY_PRESETS.find((preset) => preset.code === "EUR")!;

  it("recognises settings that are exactly a preset", () => {
    expect(matchCurrencyPreset({ ...euro, currencyHideDecimalPlaces: false })).toBe("EUR");
    // Upstream's defaults.
    expect(
      matchCurrencyPreset({
        currencyDisplay: "$",
        currencySymbolPosition: CurrencySymbolPosition.Start,
        currencyThousandthsSeparator: CurrencySeparator.Comma,
        currencyDecimalSeparator: CurrencySeparator.Period,
      })
    ).toBe("USD");
  });

  it("reads anything else as custom", () => {
    expect(matchCurrencyPreset({ ...euro, currencyDisplay: "€" })).toBe(CUSTOM_CURRENCY);
    expect(matchCurrencyPreset({ ...euro, currencyHideDecimalPlaces: true })).toBe(CUSTOM_CURRENCY);
    expect(matchCurrencyPreset({})).toBe(CUSTOM_CURRENCY);
  });
});
