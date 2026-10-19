# openapi.model.ShoppingListItem

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
**shoppingListId** | **int** | List the item belongs to | 
**name** | **String** |  | 
**quantity** | **String** | Free-text quantity, e.g. 2 lbs. Empty when not set. | 
**note** | **String** | Empty when not set | 
**isChecked** | **bool** | Whether the item is crossed off | 
**checkedAt** | [**DateTime**](DateTime.md) | When the item was crossed off; null while it is on the list | [optional] 
**checkedByUserId** | **int** | Who crossed the item off; null while it is on the list | [optional] 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


