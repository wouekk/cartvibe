import 'package:test/test.dart';
import 'package:openapi/openapi.dart';


/// tests for ExchangeRateApi
void main() {
  final instance = Openapi().getExchangeRateApi();

  group(ExchangeRateApi, () {
    // Get the exchange rates
    //
    // This will get the main currency and the household's rate for each foreign currency [app.system-settings.read]
    //
    //Future<ExchangeRates> getExchangeRates() async
    test('test getExchangeRates', () async {
      // TODO
    });

    // Replace the exchange rates
    //
    // This will replace the rate table. A rate that is now set converts the receipts saved in that currency while it had none; receipts that already carry a rate are not changed [app.system-settings.update]
    //
    //Future<ExchangeRates> updateExchangeRates(ExchangeRates exchangeRates) async
    test('test updateExchangeRates', () async {
      // TODO
    });

  });
}
