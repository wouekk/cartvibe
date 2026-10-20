import { CurrencySeparator, CurrencySymbolPosition } from "../../open-api";

/**
 * A currency an admin picks by name (Phase 3 M7) instead of setting the symbol, its position and
 * both separators by hand. Amounts are stored without a currency, so a preset only changes how they
 * are shown. A symbol shown after the amount starts with a space ("12,99 €"): the currency pipe
 * appends it as is.
 */
export interface CurrencyPreset {
  code: string;
  label: string;
  currencyDisplay: string;
  currencySymbolPosition: CurrencySymbolPosition;
  currencyThousandthsSeparator: CurrencySeparator;
  currencyDecimalSeparator: CurrencySeparator;
}

/** The choice that shows the raw fields; also what any combination outside the presets reads as. */
export const CUSTOM_CURRENCY = "CUSTOM";

export const CURRENCY_PRESETS: CurrencyPreset[] = [
  {
    code: "EUR",
    label: "Euro (12,99 €)",
    currencyDisplay: " €",
    currencySymbolPosition: CurrencySymbolPosition.End,
    currencyThousandthsSeparator: CurrencySeparator.Period,
    currencyDecimalSeparator: CurrencySeparator.Comma,
  },
  {
    code: "PLN",
    label: "Polish złoty (12,99 zł)",
    currencyDisplay: " zł",
    currencySymbolPosition: CurrencySymbolPosition.End,
    currencyThousandthsSeparator: CurrencySeparator.Period,
    currencyDecimalSeparator: CurrencySeparator.Comma,
  },
  {
    code: "USD",
    label: "US dollar ($12.99)",
    currencyDisplay: "$",
    currencySymbolPosition: CurrencySymbolPosition.Start,
    currencyThousandthsSeparator: CurrencySeparator.Comma,
    currencyDecimalSeparator: CurrencySeparator.Period,
  },
  {
    code: "GBP",
    label: "British pound (£12.99)",
    currencyDisplay: "£",
    currencySymbolPosition: CurrencySymbolPosition.Start,
    currencyThousandthsSeparator: CurrencySeparator.Comma,
    currencyDecimalSeparator: CurrencySeparator.Period,
  },
  {
    code: "CHF",
    label: "Swiss franc (CHF 12.99)",
    currencyDisplay: "CHF ",
    currencySymbolPosition: CurrencySymbolPosition.Start,
    currencyThousandthsSeparator: CurrencySeparator.Comma,
    currencyDecimalSeparator: CurrencySeparator.Period,
  },
];

export type CurrencyFormatValues = Pick<
  CurrencyPreset,
  "currencyDisplay" | "currencySymbolPosition" | "currencyThousandthsSeparator" | "currencyDecimalSeparator"
> & { currencyHideDecimalPlaces?: boolean };

/** The preset these settings are exactly, or CUSTOM. Hidden decimals is never a preset. */
export function matchCurrencyPreset(values: Partial<CurrencyFormatValues>): string {
  if (values.currencyHideDecimalPlaces) {
    return CUSTOM_CURRENCY;
  }

  const preset = CURRENCY_PRESETS.find(
    (candidate) =>
      candidate.currencyDisplay === values.currencyDisplay &&
      candidate.currencySymbolPosition === values.currencySymbolPosition &&
      candidate.currencyThousandthsSeparator === values.currencyThousandthsSeparator &&
      candidate.currencyDecimalSeparator === values.currencyDecimalSeparator
  );

  return preset?.code ?? CUSTOM_CURRENCY;
}
