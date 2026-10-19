# openapi.model.ShoppingListEvent

## Load the model package
```dart
import 'package:openapi/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**type** | **String** | One of LIST_CREATED, LIST_UPDATED, LIST_DELETED, ITEM_ADDED, ITEM_UPDATED, ITEM_TOGGLED, ITEM_DELETED, CHECKED_CLEARED. Deliberately a plain string rather than an enum, so a client built before a new event type ships can ignore it instead of failing to deserialize. | 
**groupId** | **int** |  | 
**shoppingListId** | **int** |  | 
**list** | [**ShoppingList**](ShoppingList.md) |  | [optional] 
**item** | [**ShoppingListItem**](ShoppingListItem.md) |  | [optional] 
**itemIds** | **BuiltList&lt;int&gt;** | Ids of the items removed by CHECKED_CLEARED | [optional] 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


