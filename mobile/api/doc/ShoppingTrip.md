# openapi.model.ShoppingTrip

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
**createdByString** | **String** |  | [optional] 
**shoppingListId** | **int** |  | 
**receiptId** | **int** | Null while an uploaded photo waits to become a receipt | [optional] 
**status** | **String** | PENDING, RUNNING, DONE, UNAVAILABLE (the AI could not be reached; retried automatically) or FAILED. A plain string, never an enum, so a new state cannot break an older client. | 
**lastError** | **String** | Why the last step did not succeed; empty otherwise | 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


