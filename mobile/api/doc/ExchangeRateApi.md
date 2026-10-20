# openapi.api.ExchangeRateApi

## Load the API package
```dart
import 'package:openapi/api.dart';
```

All URIs are relative to */api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**getExchangeRates**](ExchangeRateApi.md#getexchangerates) | **GET** /exchangeRate | Get the exchange rates
[**updateExchangeRates**](ExchangeRateApi.md#updateexchangerates) | **PUT** /exchangeRate | Replace the exchange rates


# **getExchangeRates**
> ExchangeRates getExchangeRates()

Get the exchange rates

This will get the main currency and the household's rate for each foreign currency [app.system-settings.read]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getExchangeRateApi();

try {
    final response = api.getExchangeRates();
    print(response);
} catch on DioException (e) {
    print('Exception when calling ExchangeRateApi->getExchangeRates: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**ExchangeRates**](ExchangeRates.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **updateExchangeRates**
> ExchangeRates updateExchangeRates(exchangeRates)

Replace the exchange rates

This will replace the rate table. A rate that is now set converts the receipts saved in that currency while it had none; receipts that already carry a rate are not changed [app.system-settings.update]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getExchangeRateApi();
final ExchangeRates exchangeRates = ; // ExchangeRates | 

try {
    final response = api.updateExchangeRates(exchangeRates);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ExchangeRateApi->updateExchangeRates: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **exchangeRates** | [**ExchangeRates**](ExchangeRates.md)|  | 

### Return type

[**ExchangeRates**](ExchangeRates.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

