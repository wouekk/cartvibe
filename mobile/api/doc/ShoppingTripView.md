# openapi.model.ShoppingTripView

## Load the model package
```dart
import 'package:openapi/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **int** |  | 
**shoppingListId** | **int** |  | 
**createdAt** | [**DateTime**](DateTime.md) |  | 
**status** | **String** | The trip's status (see ShoppingTrip.status); a plain string | 
**lastError** | **String** |  | 
**waitingForPhoto** | **bool** | True while an uploaded photo has not become a receipt yet | 
**receipt** | [**ShoppingTripReceipt**](ShoppingTripReceipt.md) |  | [optional] 
**plannedItemCount** | **int** | How many list items counted as planned | 
**productCount** | **int** | How many products the receipt has; 0 until the trip is DONE | 
**unplannedAmount** | **String** | What the products not on the list cost, as a decimal string. Null until the trip is DONE, and for a receipt the caller may not see. | [optional] 
**unplannedProducts** | **BuiltList&lt;String&gt;** | Names of the products that were not on the list. Always an array. | 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


