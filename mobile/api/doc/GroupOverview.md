# openapi.model.GroupOverview

## Load the model package
```dart
import 'package:openapi/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**month** | **String** | The month described, yyyy-MM | 
**total** | **String** | The month's spend, as a decimal string | 
**previousTotal** | **String** | The previous month's spend, as a decimal string | 
**receiptCount** | **int** |  | 
**openReceiptCount** | **int** | The month's receipts still to check (OPEN, NEEDS_ATTENTION or DRAFT) | 
**unhealthyTotal** | **String** | What the month's products rated UNHEALTHY cost, as a decimal string, whatever the receipt's category. Products without a price or not rated yet do not count. | 
**categories** | [**BuiltList&lt;GroupOverviewCategory&gt;**](GroupOverviewCategory.md) | Spend per category in the month, largest first. A receipt counts toward each of its categories, so these can add up to more than the total. Always an array. | 
**months** | [**BuiltList&lt;GroupOverviewMonth&gt;**](GroupOverviewMonth.md) | The six months ending with month, oldest first; a month without receipts is a zero | 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


