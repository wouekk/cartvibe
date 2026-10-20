# openapi.api.ShoppingListApi

## Load the API package
```dart
import 'package:openapi/api.dart';
```

All URIs are relative to */api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**addShoppingListItem**](ShoppingListApi.md#addshoppinglistitem) | **POST** /shopping-list/{listId}/item | Add shopping list item
[**clearCheckedShoppingListItems**](ShoppingListApi.md#clearcheckedshoppinglistitems) | **POST** /shopping-list/{listId}/clearChecked | Clear crossed-off items
[**createShoppingList**](ShoppingListApi.md#createshoppinglist) | **POST** /shopping-list/group/{groupId} | Create shopping list
[**deleteShoppingList**](ShoppingListApi.md#deleteshoppinglist) | **DELETE** /shopping-list/{listId} | Delete shopping list
[**deleteShoppingListItem**](ShoppingListApi.md#deleteshoppinglistitem) | **DELETE** /shopping-list/item/{itemId} | Delete shopping list item
[**getShoppingListsForGroup**](ShoppingListApi.md#getshoppinglistsforgroup) | **GET** /shopping-list/group/{groupId} | Get shopping lists for a group
[**setShoppingListItemChecked**](ShoppingListApi.md#setshoppinglistitemchecked) | **PUT** /shopping-list/item/{itemId}/checked | Set whether a shopping list item is crossed off
[**setShoppingListItemClassification**](ShoppingListApi.md#setshoppinglistitemclassification) | **PUT** /shopping-list/item/{itemId}/classification | Correct a shopping list item&#39;s health and seasonality tags
[**streamShoppingListEvents**](ShoppingListApi.md#streamshoppinglistevents) | **GET** /shopping-list/group/{groupId}/stream | Stream shopping list updates
[**updateShoppingList**](ShoppingListApi.md#updateshoppinglist) | **PUT** /shopping-list/{listId} | Rename shopping list
[**updateShoppingListItem**](ShoppingListApi.md#updateshoppinglistitem) | **PUT** /shopping-list/item/{itemId} | Update shopping list item


# **addShoppingListItem**
> ShoppingListItem addShoppingListItem(listId, upsertShoppingListItemCommand)

Add shopping list item

This will add an item to a shopping list [group.shopping-lists.update]. When the name matches a crossed-off item on the same list (ignoring case), that item is un-checked instead of a duplicate being created; a supplied quantity or note replaces the stored one.

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int listId = 56; // int | Id of the shopping list to add the item to
final UpsertShoppingListItemCommand upsertShoppingListItemCommand = ; // UpsertShoppingListItemCommand | Item to add

try {
    final response = api.addShoppingListItem(listId, upsertShoppingListItemCommand);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->addShoppingListItem: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **listId** | **int**| Id of the shopping list to add the item to | 
 **upsertShoppingListItemCommand** | [**UpsertShoppingListItemCommand**](UpsertShoppingListItemCommand.md)| Item to add | 

### Return type

[**ShoppingListItem**](ShoppingListItem.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **clearCheckedShoppingListItems**
> clearCheckedShoppingListItems(listId)

Clear crossed-off items

This will delete every crossed-off item on a shopping list [group.shopping-lists.update]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int listId = 56; // int | Id of the shopping list to clear

try {
    api.clearCheckedShoppingListItems(listId);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->clearCheckedShoppingListItems: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **listId** | **int**| Id of the shopping list to clear | 

### Return type

void (empty response body)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createShoppingList**
> ShoppingList createShoppingList(groupId, upsertShoppingListCommand)

Create shopping list

This will create a shopping list in a group [group.shopping-lists.create]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int groupId = 56; // int | Id of the group the shopping lists belong to. The \"All\" group is rejected with 400.
final UpsertShoppingListCommand upsertShoppingListCommand = ; // UpsertShoppingListCommand | Shopping list to create

try {
    final response = api.createShoppingList(groupId, upsertShoppingListCommand);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->createShoppingList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **groupId** | **int**| Id of the group the shopping lists belong to. The \"All\" group is rejected with 400. | 
 **upsertShoppingListCommand** | [**UpsertShoppingListCommand**](UpsertShoppingListCommand.md)| Shopping list to create | 

### Return type

[**ShoppingList**](ShoppingList.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteShoppingList**
> deleteShoppingList(listId)

Delete shopping list

This will delete a shopping list and all of its items [group.shopping-lists.delete]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int listId = 56; // int | Id of the shopping list to operate on

try {
    api.deleteShoppingList(listId);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->deleteShoppingList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **listId** | **int**| Id of the shopping list to operate on | 

### Return type

void (empty response body)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteShoppingListItem**
> deleteShoppingListItem(itemId)

Delete shopping list item

This will delete an item from its shopping list [group.shopping-lists.update]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int itemId = 56; // int | Id of the shopping list item to operate on

try {
    api.deleteShoppingListItem(itemId);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->deleteShoppingListItem: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **itemId** | **int**| Id of the shopping list item to operate on | 

### Return type

void (empty response body)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getShoppingListsForGroup**
> BuiltList<ShoppingList> getShoppingListsForGroup(groupId)

Get shopping lists for a group

This will get every shopping list in a group, each with its items [group.shopping-lists.read]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int groupId = 56; // int | Id of the group the shopping lists belong to. The \"All\" group is rejected with 400.

try {
    final response = api.getShoppingListsForGroup(groupId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->getShoppingListsForGroup: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **groupId** | **int**| Id of the group the shopping lists belong to. The \"All\" group is rejected with 400. | 

### Return type

[**BuiltList&lt;ShoppingList&gt;**](ShoppingList.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **setShoppingListItemChecked**
> ShoppingListItem setShoppingListItemChecked(itemId, setShoppingListItemCheckedCommand)

Set whether a shopping list item is crossed off

This will move an item to the given checked state [group.shopping-lists.update]. It sets the state rather than toggling it, so concurrent requests converge; re-sending the current state changes nothing.

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int itemId = 56; // int | Id of the shopping list item to check off or un-check
final SetShoppingListItemCheckedCommand setShoppingListItemCheckedCommand = ; // SetShoppingListItemCheckedCommand | Target checked state

try {
    final response = api.setShoppingListItemChecked(itemId, setShoppingListItemCheckedCommand);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->setShoppingListItemChecked: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **itemId** | **int**| Id of the shopping list item to check off or un-check | 
 **setShoppingListItemCheckedCommand** | [**SetShoppingListItemCheckedCommand**](SetShoppingListItemCheckedCommand.md)| Target checked state | 

### Return type

[**ShoppingListItem**](ShoppingListItem.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **setShoppingListItemClassification**
> ShoppingListItem setShoppingListItemClassification(itemId, setFoodClassificationCommand)

Correct a shopping list item's health and seasonality tags

This will set the item's tags and remember the health rating for the group's future products [group.shopping-lists.update]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int itemId = 56; // int | Id of the shopping list item
final SetFoodClassificationCommand setFoodClassificationCommand = ; // SetFoodClassificationCommand | 

try {
    final response = api.setShoppingListItemClassification(itemId, setFoodClassificationCommand);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->setShoppingListItemClassification: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **itemId** | **int**| Id of the shopping list item | 
 **setFoodClassificationCommand** | [**SetFoodClassificationCommand**](SetFoodClassificationCommand.md)|  | 

### Return type

[**ShoppingListItem**](ShoppingListItem.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **streamShoppingListEvents**
> String streamShoppingListEvents(groupId)

Stream shopping list updates

Server-Sent Events stream of every shopping list mutation in the group [group.shopping-lists.read]. Each event is named after its ShoppingListEvent type and its data is a ShoppingListEvent as JSON. A comment heartbeat is sent every 25 seconds, and the server ends the stream after 15 minutes (or when the caller loses access) so that reconnecting re-authenticates. Events missed while disconnected are not replayed; refetch the lists after (re)connecting.

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int groupId = 56; // int | Id of the group to receive shopping list updates for

try {
    final response = api.streamShoppingListEvents(groupId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->streamShoppingListEvents: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **groupId** | **int**| Id of the group to receive shopping list updates for | 

### Return type

**String**

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: text/event-stream, application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **updateShoppingList**
> ShoppingList updateShoppingList(listId, upsertShoppingListCommand)

Rename shopping list

This will rename a shopping list [group.shopping-lists.update]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int listId = 56; // int | Id of the shopping list to operate on
final UpsertShoppingListCommand upsertShoppingListCommand = ; // UpsertShoppingListCommand | Shopping list to update

try {
    final response = api.updateShoppingList(listId, upsertShoppingListCommand);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->updateShoppingList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **listId** | **int**| Id of the shopping list to operate on | 
 **upsertShoppingListCommand** | [**UpsertShoppingListCommand**](UpsertShoppingListCommand.md)| Shopping list to update | 

### Return type

[**ShoppingList**](ShoppingList.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **updateShoppingListItem**
> ShoppingListItem updateShoppingListItem(itemId, upsertShoppingListItemCommand)

Update shopping list item

This will update an item's name, quantity and note [group.shopping-lists.update]

### Example
```dart
import 'package:openapi/api.dart';
// TODO Configure API key authorization: apiKeyAuth
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('apiKeyAuth').apiKeyPrefix = 'Bearer';

final api = Openapi().getShoppingListApi();
final int itemId = 56; // int | Id of the shopping list item to operate on
final UpsertShoppingListItemCommand upsertShoppingListItemCommand = ; // UpsertShoppingListItemCommand | Item to update

try {
    final response = api.updateShoppingListItem(itemId, upsertShoppingListItemCommand);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ShoppingListApi->updateShoppingListItem: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **itemId** | **int**| Id of the shopping list item to operate on | 
 **upsertShoppingListItemCommand** | [**UpsertShoppingListItemCommand**](UpsertShoppingListItemCommand.md)| Item to update | 

### Return type

[**ShoppingListItem**](ShoppingListItem.md)

### Authorization

[apiKeyAuth](../README.md#apiKeyAuth), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

