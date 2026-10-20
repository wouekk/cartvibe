import 'package:test/test.dart';
import 'package:openapi/openapi.dart';

// tests for ShoppingTrip
void main() {
  final instance = ShoppingTripBuilder();
  // TODO add properties to the builder and call build()

  group(ShoppingTrip, () {
    // int id
    test('to test the property `id`', () async {
      // TODO
    });

    // DateTime createdAt
    test('to test the property `createdAt`', () async {
      // TODO
    });

    // DateTime updatedAt
    test('to test the property `updatedAt`', () async {
      // TODO
    });

    // int createdBy
    test('to test the property `createdBy`', () async {
      // TODO
    });

    // String createdByString
    test('to test the property `createdByString`', () async {
      // TODO
    });

    // int shoppingListId
    test('to test the property `shoppingListId`', () async {
      // TODO
    });

    // Null while an uploaded photo waits to become a receipt
    // int receiptId
    test('to test the property `receiptId`', () async {
      // TODO
    });

    // PENDING, RUNNING, DONE, UNAVAILABLE (the AI could not be reached; retried automatically) or FAILED. A plain string, never an enum, so a new state cannot break an older client.
    // String status
    test('to test the property `status`', () async {
      // TODO
    });

    // Why the last step did not succeed; empty otherwise
    // String lastError
    test('to test the property `lastError`', () async {
      // TODO
    });

  });
}
