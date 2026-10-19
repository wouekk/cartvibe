import 'package:test/test.dart';
import 'package:openapi/openapi.dart';

// tests for ReceiptProductsView
void main() {
  final instance = ReceiptProductsViewBuilder();
  // TODO add properties to the builder and call build()

  group(ReceiptProductsView, () {
    // NOT_QUEUED, PENDING, RUNNING, DONE, UNAVAILABLE (the AI could not be reached; retried automatically) or FAILED. A plain string, never an enum, so a new state cannot break an older client.
    // String status
    test('to test the property `status`', () async {
      // TODO
    });

    // Why the last read did not succeed; empty otherwise
    // String lastError
    test('to test the property `lastError`', () async {
      // TODO
    });

    // The products in receipt order. Always an array.
    // BuiltList<ReceiptProduct> products
    test('to test the property `products`', () async {
      // TODO
    });

  });
}
