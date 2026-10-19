import 'package:test/test.dart';
import 'package:openapi/openapi.dart';

// tests for ReceiptProduct
void main() {
  final instance = ReceiptProductBuilder();
  // TODO add properties to the builder and call build()

  group(ReceiptProduct, () {
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

    // int receiptId
    test('to test the property `receiptId`', () async {
      // TODO
    });

    // The product line as printed on the receipt
    // String name
    test('to test the property `name`', () async {
      // TODO
    });

    // A short plain name for the product; empty when the AI gave none
    // String displayName
    test('to test the property `displayName`', () async {
      // TODO
    });

    // What the line cost, as a decimal string; null when the receipt shows no price
    // String amount
    test('to test the property `amount`', () async {
      // TODO
    });

    // Quantity or weight as printed; empty when not printed
    // String quantity
    test('to test the property `quantity`', () async {
      // TODO
    });

    // The line's order on the receipt
    // int position
    test('to test the property `position`', () async {
      // TODO
    });

  });
}
