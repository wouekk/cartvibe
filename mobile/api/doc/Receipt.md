# openapi.model.Receipt

## Load the model package
```dart
import 'package:openapi/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**amount** | **String** | Receipt total amount | 
**categories** | [**BuiltList&lt;Category&gt;**](Category.md) | Categories associated to receipt | 
**comments** | [**BuiltList&lt;Comment&gt;**](Comment.md) | Comments associated to receipt | 
**customFields** | [**BuiltList&lt;CustomFieldValue&gt;**](CustomFieldValue.md) | Custom fields associated to receipt | 
**createdAt** | **String** |  | [optional] 
**createdBy** | **int** |  | [optional] 
**date** | **String** | Receipt date | 
**firstComment** | **String** | Text of the receipt's earliest comment the caller may see. Only populated by the paged receipt list (POST /receipt/group/{groupId}); absent when there is no such comment. | [optional] 
**searchMatches** | [**BuiltList&lt;ReceiptSearchMatch&gt;**](ReceiptSearchMatch.md) | The product lines that made the receipt match the list's search phrase. Only populated by the paged receipt list while a search is active; absent otherwise. | [optional] 
**groupId** | **int** | Group foreign key | 
**id** | **int** |  | 
**imageFiles** | [**BuiltList&lt;FileData&gt;**](FileData.md) | Files associated to receipt | [optional] 
**name** | **String** | Receipt name | 
**shopName** | **String** | The shop printed on the receipt (Auchan, Edeka, Rewe), read by the AI or typed by a person. Empty when unknown. | [optional] 
**originalAmount** | **String** | The amount as printed, when the receipt was in another currency than the main one; amount is then the converted amount | [optional] 
**originalCurrency** | **String** | ISO code of the currency the receipt was in; empty when it was in the main currency | [optional] 
**exchangeRate** | **String** | The rate used to convert (main currency per one unit of originalCurrency); null with an originalCurrency means the receipt is waiting for a rate | [optional] 
**paidByUserId** | **int** | User paid foreign key | 
**receiptItems** | [**BuiltList&lt;Item&gt;**](Item.md) | Items associated to receipt | 
**resolvedDate** | **String** | Date resolved | [optional] 
**status** | [**ReceiptStatus**](ReceiptStatus.md) |  | 
**tags** | [**BuiltList&lt;Tag&gt;**](Tag.md) | Tags associated to receipt | 
**updatedAt** | **String** |  | [optional] 
**createdByString** | **String** | Created by string, which is anything that is not a user | [optional] 

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


