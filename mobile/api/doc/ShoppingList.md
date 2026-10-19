# openapi.model.ShoppingList

## Load the model package
```dart
import 'package:openapi/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **int** |  | 
**createdAt** | [**DateTime**](DateTime.md) |  | [optional] 
**updatedAt** | [**DateTime**](DateTime.md) |  | [optional] 
**createdBy** | **int** |  | [optional] 
**groupId** | **int** | Group the list belongs to | 
**name** | **String** | List name, e.g. Supermarket | 
**items** | [**BuiltList&lt;ShoppingListItem&gt;**](ShoppingListItem.md) | The list's items, ordered by creation. Always an array, never null. | 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


