import { Injectable } from "@angular/core";
import { Action, Selector, State, StateContext, } from "@ngxs/store";
import { CurrencySeparator, CurrencySymbolPosition } from "../open-api/index";
import { AppDateFormat, DEFAULT_APP_DATE_FORMAT, resolveAppDateFormat } from "../utils/app-date-format";
import { DEFAULT_APP_TIME_ZONE } from "../utils/app-time-zone";
import { SetCurrencyData, SetCurrencyDisplay, SetDateFormat, SetTimeZone } from "./system-settings.state.actions";

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

@State<SystemSettingsStateInterface>({
  name: "systemSettings",
  defaults: {
    currencyDisplay: "$",
    currencyDecimalSeparator: CurrencySeparator.Period,
    currencyThousandthsSeparator: CurrencySeparator.Comma,
    currencySymbolPosition: CurrencySymbolPosition.Start,
    currencyHideDecimalPlaces: false,
    timeZone: DEFAULT_APP_TIME_ZONE,
    dateFormat: DEFAULT_APP_DATE_FORMAT,
  },
})
@Injectable()
export class SystemSettingsState {
  @Selector()
  static currencyDisplay(state: SystemSettingsStateInterface): string {
    return state.currencyDisplay;
  }

  @Selector()
  static currencyDecimalSeparator(state: SystemSettingsStateInterface): CurrencySeparator {
    return state.currencyDecimalSeparator;
  }

  @Selector()
  static currencyThousandthsSeparator(state: SystemSettingsStateInterface): CurrencySeparator {
    return state.currencyThousandthsSeparator;
  }

  @Selector()
  static currencySymbolPosition(state: SystemSettingsStateInterface): CurrencySymbolPosition {
    return state.currencySymbolPosition;
  }

  @Selector()
  static currencyHideDecimalPlaces(state: SystemSettingsStateInterface): boolean {
    return state.currencyHideDecimalPlaces;
  }

  /**
   * Falls back here as well as in the defaults: defaults never run for a slice
   * hydrated from localStorage, so a session persisted before this key existed
   * would otherwise read `undefined`.
   */
  @Selector()
  static timeZone(state: SystemSettingsStateInterface): string {
    return state?.timeZone || DEFAULT_APP_TIME_ZONE;
  }

  /** Resolved here too, for a slice persisted before this key existed (see `timeZone`). */
  @Selector()
  static dateFormat(state: SystemSettingsStateInterface): AppDateFormat {
    return resolveAppDateFormat(state?.dateFormat);
  }

  @Selector()
  static state(state: SystemSettingsStateInterface): SystemSettingsStateInterface {
    return state;
  }

  @Action(SetCurrencyDisplay)
  setCurrencyDisplay(
    { patchState }: StateContext<SystemSettingsStateInterface>,
    payload: SetCurrencyDisplay
  ) {
    patchState({
      currencyDisplay: payload.currencyDisplay,
    });
  }

  @Action(SetCurrencyData)
  setCurrencyData(
    { patchState }: StateContext<SystemSettingsStateInterface>,
    payload: SetCurrencyData
  ) {
    patchState({
      currencySymbolPosition: payload.currencySymbolPosition,
      currencyThousandthsSeparator: payload.currencyThousandthsSeparator,
      currencyDecimalSeparator: payload.currencyDecimalSeparator,
      currencyHideDecimalPlaces: payload.currencyHideDecimalPlaces
    });
  }

  @Action(SetDateFormat)
  setDateFormat(
    { patchState }: StateContext<SystemSettingsStateInterface>,
    payload: SetDateFormat
  ) {
    patchState({
      dateFormat: resolveAppDateFormat(payload.dateFormat),
    });
  }

  @Action(SetTimeZone)
  setTimeZone(
    { patchState }: StateContext<SystemSettingsStateInterface>,
    payload: SetTimeZone
  ) {
    patchState({
      timeZone: payload.timeZone || DEFAULT_APP_TIME_ZONE,
    });
  }
}
