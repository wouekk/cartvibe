import 'package:flutter_test/flutter_test.dart';
import 'package:openapi/openapi.dart';
import 'package:receipt_wrangler_mobile/constants/currency.dart';
import 'package:receipt_wrangler_mobile/utils/currency.dart';

import '../helpers/widget_test_helpers.dart';

// Format used to read out signed plain decimals (no symbol, no group separator)
// for assertions throughout the file.
const _fmt = numberFormatWithoutSymbolOrGroupSeparator;

void main() {
  setUpAll(() {
    registerCustomCurrencyForTests();
  });

  // -------------------------------------------------------------------------
  // exchangeCustomToUSD
  //
  // Parses a string formatted in the custom currency (which the user sees in
  // the UI) and returns a USD Money. The custom currency we register declares
  // ',' as the group separator and '.' as the decimal separator, so this path
  // accepts thousand-separated input.
  // -------------------------------------------------------------------------

  group('exchangeCustomToUSD', () {
    test('returns zero for a null input', () {
      expect(exchangeCustomToUSD(null).format(_fmt), '0.00');
    });

    test('returns zero for an empty input', () {
      expect(exchangeCustomToUSD('').format(_fmt), '0.00');
    });

    test('preserves an explicit zero', () {
      expect(exchangeCustomToUSD('0.00').format(_fmt), '0.00');
    });

    test('preserves a positive amount with two decimals', () {
      expect(exchangeCustomToUSD('100.00').format(_fmt), '100.00');
    });

    test('preserves a small positive decimal', () {
      expect(exchangeCustomToUSD('0.01').format(_fmt), '0.01');
    });

    test('preserves a large positive amount', () {
      expect(exchangeCustomToUSD('9999.99').format(_fmt), '9999.99');
    });

    test('preserves a negative amount with two decimals', () {
      expect(exchangeCustomToUSD('-50.00').format(_fmt), '-50.00');
    });

    test('preserves a small negative decimal', () {
      expect(exchangeCustomToUSD('-0.01').format(_fmt), '-0.01');
    });

    test('preserves a large negative amount', () {
      expect(exchangeCustomToUSD('-9999.99').format(_fmt), '-9999.99');
    });

    test('handles a thousand-separated positive amount '
        '(custom currency pattern groups by comma)', () {
      expect(exchangeCustomToUSD('1,234.56').format(_fmt), '1234.56');
    });

    test('handles a thousand-separated negative amount', () {
      expect(exchangeCustomToUSD('-1,234.56').format(_fmt), '-1234.56');
    });
  });

  // -------------------------------------------------------------------------
  // exchangeUSDToCustom
  //
  // Parses a USD-formatted plain decimal (as stored by the API) and returns a
  // custom-currency Money. Implementation switched to Money.fromNum +
  // double.parse to support negative amounts, since money2's default USD
  // pattern starts with the currency symbol and rejects a leading '-'.
  // -------------------------------------------------------------------------

  group('exchangeUSDToCustom', () {
    test('returns zero for a null input', () {
      expect(exchangeUSDToCustom(null).format(_fmt), '0.00');
    });

    test('returns zero for an empty input', () {
      expect(exchangeUSDToCustom('').format(_fmt), '0.00');
    });

    test('preserves an explicit zero "0.00"', () {
      expect(exchangeUSDToCustom('0.00').format(_fmt), '0.00');
    });

    test('preserves an explicit zero without decimals "0"', () {
      expect(exchangeUSDToCustom('0').format(_fmt), '0.00');
    });

    test(
        'preserves a positive amount with two decimals '
        '(regression baseline for the Money.fromNum switch)', () {
      expect(exchangeUSDToCustom('50.00').format(_fmt), '50.00');
    });

    test('preserves a small positive decimal', () {
      expect(exchangeUSDToCustom('0.01').format(_fmt), '0.01');
    });

    test('preserves a positive whole number without trailing zeros', () {
      expect(exchangeUSDToCustom('100').format(_fmt), '100.00');
    });

    test('preserves a positive amount with a single decimal place', () {
      expect(exchangeUSDToCustom('25.5').format(_fmt), '25.50');
    });

    test('preserves a large positive amount', () {
      expect(exchangeUSDToCustom('9999.99').format(_fmt), '9999.99');
    });

    test('preserves a negative amount with two decimals', () {
      expect(exchangeUSDToCustom('-50.00').format(_fmt), '-50.00');
    });

    test('preserves a small negative decimal', () {
      expect(exchangeUSDToCustom('-0.01').format(_fmt), '-0.01');
    });

    test('preserves a negative whole number without trailing zeros', () {
      expect(exchangeUSDToCustom('-100').format(_fmt), '-100.00');
    });

    test('preserves a large negative amount', () {
      expect(exchangeUSDToCustom('-9999.99').format(_fmt), '-9999.99');
    });

    test('throws on a non-numeric input', () {
      // Documents the invalid-input contract — callers should pre-validate.
      expect(() => exchangeUSDToCustom('not a number'),
          throwsA(isA<FormatException>()));
    });
  });

  // -------------------------------------------------------------------------
  // Round-trips — the value should survive a conversion in either direction
  // and back, in both signs and across decimal/whole-number forms.
  // -------------------------------------------------------------------------

  group('round-trip USD → custom → USD', () {
    test('preserves a positive amount', () {
      final asCustom = exchangeUSDToCustom('25.50').format(_fmt);
      expect(exchangeCustomToUSD(asCustom).format(_fmt), '25.50');
    });

    test('preserves a negative amount', () {
      final asCustom = exchangeUSDToCustom('-25.50').format(_fmt);
      expect(exchangeCustomToUSD(asCustom).format(_fmt), '-25.50');
    });

    test('preserves zero', () {
      final asCustom = exchangeUSDToCustom('0.00').format(_fmt);
      expect(exchangeCustomToUSD(asCustom).format(_fmt), '0.00');
    });

    test('preserves a small decimal', () {
      final asCustom = exchangeUSDToCustom('0.01').format(_fmt);
      expect(exchangeCustomToUSD(asCustom).format(_fmt), '0.01');
    });

    test('preserves a large amount', () {
      final asCustom = exchangeUSDToCustom('9999.99').format(_fmt);
      expect(exchangeCustomToUSD(asCustom).format(_fmt), '9999.99');
    });
  });

  group('round-trip custom → USD → custom', () {
    test('preserves a positive amount', () {
      final asUsd = exchangeCustomToUSD('25.50').format(_fmt);
      expect(exchangeUSDToCustom(asUsd).format(_fmt), '25.50');
    });

    test('preserves a negative amount', () {
      final asUsd = exchangeCustomToUSD('-25.50').format(_fmt);
      expect(exchangeUSDToCustom(asUsd).format(_fmt), '-25.50');
    });

    test('preserves zero', () {
      final asUsd = exchangeCustomToUSD('0.00').format(_fmt);
      expect(exchangeUSDToCustom(asUsd).format(_fmt), '0.00');
    });
  });

  // -------------------------------------------------------------------------
  // getCurrencySeparatorLiteral — pure enum-to-character mapping.
  // -------------------------------------------------------------------------

  group('getCurrencySeparatorLiteral', () {
    test('returns "," for comma', () {
      expect(getCurrencySeparatorLiteral(CurrencySeparator.comma), ',');
    });

    test('returns "." for period', () {
      expect(getCurrencySeparatorLiteral(CurrencySeparator.period), '.');
    });
  });
}
