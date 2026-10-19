# openapi.model.ReceiptProductsView

## Load the model package
```dart
import 'package:openapi/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**status** | **String** | NOT_QUEUED, PENDING, RUNNING, DONE, UNAVAILABLE (the AI could not be reached; retried automatically) or FAILED. A plain string, never an enum, so a new state cannot break an older client. | 
**lastError** | **String** | Why the last read did not succeed; empty otherwise | 
**products** | [**BuiltList&lt;ReceiptProduct&gt;**](ReceiptProduct.md) | The products in receipt order. Always an array. | 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


