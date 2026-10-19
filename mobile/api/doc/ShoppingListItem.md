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
**amount** | **String** | How much to buy, as a decimal string (e.g. \"1.5\"); null when not given | [optional] 
**unit** | **String** | Unit of the amount: one of pcs, kg, g, l, ml, pack, bottle, can, box, bag, jar, bunch, dozen; empty when there is no amount or it is a plain count. A plain string, never an enum, so a unit added later cannot break an older client. | 
**quantity** | **String** | The original free-text quantity, kept for items written before amount and unit existed. Superseded by amount and unit; empty when not set. | 
**note** | **String** | Empty when not set | 
**isChecked** | **bool** | Whether the item is crossed off | 
**checkedAt** | [**DateTime**](DateTime.md) | When the item was crossed off; null while it is on the list | [optional] 
**checkedByUserId** | **int** | Who crossed the item off; null while it is on the list | [optional] 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


