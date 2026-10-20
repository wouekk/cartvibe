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
**health** | **String** | HEALTHY, MEDIUM, UNHEALTHY, NOT_FOOD, UNKNOWN, or empty while not yet classified. A plain string, never an enum, so a new rating cannot break an older client. | 
**foodGroup** | **String** | A short lowercase food group, e.g. \"fresh produce\"; empty while not yet classified | 
**seasonality** | **String** | For fresh fruit and vegetables, SEASONAL or OUT_OF_SEASON in Western Europe in the month bought; NOT_PRODUCE otherwise; empty while not yet classified. A plain string. | 
**classifiedAt** | [**DateTime**](DateTime.md) | When the tags were set; null while waiting to be classified | [optional] 
**classificationOverridden** | **bool** | The tags were corrected by a person | 
**planned** | **bool** | Set once the receipt's shopping trip is compared with its list: true when the product was on the list, false when it was not. Null when the receipt is on no list or not compared yet, which counts as planned. | [optional] 
**matchedShoppingListItemId** | **int** | The list item a planned product matched; it may since have left the list | [optional] 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


