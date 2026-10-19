import 'package:test/test.dart';
import 'package:openapi/openapi.dart';


/// tests for ShoppingListApi
void main() {
  final instance = Openapi().getShoppingListApi();

  group(ShoppingListApi, () {
    // Add shopping list item
    //
    // This will add an item to a shopping list [group.shopping-lists.update]. When the name matches a crossed-off item on the same list (ignoring case), that item is un-checked instead of a duplicate being created; a supplied quantity or note replaces the stored one.
    //
    //Future<ShoppingListItem> addShoppingListItem(int listId, UpsertShoppingListItemCommand upsertShoppingListItemCommand) async
    test('test addShoppingListItem', () async {
      // TODO
    });

    // Clear crossed-off items
    //
    // This will delete every crossed-off item on a shopping list [group.shopping-lists.update]
    //
    //Future clearCheckedShoppingListItems(int listId) async
    test('test clearCheckedShoppingListItems', () async {
      // TODO
    });

    // Create shopping list
    //
    // This will create a shopping list in a group [group.shopping-lists.create]
    //
    //Future<ShoppingList> createShoppingList(int groupId, UpsertShoppingListCommand upsertShoppingListCommand) async
    test('test createShoppingList', () async {
      // TODO
    });

    // Delete shopping list
    //
    // This will delete a shopping list and all of its items [group.shopping-lists.delete]
    //
    //Future deleteShoppingList(int listId) async
    test('test deleteShoppingList', () async {
      // TODO
    });

    // Delete shopping list item
    //
    // This will delete an item from its shopping list [group.shopping-lists.update]
    //
    //Future deleteShoppingListItem(int itemId) async
    test('test deleteShoppingListItem', () async {
      // TODO
    });

    // Get shopping lists for a group
    //
    // This will get every shopping list in a group, each with its items [group.shopping-lists.read]
    //
    //Future<BuiltList<ShoppingList>> getShoppingListsForGroup(int groupId) async
    test('test getShoppingListsForGroup', () async {
      // TODO
    });

    // Set whether a shopping list item is crossed off
    //
    // This will move an item to the given checked state [group.shopping-lists.update]. It sets the state rather than toggling it, so concurrent requests converge; re-sending the current state changes nothing.
    //
    //Future<ShoppingListItem> setShoppingListItemChecked(int itemId, SetShoppingListItemCheckedCommand setShoppingListItemCheckedCommand) async
    test('test setShoppingListItemChecked', () async {
      // TODO
    });

    // Stream shopping list updates
    //
    // Server-Sent Events stream of every shopping list mutation in the group [group.shopping-lists.read]. Each event is named after its ShoppingListEvent type and its data is a ShoppingListEvent as JSON. A comment heartbeat is sent every 25 seconds, and the server ends the stream after 15 minutes (or when the caller loses access) so that reconnecting re-authenticates. Events missed while disconnected are not replayed; refetch the lists after (re)connecting.
    //
    //Future<String> streamShoppingListEvents(int groupId) async
    test('test streamShoppingListEvents', () async {
      // TODO
    });

    // Rename shopping list
    //
    // This will rename a shopping list [group.shopping-lists.update]
    //
    //Future<ShoppingList> updateShoppingList(int listId, UpsertShoppingListCommand upsertShoppingListCommand) async
    test('test updateShoppingList', () async {
      // TODO
    });

    // Update shopping list item
    //
    // This will update an item's name, quantity and note [group.shopping-lists.update]
    //
    //Future<ShoppingListItem> updateShoppingListItem(int itemId, UpsertShoppingListItemCommand upsertShoppingListItemCommand) async
    test('test updateShoppingListItem', () async {
      // TODO
    });

  });
}
