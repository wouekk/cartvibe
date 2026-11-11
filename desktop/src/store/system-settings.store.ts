import { computed, Injectable } from "@angular/core";
import { CurrencySeparator, CurrencySymbolPosition } from "../open-api/index";
import { AppDateFormat, DEFAULT_APP_DATE_FORMAT, resolveAppDateFormat } from "../utils/app-date-format";
import { DEFAULT_APP_TIME_ZONE } from "../utils/app-time-zone";
import { StateStore } from "./state-store";

export interface SystemSettingsStateInterface {
  currencyDisplay: string;
  currencySymbolPosition: CurrencySymbolPosition;
  currencyDecimalSeparator: CurrencySeparator;
  currencyThousandthsSeparator: CurrencySeparator;
  currencyHideDecimalPlaces: boolean;
  /** The app time zone (IANA name). See `src/utils/app-time-zone.ts`. */
  timeZone: string;
  /** The household date format. See `src/utils/app-date-format.ts`. */
  dateFormat: AppDateFormat;
}

/** How the server wants money, dates and the time zone shown; read at every start and kept between visits. */
@Injectable({ providedIn: "root" })
export class SystemSettingsStore extends StateStore<SystemSettingsStateInterface> {
  public readonly currencyDisplay = computed(() => this.state().currencyDisplay);

  public readonly currencyDecimalSeparator = computed(() => this.state().currencyDecimalSeparator);

  public readonly currencyThousandthsSeparator = computed(() => this.state().currencyThousandthsSeparator);

  public readonly currencySymbolPosition = computed(() => this.state().currencySymbolPosition);

  public readonly currencyHideDecimalPlaces = computed(() => this.state().currencyHideDecimalPlaces);

  /** Never empty: a slice that names the key without a value still reads as the default zone. */
  public readonly timeZone = computed(() => this.state().timeZone || DEFAULT_APP_TIME_ZONE);

  /** Always one of the known formats, whatever was kept. */
  public readonly dateFormat = computed((): AppDateFormat => resolveAppDateFormat(this.state().dateFormat));

  constructor() {
    super(
      () => ({
        currencyDisplay: "$",
        currencyDecimalSeparator: CurrencySeparator.Period,
        currencyThousandthsSeparator: CurrencySeparator.Comma,
        currencySymbolPosition: CurrencySymbolPosition.Start,
        currencyHideDecimalPlaces: false,
        timeZone: DEFAULT_APP_TIME_ZONE,
        dateFormat: DEFAULT_APP_DATE_FORMAT,
      }),
      "systemSettings"
    );
  }

  public setCurrencyDisplay(currencyDisplay: string): void {
    this.patch({ currencyDisplay });
  }

  public setCurrencyData(
    currencySymbolPosition: CurrencySymbolPosition,
    currencyDecimalSeparator: CurrencySeparator,
    currencyThousandthsSeparator: CurrencySeparator,
    currencyHideDecimalPlaces: boolean
  ): void {
    this.patch({ currencySymbolPosition, currencyThousandthsSeparator, currencyDecimalSeparator, currencyHideDecimalPlaces });
  }

  public setDateFormat(dateFormat: string): void {
    this.patch({ dateFormat: resolveAppDateFormat(dateFormat) });
  }

  public setTimeZone(timeZone: string): void {
    this.patch({ timeZone: timeZone || DEFAULT_APP_TIME_ZONE });
  }
}
