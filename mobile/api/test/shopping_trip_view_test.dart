import 'package:test/test.dart';
import 'package:openapi/openapi.dart';

// tests for ShoppingTripView
void main() {
  final instance = ShoppingTripViewBuilder();
  // TODO add properties to the builder and call build()

  group(ShoppingTripView, () {
    // int id
    test('to test the property `id`', () async {
      // TODO
    });

    // int shoppingListId
    test('to test the property `shoppingListId`', () async {
      // TODO
    });

    // DateTime createdAt
    test('to test the property `createdAt`', () async {
      // TODO
    });

    // The trip's status (see ShoppingTrip.status); a plain string
    // String status
    test('to test the property `status`', () async {
      // TODO
    });

    // String lastError
    test('to test the property `lastError`', () async {
      // TODO
    });

    // True while an uploaded photo has not become a receipt yet
    // bool waitingForPhoto
    test('to test the property `waitingForPhoto`', () async {
      // TODO
    });

    // ShoppingTripReceipt receipt
    test('to test the property `receipt`', () async {
      // TODO
    });

    // How many list items counted as planned
    // int plannedItemCount
    test('to test the property `plannedItemCount`', () async {
      // TODO
    });

    // How many products the receipt has; 0 until the trip is DONE
    // int productCount
    test('to test the property `productCount`', () async {
      // TODO
    });

    // What the products not on the list cost, as a decimal string. Null until the trip is DONE, and for a receipt the caller may not see.
    // String unplannedAmount
    test('to test the property `unplannedAmount`', () async {
      // TODO
    });

    // Names of the products that were not on the list. Always an array.
    // BuiltList<String> unplannedProducts
    test('to test the property `unplannedProducts`', () async {
      // TODO
    });

  });
}
