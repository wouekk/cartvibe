# openapi.api.OverviewApi

## Load the API package
```dart
import 'package:openapi/api.dart';
```

All URIs are relative to */api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**getGroupOverview**](OverviewApi.md#getgroupoverview) | **GET** /overview/group/{groupId} | Get the group&#39;s period at a glance
[**getOverviewProducts**](OverviewApi.md#getoverviewproducts) | **GET** /overview/group/{groupId}/products | List the products behind a Dashboard tile


# **getGroupOverview**
> GroupOverview getGroupOverview(groupId, month, from, to)

Get the group's period at a glance

This will get a month's spend, receipt counts, spending by category and the six-month trend ending with it, over the receipts the caller can see [group.receipts.read]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getOverviewApi();
final int groupId = 56; // int | Id of the group to describe; the All group spans every group the caller can read
final String month = month_example; // String | Month to describe, yyyy-MM. Defaults to the current month in the app time zone.
final String from = from_example; // String | First day to describe, yyyy-MM-dd. With to, replaces month; the period before it (the previous calendar months for whole months, otherwise the same number of days) is the comparison.
final String to = to_example; // String | Last day to describe, yyyy-MM-dd

try {
    final response = api.getGroupOverview(groupId, month, from, to);
    print(response);
} catch on DioException (e) {
    print('Exception when calling OverviewApi->getGroupOverview: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **groupId** | **int**| Id of the group to describe; the All group spans every group the caller can read | 
 **month** | **String**| Month to describe, yyyy-MM. Defaults to the current month in the app time zone. | [optional] 
 **from** | **String**| First day to describe, yyyy-MM-dd. With to, replaces month; the period before it (the previous calendar months for whole months, otherwise the same number of days) is the comparison. | [optional] 
 **to** | **String**| Last day to describe, yyyy-MM-dd | [optional] 

### Return type

[**GroupOverview**](GroupOverview.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getOverviewProducts**
> BuiltList<GroupOverviewProduct> getOverviewProducts(groupId, kind, foodGroup, month, from, to)

List the products behind a Dashboard tile

This will list the product lines that make up the Unhealthy or Unplanned figure for a period, newest receipt first, over the receipts the caller can see [group.receipts.read]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getOverviewApi();
final int groupId = 56; // int | Id of the group; the All group spans every group the caller can read
final String kind = kind_example; // String | UNHEALTHY, UNPLANNED or FOODGROUP (the products of one food group)
final String foodGroup = foodGroup_example; // String | With kind FOODGROUP, the food group's name as the Dashboard shows it; empty for Uncategorized
final String month = month_example; // String | Month, yyyy-MM. Defaults to the current month in the app time zone.
final String from = from_example; // String | First day, yyyy-MM-dd. With to, replaces month.
final String to = to_example; // String | Last day, yyyy-MM-dd

try {
    final response = api.getOverviewProducts(groupId, kind, foodGroup, month, from, to);
    print(response);
} catch on DioException (e) {
    print('Exception when calling OverviewApi->getOverviewProducts: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **groupId** | **int**| Id of the group; the All group spans every group the caller can read | 
 **kind** | **String**| UNHEALTHY, UNPLANNED or FOODGROUP (the products of one food group) | 
 **foodGroup** | **String**| With kind FOODGROUP, the food group's name as the Dashboard shows it; empty for Uncategorized | [optional] 
 **month** | **String**| Month, yyyy-MM. Defaults to the current month in the app time zone. | [optional] 
 **from** | **String**| First day, yyyy-MM-dd. With to, replaces month. | [optional] 
 **to** | **String**| Last day, yyyy-MM-dd | [optional] 

### Return type

[**BuiltList&lt;GroupOverviewProduct&gt;**](GroupOverviewProduct.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

