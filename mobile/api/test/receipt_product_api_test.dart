import 'package:test/test.dart';
import 'package:openapi/openapi.dart';


/// tests for ReceiptProductApi
void main() {
  final instance = Openapi().getReceiptProductApi();

  group(ReceiptProductApi, () {
    // Get a receipt's products
    //
    // This will get the products the AI read off a receipt, and where reading them stands [group.receipts.read]
    //
    //Future<ReceiptProductsView> getReceiptProducts(int receiptId) async
    test('test getReceiptProducts', () async {
      // TODO
    });

    // Read the products of a group's older receipts
    //
    // This will queue every receipt in the group that has an image but has never had its products read [group.receipts.update]. Receipts are read a few at a time in the background.
    //
    //Future<QueuedReceiptsView> queueGroupReceiptProducts(int groupId) async
    test('test queueGroupReceiptProducts', () async {
      // TODO
    });

    // Read a receipt's products again
    //
    // This will queue the receipt to have its products read again by the AI [group.receipts.update]
    //
    //Future<ReceiptProductsView> readReceiptProducts(int receiptId) async
    test('test readReceiptProducts', () async {
      // TODO
    });

  });
}
