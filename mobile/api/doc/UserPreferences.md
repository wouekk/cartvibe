# openapi.model.UserPreferences

## Load the model package
```dart
import 'package:openapi/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **int** | User preferences id | 
**createdAt** | **String** |  | 
**createdBy** | **int** |  | [optional] [default to 0]
**createdByString** | **String** | Created by entity's name | [optional] [default to '']
**updatedAt** | **String** |  | [optional] [default to '']
**userId** | **int** | User foreign key | 
**quickScanDefaultGroupId** | **int** | Group foreign key | [optional] [default to 0]
**quickScanDefaultPaidById** | **int** | User foreign key | [optional] [default to 0]
**quickScanDefaultStatus** | [**ReceiptStatus**](ReceiptStatus.md) | Default quick scan status | [optional] [default to 'OPEN']
**closeChipSelectOnSelect** | **bool** | Whether multi-select chip fields close their option list after each selection | [optional] [default to false]
**monthlySpendingGoal** | **String** | The most this person wants to spend in a month, as a decimal string; null or 0 means no goal | [optional] 
**displayCurrency** | **String** | The ISO code of the currency this person sees the Dashboard in; empty means the household currency | [optional] [default to '']
**displayCurrencyRate** | **String** | How many units of displayCurrency one unit of the household currency is worth, as a decimal string; only the Dashboard converts | [optional] 
**userShortcuts** | [**BuiltList&lt;UserShortcut&gt;**](UserShortcut.md) |  | [optional] 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


