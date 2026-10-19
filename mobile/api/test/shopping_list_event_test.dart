import 'package:test/test.dart';
import 'package:openapi/openapi.dart';

// tests for ShoppingListEvent
void main() {
  final instance = ShoppingListEventBuilder();
  // TODO add properties to the builder and call build()

  group(ShoppingListEvent, () {
    // One of LIST_CREATED, LIST_UPDATED, LIST_DELETED, ITEM_ADDED, ITEM_UPDATED, ITEM_TOGGLED, ITEM_DELETED, CHECKED_CLEARED. Deliberately a plain string rather than an enum, so a client built before a new event type ships can ignore it instead of failing to deserialize.
    // String type
    test('to test the property `type`', () async {
      // TODO
    });

    // int groupId
    test('to test the property `groupId`', () async {
      // TODO
    });

    // int shoppingListId
    test('to test the property `shoppingListId`', () async {
      // TODO
    });

    // ShoppingList list
    test('to test the property `list`', () async {
      // TODO
    });

    // ShoppingListItem item
    test('to test the property `item`', () async {
      // TODO
    });

    // Ids of the items removed by CHECKED_CLEARED
    // BuiltList<int> itemIds
    test('to test the property `itemIds`', () async {
      // TODO
    });

  });
}
