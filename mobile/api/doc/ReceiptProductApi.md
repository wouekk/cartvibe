# openapi.api.ReceiptProductApi

## Load the API package
```dart
import 'package:openapi/api.dart';
```

All URIs are relative to */api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**getReceiptProducts**](ReceiptProductApi.md#getreceiptproducts) | **GET** /receipt-product/receipt/{receiptId} | Get a receipt&#39;s products
[**queueGroupReceiptProducts**](ReceiptProductApi.md#queuegroupreceiptproducts) | **POST** /receipt-product/group/{groupId}/backfill | Read the products of a group&#39;s older receipts
[**readReceiptProducts**](ReceiptProductApi.md#readreceiptproducts) | **POST** /receipt-product/receipt/{receiptId}/read | Read a receipt&#39;s products again
[**setReceiptProductClassification**](ReceiptProductApi.md#setreceiptproductclassification) | **PUT** /receipt-product/product/{productId}/classification | Correct a receipt product&#39;s health and seasonality tags


# **getReceiptProducts**
> ReceiptProductsView getReceiptProducts(receiptId)

Get a receipt's products

This will get the products the AI read off a receipt, and where reading them stands [group.receipts.read]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getReceiptProductApi();
final int receiptId = 56; // int | Id of the receipt

try {
    final response = api.getReceiptProducts(receiptId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReceiptProductApi->getReceiptProducts: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **receiptId** | **int**| Id of the receipt | 

### Return type

[**ReceiptProductsView**](ReceiptProductsView.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **queueGroupReceiptProducts**
> QueuedReceiptsView queueGroupReceiptProducts(groupId)

Read the products of a group's older receipts

This will queue every receipt in the group that has an image but has never had its products read [group.receipts.update]. Receipts are read a few at a time in the background.

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getReceiptProductApi();
final int groupId = 56; // int | Id of the group; the All group is rejected

try {
    final response = api.queueGroupReceiptProducts(groupId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReceiptProductApi->queueGroupReceiptProducts: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **groupId** | **int**| Id of the group; the All group is rejected | 

### Return type

[**QueuedReceiptsView**](QueuedReceiptsView.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **readReceiptProducts**
> ReceiptProductsView readReceiptProducts(receiptId)

Read a receipt's products again

This will queue the receipt to have its products read again by the AI [group.receipts.update]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getReceiptProductApi();
final int receiptId = 56; // int | Id of the receipt

try {
    final response = api.readReceiptProducts(receiptId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReceiptProductApi->readReceiptProducts: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **receiptId** | **int**| Id of the receipt | 

### Return type

[**ReceiptProductsView**](ReceiptProductsView.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **setReceiptProductClassification**
> ReceiptProduct setReceiptProductClassification(productId, setFoodClassificationCommand)

Correct a receipt product's health and seasonality tags

This will set the product's tags and remember the health rating for the group's future products [group.receipts.update]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getReceiptProductApi();
final int productId = 56; // int | Id of the receipt product
final SetFoodClassificationCommand setFoodClassificationCommand = ; // SetFoodClassificationCommand | 

try {
    final response = api.setReceiptProductClassification(productId, setFoodClassificationCommand);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReceiptProductApi->setReceiptProductClassification: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **productId** | **int**| Id of the receipt product | 
 **setFoodClassificationCommand** | [**SetFoodClassificationCommand**](SetFoodClassificationCommand.md)|  | 

### Return type

[**ReceiptProduct**](ReceiptProduct.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

