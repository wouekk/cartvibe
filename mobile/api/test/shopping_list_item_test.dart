import 'package:test/test.dart';
import 'package:openapi/openapi.dart';

// tests for ShoppingListItem
void main() {
  final instance = ShoppingListItemBuilder();
  // TODO add properties to the builder and call build()

  group(ShoppingListItem, () {
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

    // List the item belongs to
    // int shoppingListId
    test('to test the property `shoppingListId`', () async {
      // TODO
    });

    // String name
    test('to test the property `name`', () async {
      // TODO
    });

    // Free-text quantity, e.g. 2 lbs. Empty when not set.
    // String quantity
    test('to test the property `quantity`', () async {
      // TODO
    });

    // Empty when not set
    // String note
    test('to test the property `note`', () async {
      // TODO
    });

    // Whether the item is crossed off
    // bool isChecked
    test('to test the property `isChecked`', () async {
      // TODO
    });

    // When the item was crossed off; null while it is on the list
    // DateTime checkedAt
    test('to test the property `checkedAt`', () async {
      // TODO
    });

    // Who crossed the item off; null while it is on the list
    // int checkedByUserId
    test('to test the property `checkedByUserId`', () async {
      // TODO
    });

  });
}
