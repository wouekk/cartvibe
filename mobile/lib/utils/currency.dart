import 'package:flutter/cupertino.dart';
import 'package:money2/money2.dart';
import 'package:openapi/openapi.dart';
import 'package:provider/provider.dart';
import 'package:receipt_wrangler_mobile/constants/currency.dart';

import '../models/system_settings_model.dart';

String getDefaultFormat(BuildContext context) {
  var systemSettingsModel =
      Provider.of<SystemSettingsModel>(context, listen: false);
  var symbolDisplayPosition = systemSettingsModel.currencySymbolPosition;
  var format = numberFormatWithoutSymbol;

  if (symbolDisplayPosition == CurrencySymbolPosition.START) {
    var formatParts = format.split("");
    formatParts.insert(0, "S");
    format = formatParts.join("");
  } else {
    format = format + "S";
  }

  if (systemSettingsModel.currencyHideDecimalPlaces) {
    format = format.replaceAll(".00", "");
  }

  return format;
}

String? formatCurrency(BuildContext context, String amount) {
  return exchangeUSDToCustom(amount).toString();
}

String getCurrencySeparatorLiteral(CurrencySeparator separator) {
  switch (separator) {
    case CurrencySeparator.comma:
      return ',';
    case CurrencySeparator.period:
      return '.';
    default:
      return '';
  }
}

void registerCustomCurrency(BuildContext context) {
  var systemSettingsModel =
      Provider.of<SystemSettingsModel>(context, listen: false);

  var currency = Currency.create(
    customCurrencyISOCode,
    systemSettingsModel.currencyHideDecimalPlaces ? 0 : 2,
    name: customCurrencyISOCode,
    symbol: systemSettingsModel.currencyDisplay,
    groupSeparator: getCurrencySeparatorLiteral(
        systemSettingsModel.currencyThousandSeparator),
    decimalSeparator: getCurrencySeparatorLiteral(
        systemSettingsModel.currencyDecimalSeparator),
    pattern: getDefaultFormat(context),
  );

  Currencies().register(currency);
}

Money exchangeCustomToUSD(String? customValue) {
  if (customValue == null || customValue.isEmpty) {
    return Money.parse("0", isoCode: "USD");
  }

  var parsedCustomValue =
      Money.parse(customValue, isoCode: customCurrencyISOCode);

  ExchangeRate exchangeRate = ExchangeRate.fromNum(1,
      decimalDigits: 2, fromIsoCode: customCurrencyISOCode, toIsoCode: "USD");

  var usdValue = exchangeRate.applyRate(parsedCustomValue);
  return usdValue;
}

Money exchangeUSDToCustom(String? usdValue) {
  if (usdValue == null || usdValue.isEmpty) {
    return Money.fromNum(0, isoCode: customCurrencyISOCode);
  }

  // Money.parse uses the USD pattern (which leads with the currency symbol),
  // so "-50.00" without a "$" prefix fails. API-stored amounts and form
  // values are plain decimals (no group separators), so parse the double
  // directly to support negatives end-to-end.
  var parsedUSDValue = Money.fromNum(double.parse(usdValue), isoCode: "USD");

  ExchangeRate exchangeRate = ExchangeRate.fromNum(1,
      decimalDigits: 2, fromIsoCode: "USD", toIsoCode: customCurrencyISOCode);

  var customValue = exchangeRate.applyRate(parsedUSDValue);
  return customValue;
}
