# openapi.model.ReceiptProduct

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
**receiptId** | **int** |  | 
**name** | **String** | The product line as printed on the receipt | 
**displayName** | **String** | A short plain name for the product; empty when the AI gave none | 
**amount** | **String** | What the line cost, as a decimal string; null when the receipt shows no price | [optional] 
**quantity** | **String** | Quantity or weight as printed; empty when not printed | 
**position** | **int** | The line's order on the receipt | 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


