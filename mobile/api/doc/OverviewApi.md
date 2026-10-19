# openapi.api.OverviewApi

## Load the API package
```dart
import 'package:openapi/api.dart';
```

All URIs are relative to */api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**getGroupOverview**](OverviewApi.md#getgroupoverview) | **GET** /overview/group/{groupId} | Get the group&#39;s month at a glance


# **getGroupOverview**
> GroupOverview getGroupOverview(groupId, month)

Get the group's month at a glance

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

try {
    final response = api.getGroupOverview(groupId, month);
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

### Return type

[**GroupOverview**](GroupOverview.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

